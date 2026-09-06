import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseQueryFromUrl } from "../../src/runtime/input.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = resolve(HERE, "validation-query-known-start-paired.mts");

const URL_COUNT = 128;
const URL_MASK = URL_COUNT - 1;

const SAMPLES = 31;
const TARGET_MS = 150;
const MIN_CALIBRATION_MS = 25;
const WARMUP_ITERATIONS = 100_000;

const scenarios = ["basic", "encoded", "duplicates", "wide"] as const;

type Scenario = (typeof scenarios)[number];
type QueryResult = Record<string, string | string[]>;

interface WorkloadEntry {
  readonly url: string;
  readonly queryStart: number;
}

interface PairSample {
  readonly sample: number;
  readonly order: "current-first" | "known-start-first";
  readonly currentNs: number;
  readonly knownStartNs: number;
  readonly deltaNs: number;
  readonly deltaPercent: number;
}

interface ScenarioResult {
  readonly scenario: Scenario;
  readonly iterations: number;
  readonly currentMedianNs: number;
  readonly knownStartMedianNs: number;
  readonly pairedMedianDeltaNs: number;
  readonly pairedMedianDeltaPercent: number;
  readonly currentCv: number;
  readonly knownStartCv: number;
  readonly knownStartWins: number;
  readonly currentWins: number;
  readonly ties: number;
  readonly currentFirstMedianDeltaPercent: number;
  readonly knownStartFirstMedianDeltaPercent: number;
  readonly samples: readonly PairSample[];
}

let sink: unknown;

const requestedScenario = readScenario();

if (requestedScenario !== undefined) {
  runChild(requestedScenario);
} else {
  verifyCorrectness();
  await runParent();
}

async function runParent(): Promise<void> {
  console.log(
    "Correctness: known-query-start parser matches current parser PASS\n",
  );

  console.log("Gelis P7-B7 known query-start upper-bound benchmark");
  console.log(`Runtime:     bun ${Bun.version}`);
  console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);
  console.log(`URLs:        ${URL_COUNT}`);
  console.log(`Samples:     ${SAMPLES}`);
  console.log(`Target:      ${TARGET_MS} ms/side/sample`);
  console.log("Isolation:   fresh process per workload");
  console.log("Pairing:     current/known-start same process");
  console.log("Order:       alternated every sample");
  console.log(
    "Important:   queryStart is precomputed outside the timed section.",
  );
  console.log(
    "Purpose:     measure the upper bound of reusing an already-known query index.\n",
  );

  const results: ScenarioResult[] = [];

  for (let index = 0; index < scenarios.length; index++) {
    const scenario = scenarios[index];

    if (scenario === undefined) {
      continue;
    }

    console.log(`[${index + 1}/${scenarios.length}] ${scenario}`);
    results.push(await runIsolatedScenario(scenario));
  }

  console.log("\nPaired results\n");

  console.table(
    results.map((result) => ({
      scenario: result.scenario,
      "current ns": round(result.currentMedianNs, 2),
      "known-start ns": round(result.knownStartMedianNs, 2),
      "paired Δ ns": round(result.pairedMedianDeltaNs, 2),
      "paired Δ %": round(result.pairedMedianDeltaPercent, 2),
      "current CV %": round(result.currentCv * 100, 2),
      "known-start CV %": round(result.knownStartCv * 100, 2),
      "candidate faster": `${result.knownStartWins}/${SAMPLES}`,
    })),
  );

  console.log("\nOrder-bias check\n");

  console.table(
    results.map((result) => ({
      scenario: result.scenario,
      "current-first Δ %": round(result.currentFirstMedianDeltaPercent, 2),
      "known-start-first Δ %": round(
        result.knownStartFirstMedianDeltaPercent,
        2,
      ),
    })),
  );

  console.log("\nInterpretation: negative delta favors known-start.");
  console.log("This is an upper-bound diagnostic, not a production candidate.");
  console.log(
    "Primary continuation gate: basic must improve by >5 ns and >3%, with both order halves negative.",
  );
  console.log(
    "If the primary gate fails, query-index reuse is not worth reopening any request-path boundary.",
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
      [`Paired benchmark failed: ${scenario}`, stdout, stderr].join("\n"),
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
  const workload = createWorkload(scenario);

  const currentOperation = createCurrentOperation(workload);
  const knownStartOperation = createKnownStartOperation(workload);

  warmup(currentOperation, WARMUP_ITERATIONS);
  warmup(knownStartOperation, WARMUP_ITERATIONS);

  const iterations = calibratePair(currentOperation, knownStartOperation);

  const samples: PairSample[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const currentFirst = sample % 2 === 0;

    let currentElapsed: number;
    let knownStartElapsed: number;

    if (currentFirst) {
      currentElapsed = measure(currentOperation, iterations);
      knownStartElapsed = measure(knownStartOperation, iterations);
    } else {
      knownStartElapsed = measure(knownStartOperation, iterations);
      currentElapsed = measure(currentOperation, iterations);
    }

    const currentNs = millisecondsToNsPerOp(currentElapsed, iterations);
    const knownStartNs = millisecondsToNsPerOp(knownStartElapsed, iterations);

    const deltaNs = knownStartNs - currentNs;
    const deltaPercent = (knownStartNs / currentNs - 1) * 100;

    samples.push({
      sample: sample + 1,
      order: currentFirst ? "current-first" : "known-start-first",
      currentNs,
      knownStartNs,
      deltaNs,
      deltaPercent,
    });
  }

  const currentValues = samples.map((sample) => sample.currentNs);
  const knownStartValues = samples.map((sample) => sample.knownStartNs);
  const deltaValues = samples.map((sample) => sample.deltaNs);
  const deltaPercentValues = samples.map((sample) => sample.deltaPercent);

  const currentFirstDeltas = samples
    .filter((sample) => sample.order === "current-first")
    .map((sample) => sample.deltaPercent);

  const knownStartFirstDeltas = samples
    .filter((sample) => sample.order === "known-start-first")
    .map((sample) => sample.deltaPercent);

  let knownStartWins = 0;
  let currentWins = 0;
  let ties = 0;

  for (const sample of samples) {
    if (sample.knownStartNs < sample.currentNs) {
      knownStartWins++;
    } else if (sample.knownStartNs > sample.currentNs) {
      currentWins++;
    } else {
      ties++;
    }
  }

  const result: ScenarioResult = {
    scenario,
    iterations,
    currentMedianNs: median(currentValues),
    knownStartMedianNs: median(knownStartValues),
    pairedMedianDeltaNs: median(deltaValues),
    pairedMedianDeltaPercent: median(deltaPercentValues),
    currentCv: coefficientOfVariation(currentValues),
    knownStartCv: coefficientOfVariation(knownStartValues),
    knownStartWins,
    currentWins,
    ties,
    currentFirstMedianDeltaPercent: median(currentFirstDeltas),
    knownStartFirstMedianDeltaPercent: median(knownStartFirstDeltas),
    samples,
  };

  console.log(`RESULT ${JSON.stringify(result)}`);

  void sink;
}

function createCurrentOperation(
  workload: readonly WorkloadEntry[],
): () => void {
  let cursor = 0;

  return () => {
    const entry = workload[cursor];

    cursor = (cursor + 1) & URL_MASK;

    if (entry === undefined) {
      throw new Error("Missing benchmark workload entry");
    }

    sink = parseQueryFromUrl(entry.url);
  };
}

function createKnownStartOperation(
  workload: readonly WorkloadEntry[],
): () => void {
  let cursor = 0;

  return () => {
    const entry = workload[cursor];

    cursor = (cursor + 1) & URL_MASK;

    if (entry === undefined) {
      throw new Error("Missing benchmark workload entry");
    }

    sink = parseQueryFromKnownStart(entry.url, entry.queryStart);
  };
}

function createWorkload(scenario: Scenario): WorkloadEntry[] {
  const workload: WorkloadEntry[] = [];

  for (let index = 0; index < URL_COUNT; index++) {
    let url: string;

    switch (scenario) {
      case "basic":
        url = [
          "http://gelis.test/r/4999",
          `?page=${40 + (index % 10)}`,
          `&q=gelis${index}`,
        ].join("");
        break;

      case "encoded":
        url = [
          "http://gelis.test/r/4999",
          "?page=42",
          `&q=hello+world%20${index}`,
        ].join("");
        break;

      case "duplicates":
        url = [
          "http://gelis.test/r/4999",
          "?tag=a",
          "&tag=b",
          "&page=42",
          `&q=gelis${index}`,
        ].join("");
        break;

      case "wide":
        url = [
          "http://gelis.test/r/4999",
          `?a=${index}`,
          "&b=two",
          "&c=three",
          "&d=four",
          "&e=five",
          "&f=six",
        ].join("");
        break;
    }

    const queryStart = url.indexOf("?");

    if (queryStart === -1) {
      throw new Error("Benchmark URL is missing query string");
    }

    workload.push({
      url,
      queryStart,
    });
  }

  return workload;
}

function parseQueryFromKnownStart(
  url: string,
  queryStart: number,
): QueryResult {
  const result = Object.create(null) as QueryResult;

  const hashStart = url.indexOf("#", queryStart + 1);
  const queryEnd = hashStart === -1 ? url.length : hashStart;

  let pairStart = queryStart + 1;

  if (pairStart >= queryEnd) {
    return result;
  }

  let equals = -1;

  let keyHasPlus = false;
  let keyHasPercent = false;

  let valueHasPlus = false;
  let valueHasPercent = false;

  for (let index = pairStart; index <= queryEnd; index++) {
    const atEnd = index === queryEnd;

    if (!atEnd) {
      const code = url.charCodeAt(index);

      if (code === 61 && equals === -1) {
        equals = index;
        continue;
      }

      if (code === 43) {
        if (equals === -1) {
          keyHasPlus = true;
        } else {
          valueHasPlus = true;
        }

        continue;
      }

      if (code === 37) {
        if (equals === -1) {
          keyHasPercent = true;
        } else {
          valueHasPercent = true;
        }

        continue;
      }

      if (code !== 38) {
        continue;
      }
    }

    const pairEnd = index;

    if (pairEnd > pairStart) {
      const actualEquals = equals === -1 ? pairEnd : equals;

      const valueStart = actualEquals < pairEnd ? actualEquals + 1 : pairEnd;

      let key = url.slice(pairStart, actualEquals);

      if (keyHasPlus || keyHasPercent) {
        key = decodeKnownQueryComponent(key, keyHasPlus, keyHasPercent);
      }

      let value = actualEquals < pairEnd ? url.slice(valueStart, pairEnd) : "";

      if (valueHasPlus || valueHasPercent) {
        value = decodeKnownQueryComponent(value, valueHasPlus, valueHasPercent);
      }

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

    equals = -1;

    keyHasPlus = false;
    keyHasPercent = false;

    valueHasPlus = false;
    valueHasPercent = false;
  }

  return result;
}

function decodeKnownQueryComponent(
  value: string,
  hasPlus: boolean,
  hasPercent: boolean,
): string {
  if (hasPlus) {
    value = value.replace(/\+/g, " ");
  }

  if (hasPercent) {
    value = decodeURIComponent(value);
  }

  return value;
}

function verifyCorrectness(): void {
  const urls = [
    "http://gelis.test/?page=42&q=gelis",
    "http://gelis.test/?flag",
    "http://gelis.test/?empty=",
    "http://gelis.test/?=value",
    "http://gelis.test/?tag=a&tag=b&tag=c",
    "http://gelis.test/?q=hello+world",
    "http://gelis.test/?q=hello%20world",
    "http://gelis.test/?q=%2B%25",
    "http://gelis.test/?a=one=two",
    "http://gelis.test/?__proto__=safe&constructor=value&toString=x",
    "http://gelis.test/?a=1&&b=2",
    "http://gelis.test/?a=1#fragment",
  ];

  for (const url of urls) {
    const queryStart = url.indexOf("?");

    if (queryStart === -1) {
      throw new Error(`Missing query start: ${url}`);
    }

    const current = parseQueryFromUrl(url);
    const knownStart = parseQueryFromKnownStart(url, queryStart);

    assertEquivalent(current, knownStart, url);

    if (Object.getPrototypeOf(knownStart) !== null) {
      throw new Error(`Candidate result prototype is not null: ${url}`);
    }
  }

  const invalidUrls = [
    "http://gelis.test/?q=%",
    "http://gelis.test/?q=%2",
    "http://gelis.test/?q=%GG",
  ];

  for (const url of invalidUrls) {
    const queryStart = url.indexOf("?");

    if (queryStart === -1) {
      throw new Error(`Missing query start: ${url}`);
    }

    const currentError = captureError(() => parseQueryFromUrl(url));
    const knownStartError = captureError(() =>
      parseQueryFromKnownStart(url, queryStart),
    );

    if (
      currentError === undefined ||
      knownStartError === undefined ||
      currentError.constructor !== knownStartError.constructor
    ) {
      throw new Error(`Malformed encoding behavior mismatch: ${url}`);
    }
  }
}

function assertEquivalent(
  current: QueryResult,
  knownStart: QueryResult,
  url: string,
): void {
  const currentKeys = Object.keys(current);
  const knownStartKeys = Object.keys(knownStart);

  if (
    currentKeys.length !== knownStartKeys.length ||
    currentKeys.some((key, index) => key !== knownStartKeys[index])
  ) {
    throw new Error(`Query key mismatch: ${url}`);
  }

  for (const key of currentKeys) {
    const left = current[key];
    const right = knownStart[key];

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

function captureError(operation: () => unknown): Error | undefined {
  try {
    operation();
    return undefined;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

function warmup(operation: () => void, iterations: number): void {
  for (let index = 0; index < iterations; index++) {
    operation();
  }
}

function calibratePair(current: () => void, knownStart: () => void): number {
  let iterations = 1000;

  while (true) {
    const currentElapsed = measure(current, iterations);
    const knownStartElapsed = measure(knownStart, iterations);

    const slowerElapsed = Math.max(currentElapsed, knownStartElapsed);

    if (slowerElapsed >= MIN_CALIBRATION_MS) {
      return Math.max(
        1,
        Math.round((iterations * TARGET_MS) / Math.max(slowerElapsed, 0.001)),
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
    typeof candidate.currentMedianNs === "number" &&
    typeof candidate.knownStartMedianNs === "number" &&
    typeof candidate.pairedMedianDeltaNs === "number" &&
    typeof candidate.pairedMedianDeltaPercent === "number" &&
    typeof candidate.currentCv === "number" &&
    typeof candidate.knownStartCv === "number" &&
    typeof candidate.knownStartWins === "number" &&
    typeof candidate.currentWins === "number" &&
    typeof candidate.ties === "number" &&
    typeof candidate.currentFirstMedianDeltaPercent === "number" &&
    typeof candidate.knownStartFirstMedianDeltaPercent === "number" &&
    Array.isArray(candidate.samples)
  );
}
