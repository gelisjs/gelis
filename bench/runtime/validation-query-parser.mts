import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseQueryFromUrl } from "../../src/runtime/input.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = resolve(HERE, "validation-query-parser.mts");

const SAMPLES = 11;
const TARGET_MS = 120;
const MIN_CALIBRATION_MS = 20;
const WARMUP_ITERATIONS = 50_000;

const URL_COUNT = 128;

const scenarios = [
  "current-basic",
  "raw-basic",
  "global-fast-basic",
  "url-search-params-basic",

  "current-encoded",
  "global-fast-encoded",

  "current-duplicates",
  "raw-duplicates",
  "global-fast-duplicates",
] as const;

type Scenario = (typeof scenarios)[number];

interface ResultRow {
  readonly scenario: Scenario;
  readonly nsPerOp: number;
  readonly opsPerSecond: number;
  readonly samples: readonly number[];
}

let sink: unknown;

const requestedScenario = readScenario();

if (requestedScenario !== undefined) {
  runChild(requestedScenario);
} else {
  await runParent();
}

async function runParent(): Promise<void> {
  const rows: ResultRow[] = [];

  console.log("\nGelis query parser experiment");
  console.log(`Runtime:   bun ${Bun.version}`);
  console.log(`CPU:       ${cpus()[0]?.model ?? "unknown"}`);
  console.log(`URLs:      ${URL_COUNT}`);
  console.log(`Samples:   ${SAMPLES}`);
  console.log("Isolation: fresh process per scenario\n");

  for (let index = 0; index < scenarios.length; index++) {
    const scenario = scenarios[index];

    if (scenario === undefined) {
      continue;
    }

    console.log(`[${index + 1}/${scenarios.length}] ${scenario}`);

    rows.push(await runIsolated(scenario));
  }

  console.log("\nParser results\n");

  console.table(
    rows.map((row) => ({
      scenario: row.scenario,
      "ns/op": round(row.nsPerOp, 2),
      "ops/s": Math.round(row.opsPerSecond).toLocaleString("en-US"),
    })),
  );

  const values = new Map(rows.map((row) => [row.scenario, row.nsPerOp]));

  const currentBasic = requireResult(values, "current-basic");
  const rawBasic = requireResult(values, "raw-basic");
  const globalFastBasic = requireResult(values, "global-fast-basic");
  const urlSearchParamsBasic = requireResult(values, "url-search-params-basic");

  const currentEncoded = requireResult(values, "current-encoded");
  const globalFastEncoded = requireResult(values, "global-fast-encoded");

  const currentDuplicates = requireResult(values, "current-duplicates");
  const rawDuplicates = requireResult(values, "raw-duplicates");
  const globalFastDuplicates = requireResult(values, "global-fast-duplicates");

  console.log("\nComparisons\n");

  console.table([
    comparison("raw basic vs current", rawBasic, currentBasic),
    comparison("global fast basic vs current", globalFastBasic, currentBasic),
    comparison(
      "URLSearchParams basic vs current",
      urlSearchParamsBasic,
      currentBasic,
    ),
    comparison(
      "global fast encoded vs current",
      globalFastEncoded,
      currentEncoded,
    ),
    comparison("raw duplicates vs current", rawDuplicates, currentDuplicates),
    comparison(
      "global fast duplicates vs current",
      globalFastDuplicates,
      currentDuplicates,
    ),
  ]);

  console.log("\nPotential query-fetch impact\n");

  const QUERY_FETCH_OVERHEAD_REFERENCE = 350.65;

  console.table([
    {
      candidate: "raw basic theoretical",
      "parser saving ns": round(currentBasic - rawBasic, 2),
      "of query overhead %": round(
        ((currentBasic - rawBasic) / QUERY_FETCH_OVERHEAD_REFERENCE) * 100,
        2,
      ),
    },
    {
      candidate: "global fast basic",
      "parser saving ns": round(currentBasic - globalFastBasic, 2),
      "of query overhead %": round(
        ((currentBasic - globalFastBasic) / QUERY_FETCH_OVERHEAD_REFERENCE) *
          100,
        2,
      ),
    },
  ]);

  void sink;
}

async function runIsolated(scenario: Scenario): Promise<ResultRow> {
  const child = Bun.spawn([process.execPath, CHILD, `--scenario=${scenario}`], {
    cwd: resolve(HERE, "../.."),
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdoutPromise = new Response(child.stdout).text();
  const stderrPromise = new Response(child.stderr).text();

  const exitCode = await child.exited;

  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

  if (exitCode !== 0) {
    throw new Error(
      [`Query parser experiment failed: ${scenario}`, stdout, stderr].join(
        "\n",
      ),
    );
  }

  const line = stdout
    .split(/\r?\n/)
    .find((value) => value.startsWith("RESULT "));

  if (!line) {
    throw new Error(`Missing result for ${scenario}\n${stdout}`);
  }

  const parsed: unknown = JSON.parse(line.slice("RESULT ".length));

  if (!isResultRow(parsed)) {
    throw new Error(`Invalid result for ${scenario}`);
  }

  return parsed;
}

function runChild(scenario: Scenario): void {
  const operation = createOperation(scenario);

  for (let index = 0; index < WARMUP_ITERATIONS; index++) {
    operation();
  }

  const iterations = calibrate(operation);
  const samples: number[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const elapsed = measure(operation, iterations);

    samples.push((elapsed * 1_000_000) / iterations);
  }

  const nsPerOp = median(samples);

  const row: ResultRow = {
    scenario,
    nsPerOp,
    opsPerSecond: 1_000_000_000 / nsPerOp,
    samples,
  };

  console.log(`RESULT ${JSON.stringify(row)}`);

  void sink;
}

function createOperation(scenario: Scenario): () => void {
  const kind = scenarioKind(scenario);
  const urls = createUrls(kind);

  let cursor = 0;

  switch (scenario) {
    case "current-basic":
    case "current-encoded":
    case "current-duplicates":
      return () => {
        const url = urls[cursor];

        cursor = (cursor + 1) & (URL_COUNT - 1);

        if (url === undefined) {
          throw new Error("Missing benchmark URL");
        }

        sink = parseQueryFromUrl(url);
      };

    case "raw-basic":
    case "raw-duplicates":
      return () => {
        const url = urls[cursor];

        cursor = (cursor + 1) & (URL_COUNT - 1);

        if (url === undefined) {
          throw new Error("Missing benchmark URL");
        }

        sink = parseRawQueryFromUrl(url);
      };

    case "global-fast-basic":
    case "global-fast-encoded":
    case "global-fast-duplicates":
      return () => {
        const url = urls[cursor];

        cursor = (cursor + 1) & (URL_COUNT - 1);

        if (url === undefined) {
          throw new Error("Missing benchmark URL");
        }

        sink = parseQueryGlobalFast(url);
      };

    case "url-search-params-basic":
      return () => {
        const url = urls[cursor];

        cursor = (cursor + 1) & (URL_COUNT - 1);

        if (url === undefined) {
          throw new Error("Missing benchmark URL");
        }

        sink = parseWithUrlSearchParams(url);
      };
  }
}

function createUrls(kind: "basic" | "encoded" | "duplicates"): string[] {
  const urls: string[] = [];

  for (let index = 0; index < URL_COUNT; index++) {
    switch (kind) {
      case "basic":
        urls.push(
          `http://gelis.test/r/4999?page=${40 + (index % 10)}&q=gelis${index}`,
        );
        break;

      case "encoded":
        urls.push(`http://gelis.test/r/4999?page=42&q=hello+world%20${index}`);
        break;

      case "duplicates":
        urls.push(
          `http://gelis.test/r/4999?tag=a&tag=b&page=42&q=gelis${index}`,
        );
        break;
    }
  }

  return urls;
}

/*
 * Production-semantics candidate.
 *
 * Detect whether any query component requires decoding once.
 *
 * Common unencoded queries use the raw fast parser.
 * Encoded queries fall back to the current accepted parser.
 */
function parseQueryGlobalFast(url: string): Record<string, string | string[]> {
  const queryStart = url.indexOf("?");

  if (queryStart === -1) {
    return Object.create(null) as Record<string, string | string[]>;
  }

  const hashStart = url.indexOf("#", queryStart + 1);
  const queryEnd = hashStart === -1 ? url.length : hashStart;

  const valueStart = queryStart + 1;

  if (valueStart >= queryEnd) {
    return Object.create(null) as Record<string, string | string[]>;
  }

  const plus = url.indexOf("+", valueStart);
  const percent = url.indexOf("%", valueStart);

  const requiresDecode =
    (plus !== -1 && plus < queryEnd) || (percent !== -1 && percent < queryEnd);

  if (requiresDecode) {
    return parseQueryFromUrl(url);
  }

  return parseRawQueryRange(url, valueStart, queryEnd);
}

/*
 * Theoretical fast-path lower bound for queries that require
 * no percent or plus decoding.
 *
 * This is not a complete replacement for the production parser.
 */
function parseRawQueryFromUrl(url: string): Record<string, string | string[]> {
  const queryStart = url.indexOf("?");

  if (queryStart === -1) {
    return Object.create(null) as Record<string, string | string[]>;
  }

  const hashStart = url.indexOf("#", queryStart + 1);
  const queryEnd = hashStart === -1 ? url.length : hashStart;

  return parseRawQueryRange(url, queryStart + 1, queryEnd);
}

function parseRawQueryRange(
  url: string,
  queryStart: number,
  queryEnd: number,
): Record<string, string | string[]> {
  const result = Object.create(null) as Record<string, string | string[]>;

  let pairStart = queryStart;

  while (pairStart < queryEnd) {
    let pairEnd = url.indexOf("&", pairStart);

    if (pairEnd === -1 || pairEnd > queryEnd) {
      pairEnd = queryEnd;
    }

    if (pairEnd > pairStart) {
      let equals = url.indexOf("=", pairStart);

      if (equals === -1 || equals > pairEnd) {
        equals = pairEnd;
      }

      const key = url.slice(pairStart, equals);
      const value = equals < pairEnd ? url.slice(equals + 1, pairEnd) : "";

      const existing = result[key];

      if (existing === undefined) {
        result[key] = value;
      } else if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        result[key] = [existing, value];
      }
    }

    pairStart = pairEnd + 1;
  }

  return result;
}

function parseWithUrlSearchParams(
  url: string,
): Record<string, string | string[]> {
  const result = Object.create(null) as Record<string, string | string[]>;

  const queryStart = url.indexOf("?");

  if (queryStart === -1) {
    return result;
  }

  const hashStart = url.indexOf("#", queryStart + 1);
  const queryEnd = hashStart === -1 ? url.length : hashStart;

  const params = new URLSearchParams(url.slice(queryStart + 1, queryEnd));

  for (const [key, value] of params) {
    const existing = result[key];

    if (existing === undefined) {
      result[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      result[key] = [existing, value];
    }
  }

  return result;
}

function scenarioKind(scenario: Scenario): "basic" | "encoded" | "duplicates" {
  if (scenario.includes("encoded")) {
    return "encoded";
  }

  if (scenario.includes("duplicates")) {
    return "duplicates";
  }

  return "basic";
}

function calibrate(operation: () => void): number {
  let iterations = 1000;

  while (true) {
    const elapsed = measure(operation, iterations);

    if (elapsed >= MIN_CALIBRATION_MS) {
      return Math.max(
        1,
        Math.round((iterations * TARGET_MS) / Math.max(elapsed, 0.001)),
      );
    }

    iterations *= 2;
  }
}

function measure(operation: () => void, iterations: number): number {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    operation();
  }

  return performance.now() - start;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    const value = sorted[middle];

    if (value === undefined) {
      throw new Error("Cannot compute median of empty samples");
    }

    return value;
  }

  const left = sorted[middle - 1];
  const right = sorted[middle];

  if (left === undefined || right === undefined) {
    throw new Error("Cannot compute median of empty samples");
  }

  return (left + right) / 2;
}

function comparison(
  label: string,
  candidate: number,
  baseline: number,
): {
  readonly comparison: string;
  readonly "candidate ns": number;
  readonly "baseline ns": number;
  readonly "delta ns": number;
  readonly "delta %": number;
} {
  return {
    comparison: label,
    "candidate ns": round(candidate, 2),
    "baseline ns": round(baseline, 2),
    "delta ns": round(candidate - baseline, 2),
    "delta %": round((candidate / baseline - 1) * 100, 2),
  };
}

function readScenario(): Scenario | undefined {
  const prefix = "--scenario=";

  const argument = process.argv.find((value) => value.startsWith(prefix));

  if (!argument) {
    return undefined;
  }

  const value = argument.slice(prefix.length);

  if (!scenarios.includes(value as Scenario)) {
    throw new Error(`Unknown query parser scenario: ${value}`);
  }

  return value as Scenario;
}

function requireResult(
  values: ReadonlyMap<Scenario, number>,
  scenario: Scenario,
): number {
  const value = values.get(scenario);

  if (value === undefined) {
    throw new Error(`Missing result: ${scenario}`);
  }

  return value;
}

function isResultRow(value: unknown): value is ResultRow {
  return (
    value !== null &&
    typeof value === "object" &&
    "scenario" in value &&
    typeof value.scenario === "string" &&
    scenarios.includes(value.scenario as Scenario) &&
    "nsPerOp" in value &&
    typeof value.nsPerOp === "number" &&
    "opsPerSecond" in value &&
    typeof value.opsPerSecond === "number" &&
    "samples" in value &&
    Array.isArray(value.samples) &&
    value.samples.every((sample) => typeof sample === "number")
  );
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}
