import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseQueryFromUrl } from "../../src/runtime/input.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = resolve(
  HERE,
  "validation-query-materialization-decomposition.mts",
);

const URL_COUNT = 128;
const URL_MASK = URL_COUNT - 1;

const SAMPLES = 21;
const TARGET_MS = 150;
const MIN_CALIBRATION_MS = 25;
const WARMUP_ITERATIONS = 100_000;

const scenarios = [
  "full-basic",
  "slice-basic",
  "write-basic",
  "full-duplicates",
  "slice-duplicates",
  "write-duplicates",
  "full-wide",
  "slice-wide",
  "write-wide",
] as const;

type Scenario = (typeof scenarios)[number];
type QueryResult = Record<string, string | string[]>;

interface Pair {
  readonly key: string;
  readonly value: string;
}

interface ScenarioResult {
  readonly scenario: Scenario;
  readonly iterations: number;
  readonly medianNs: number;
  readonly minNs: number;
  readonly maxNs: number;
  readonly cv: number;
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
  console.log("\nGelis P7-B6 query materialization cost decomposition");
  console.log(`Runtime:     bun ${Bun.version}`);
  console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);
  console.log(`URLs:        ${URL_COUNT}`);
  console.log(`Samples:     ${SAMPLES}`);
  console.log(`Target:      ${TARGET_MS} ms/sample`);
  console.log("Isolation:   fresh process per stage");
  console.log("\nDo not sum slice/write stages as exact parser cost.\n");

  const results: ScenarioResult[] = [];

  for (let index = 0; index < scenarios.length; index++) {
    const scenario = scenarios[index];

    if (scenario === undefined) {
      continue;
    }

    console.log(`[${index + 1}/${scenarios.length}] ${scenario}`);
    results.push(await runIsolatedScenario(scenario));
  }

  console.log("\nResults\n");

  console.table(
    results.map((result) => ({
      stage: result.scenario,
      "ns/op median": round(result.medianNs, 2),
      "ns/op min": round(result.minNs, 2),
      "ns/op max": round(result.maxNs, 2),
      "cv %": round(result.cv * 100, 2),
      iterations: result.iterations,
    })),
  );

  console.log("\nInterpretation: full-* is the production anchor.");
  console.log(
    "slice-* uses precomputed spans and measures substring materialization without result-object writes.",
  );
  console.log(
    "write-* uses pre-sliced pairs and measures null-prototype result construction/property writes without URL scanning or slicing.",
  );
  console.log(
    "These stages are diagnostic only and are not arithmetically additive.",
  );

  void sink;
}

async function runIsolatedScenario(
  scenario: Scenario,
): Promise<ScenarioResult> {
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
      [`Decomposition failed: ${scenario}`, stdout, stderr].join("\n"),
    );
  }

  const line = stdout
    .split(/\r?\n/)
    .find((value) => value.startsWith("RESULT "));

  if (!line) {
    throw new Error(`Missing result: ${scenario}\n${stdout}`);
  }

  const parsed: unknown = JSON.parse(line.slice("RESULT ".length));

  if (!isScenarioResult(parsed)) {
    throw new Error(`Invalid result: ${scenario}`);
  }

  return parsed;
}

function runChild(scenario: Scenario): void {
  const workload = workloadFromScenario(scenario);
  const urls = createUrls(workload);
  const spans = urls.map(findPairSpans);
  const pairs = urls.map((url, index) => {
    const urlSpans = spans[index];

    if (urlSpans === undefined) {
      throw new Error("Missing precomputed spans");
    }

    return materializePairs(url, urlSpans);
  });

  verifyPrecomputedWorkload(urls, pairs);

  const operation = createOperation(scenario, urls, spans, pairs);

  warmup(operation, WARMUP_ITERATIONS);

  const iterations = calibrate(operation);
  const samples: number[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const elapsed = measure(operation, iterations);

    samples.push(millisecondsToNsPerOp(elapsed, iterations));
  }

  const result: ScenarioResult = {
    scenario,
    iterations,
    medianNs: median(samples),
    minNs: Math.min(...samples),
    maxNs: Math.max(...samples),
    cv: coefficientOfVariation(samples),
    samples,
  };

  console.log(`RESULT ${JSON.stringify(result)}`);

  void sink;
}

function createOperation(
  scenario: Scenario,
  urls: readonly string[],
  spans: readonly (readonly number[])[],
  pairs: readonly (readonly Pair[])[],
): () => void {
  let cursor = 0;

  return () => {
    const index = cursor;

    cursor = (cursor + 1) & URL_MASK;

    const url = urls[index];
    const urlSpans = spans[index];
    const urlPairs = pairs[index];

    if (url === undefined || urlSpans === undefined || urlPairs === undefined) {
      throw new Error("Missing benchmark workload");
    }

    switch (scenario) {
      case "full-basic":
      case "full-duplicates":
      case "full-wide":
        sink = parseQueryFromUrl(url);
        return;

      case "slice-basic":
      case "slice-duplicates":
      case "slice-wide":
        sink = sliceFromSpans(url, urlSpans);
        return;

      case "write-basic":
      case "write-duplicates":
      case "write-wide":
        sink = writePairs(urlPairs);
        return;
    }
  };
}

function workloadFromScenario(
  scenario: Scenario,
): "basic" | "duplicates" | "wide" {
  if (scenario.endsWith("duplicates")) {
    return "duplicates";
  }

  if (scenario.endsWith("wide")) {
    return "wide";
  }

  return "basic";
}

function createUrls(workload: "basic" | "duplicates" | "wide"): string[] {
  const urls: string[] = [];

  for (let index = 0; index < URL_COUNT; index++) {
    switch (workload) {
      case "basic":
        urls.push(
          [
            "http://gelis.test/r/4999",
            `?page=${40 + (index % 10)}`,
            `&q=gelis${index}`,
          ].join(""),
        );
        break;

      case "duplicates":
        urls.push(
          [
            "http://gelis.test/r/4999",
            "?tag=a",
            "&tag=b",
            "&page=42",
            `&q=gelis${index}`,
          ].join(""),
        );
        break;

      case "wide":
        urls.push(
          [
            "http://gelis.test/r/4999",
            `?a=${index}`,
            "&b=two",
            "&c=three",
            "&d=four",
            "&e=five",
            "&f=six",
          ].join(""),
        );
        break;
    }
  }

  return urls;
}

/*
 * Flat span layout:
 * [keyStart, keyEnd, valueStart, valueEnd, ...]
 *
 * Spans are prepared outside the timed section so slice-* measures
 * substring materialization rather than delimiter discovery.
 */
function findPairSpans(url: string): number[] {
  const spans: number[] = [];

  const queryStart = url.indexOf("?");

  if (queryStart === -1) {
    return spans;
  }

  const hashStart = url.indexOf("#", queryStart + 1);
  const queryEnd = hashStart === -1 ? url.length : hashStart;

  let pairStart = queryStart + 1;

  while (pairStart < queryEnd) {
    const pairEndCandidate = url.indexOf("&", pairStart);
    const pairEnd =
      pairEndCandidate === -1 || pairEndCandidate > queryEnd
        ? queryEnd
        : pairEndCandidate;

    if (pairEnd > pairStart) {
      const equalsCandidate = url.indexOf("=", pairStart);

      const equals =
        equalsCandidate === -1 || equalsCandidate > pairEnd
          ? pairEnd
          : equalsCandidate;

      const valueStart = equals < pairEnd ? equals + 1 : pairEnd;

      spans.push(pairStart, equals, valueStart, pairEnd);
    }

    pairStart = pairEnd + 1;
  }

  return spans;
}

function materializePairs(url: string, spans: readonly number[]): Pair[] {
  const pairs: Pair[] = [];

  for (let index = 0; index < spans.length; index += 4) {
    const keyStart = spans[index];
    const keyEnd = spans[index + 1];
    const valueStart = spans[index + 2];
    const valueEnd = spans[index + 3];

    if (
      keyStart === undefined ||
      keyEnd === undefined ||
      valueStart === undefined ||
      valueEnd === undefined
    ) {
      throw new Error("Invalid precomputed span");
    }

    pairs.push({
      key: url.slice(keyStart, keyEnd),
      value: url.slice(valueStart, valueEnd),
    });
  }

  return pairs;
}

/*
 * Strings escape through the returned fixed-shape array. This does
 * include array allocation, so slice-* is only a localization signal,
 * not a directly subtractable component of full-*.
 */
function sliceFromSpans(url: string, spans: readonly number[]): string[] {
  const values = new Array<string>(spans.length / 2);

  let outputIndex = 0;

  for (let index = 0; index < spans.length; index += 4) {
    const keyStart = spans[index];
    const keyEnd = spans[index + 1];
    const valueStart = spans[index + 2];
    const valueEnd = spans[index + 3];

    if (
      keyStart === undefined ||
      keyEnd === undefined ||
      valueStart === undefined ||
      valueEnd === undefined
    ) {
      throw new Error("Invalid benchmark span");
    }

    values[outputIndex++] = url.slice(keyStart, keyEnd);
    values[outputIndex++] = url.slice(valueStart, valueEnd);
  }

  return values;
}

function writePairs(pairs: readonly Pair[]): QueryResult {
  const result = Object.create(null) as QueryResult;

  for (let index = 0; index < pairs.length; index++) {
    const pair = pairs[index];

    if (pair === undefined) {
      throw new Error("Missing benchmark pair");
    }

    const existing = result[pair.key];

    if (existing === undefined) {
      result[pair.key] = pair.value;
    } else if (Array.isArray(existing)) {
      existing.push(pair.value);
    } else {
      result[pair.key] = [existing, pair.value];
    }
  }

  return result;
}

function verifyPrecomputedWorkload(
  urls: readonly string[],
  pairs: readonly (readonly Pair[])[],
): void {
  for (let index = 0; index < urls.length; index++) {
    const url = urls[index];
    const urlPairs = pairs[index];

    if (url === undefined || urlPairs === undefined) {
      throw new Error("Missing correctness workload");
    }

    const current = parseQueryFromUrl(url);
    const reconstructed = writePairs(urlPairs);

    assertEquivalent(current, reconstructed, url);
  }
}

function assertEquivalent(
  current: QueryResult,
  reconstructed: QueryResult,
  url: string,
): void {
  const currentKeys = Object.keys(current);
  const reconstructedKeys = Object.keys(reconstructed);

  if (
    currentKeys.length !== reconstructedKeys.length ||
    currentKeys.some((key, index) => key !== reconstructedKeys[index])
  ) {
    throw new Error(`Query key mismatch: ${url}`);
  }

  for (const key of currentKeys) {
    const left = current[key];
    const right = reconstructed[key];

    if (Array.isArray(left)) {
      if (
        !Array.isArray(right) ||
        left.length !== right.length ||
        left.some((value, index) => value !== right[index])
      ) {
        throw new Error(`Query value mismatch for ${key}: ${url}`);
      }
    } else if (left !== right) {
      throw new Error(`Query value mismatch for ${key}: ${url}`);
    }
  }
}

function warmup(operation: () => void, iterations: number): void {
  for (let index = 0; index < iterations; index++) {
    operation();
  }
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

function millisecondsToNsPerOp(
  elapsedMilliseconds: number,
  iterations: number,
): number {
  return (elapsedMilliseconds * 1_000_000) / iterations;
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

function coefficientOfVariation(values: readonly number[]): number {
  const mean =
    values.reduce((total, value) => total + value, 0) / values.length;

  if (mean === 0) {
    return 0;
  }

  const variance =
    values.reduce((total, value) => {
      const difference = value - mean;

      return total + difference * difference;
    }, 0) / values.length;

  return Math.sqrt(variance) / mean;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function readScenario(): Scenario | undefined {
  const prefix = "--scenario=";

  const argument = process.argv.find((value) => value.startsWith(prefix));

  if (!argument) {
    return undefined;
  }

  const candidate = argument.slice(prefix.length);

  return scenarios.find((scenario) => scenario === candidate);
}

function isScenarioResult(value: unknown): value is ScenarioResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ScenarioResult>;

  return (
    typeof candidate.scenario === "string" &&
    scenarios.includes(candidate.scenario as Scenario) &&
    typeof candidate.iterations === "number" &&
    typeof candidate.medianNs === "number" &&
    typeof candidate.minNs === "number" &&
    typeof candidate.maxNs === "number" &&
    typeof candidate.cv === "number" &&
    Array.isArray(candidate.samples)
  );
}
