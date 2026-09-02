import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseQueryFromUrl } from "../../src/runtime/input.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = resolve(HERE, "validation-query-parser-paired.mts");

const URL_COUNT = 128;
const URL_MASK = URL_COUNT - 1;

const SAMPLES = 21;

const TARGET_MS = 150;
const MIN_CALIBRATION_MS = 25;

const WARMUP_ITERATIONS = 100_000;

const scenarios = ["basic", "encoded", "duplicates"] as const;

type Scenario = (typeof scenarios)[number];

type QueryResult = Record<string, string | string[]>;

type QueryParser = (url: string) => QueryResult;

interface PairSample {
  readonly sample: number;
  readonly order: "current-first" | "fused-first";

  readonly currentNs: number;
  readonly fusedNs: number;

  readonly deltaNs: number;
  readonly deltaPercent: number;
}

interface ScenarioResult {
  readonly scenario: Scenario;

  readonly iterations: number;

  readonly currentMedianNs: number;
  readonly fusedMedianNs: number;

  readonly pairedMedianDeltaNs: number;
  readonly pairedMedianDeltaPercent: number;

  readonly currentCv: number;
  readonly fusedCv: number;

  readonly fusedWins: number;
  readonly currentWins: number;
  readonly ties: number;

  readonly currentFirstMedianDeltaPercent: number;
  readonly fusedFirstMedianDeltaPercent: number;

  readonly samples: readonly PairSample[];
}

let sink: unknown;

const requestedScenario = readScenario();

if (requestedScenario !== undefined) {
  runChild(requestedScenario);
} else {
  await runParent();
}

async function runParent(): Promise<void> {
  console.log("\nGelis query parser paired benchmark");

  console.log(`Runtime:    bun ${Bun.version}`);
  console.log(`CPU:        ${cpus()[0]?.model ?? "unknown"}`);
  console.log(`URLs:       ${URL_COUNT}`);
  console.log(`Samples:    ${SAMPLES}`);
  console.log("Isolation:  fresh process per workload");
  console.log("Pairing:    current/fused same process");
  console.log("Order:      alternated every sample\n");

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

      "fused ns": round(result.fusedMedianNs, 2),

      "paired Δ ns": round(result.pairedMedianDeltaNs, 2),

      "paired Δ %": round(result.pairedMedianDeltaPercent, 2),

      "current CV %": round(result.currentCv * 100, 2),

      "fused CV %": round(result.fusedCv * 100, 2),

      wins: `${result.fusedWins}/${SAMPLES}`,
    })),
  );

  console.log("\nOrder-bias check\n");

  console.table(
    results.map((result) => ({
      scenario: result.scenario,

      "current-first Δ %": round(result.currentFirstMedianDeltaPercent, 2),

      "fused-first Δ %": round(result.fusedFirstMedianDeltaPercent, 2),
    })),
  );

  console.log("\nInterpretation: negative delta favors fused.");

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
  const urls = createUrls(scenario);

  const currentOperation = createOperation(parseQueryFromUrl, urls);

  const fusedOperation = createOperation(parseQueryFused, urls);

  warmup(currentOperation, WARMUP_ITERATIONS);

  warmup(fusedOperation, WARMUP_ITERATIONS);

  /*
   * Both parsers use exactly the same
   * iteration count.
   *
   * Calibration uses whichever operation
   * is slower so one side cannot get a
   * systematically different measurement
   * duration.
   */
  const iterations = calibratePair(currentOperation, fusedOperation);

  const samples: PairSample[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const currentFirst = sample % 2 === 0;

    let currentElapsed: number;
    let fusedElapsed: number;

    if (currentFirst) {
      currentElapsed = measure(currentOperation, iterations);

      fusedElapsed = measure(fusedOperation, iterations);
    } else {
      fusedElapsed = measure(fusedOperation, iterations);

      currentElapsed = measure(currentOperation, iterations);
    }

    const currentNs = millisecondsToNsPerOp(currentElapsed, iterations);

    const fusedNs = millisecondsToNsPerOp(fusedElapsed, iterations);

    const deltaNs = fusedNs - currentNs;

    const deltaPercent = (fusedNs / currentNs - 1) * 100;

    samples.push({
      sample: sample + 1,

      order: currentFirst ? "current-first" : "fused-first",

      currentNs,
      fusedNs,

      deltaNs,
      deltaPercent,
    });
  }

  const currentValues = samples.map((sample) => sample.currentNs);

  const fusedValues = samples.map((sample) => sample.fusedNs);

  const deltaValues = samples.map((sample) => sample.deltaNs);

  const deltaPercentValues = samples.map((sample) => sample.deltaPercent);

  const currentFirstDeltas = samples
    .filter((sample) => sample.order === "current-first")
    .map((sample) => sample.deltaPercent);

  const fusedFirstDeltas = samples
    .filter((sample) => sample.order === "fused-first")
    .map((sample) => sample.deltaPercent);

  let fusedWins = 0;
  let currentWins = 0;
  let ties = 0;

  for (const sample of samples) {
    if (sample.fusedNs < sample.currentNs) {
      fusedWins++;
    } else if (sample.fusedNs > sample.currentNs) {
      currentWins++;
    } else {
      ties++;
    }
  }

  const result: ScenarioResult = {
    scenario,

    iterations,

    currentMedianNs: median(currentValues),

    fusedMedianNs: median(fusedValues),

    pairedMedianDeltaNs: median(deltaValues),

    pairedMedianDeltaPercent: median(deltaPercentValues),

    currentCv: coefficientOfVariation(currentValues),

    fusedCv: coefficientOfVariation(fusedValues),

    fusedWins,
    currentWins,
    ties,

    currentFirstMedianDeltaPercent: median(currentFirstDeltas),

    fusedFirstMedianDeltaPercent: median(fusedFirstDeltas),

    samples,
  };

  console.log(`RESULT ${JSON.stringify(result)}`);

  void sink;
}

function createOperation(
  parser: QueryParser,
  urls: readonly string[],
): () => void {
  let cursor = 0;

  return () => {
    const url = urls[cursor];

    cursor = (cursor + 1) & URL_MASK;

    if (url === undefined) {
      throw new Error("Missing benchmark URL");
    }

    sink = parser(url);
  };
}

function createUrls(scenario: Scenario): string[] {
  const urls: string[] = [];

  for (let index = 0; index < URL_COUNT; index++) {
    switch (scenario) {
      case "basic":
        urls.push(
          [
            "http://gelis.test/r/4999",
            `?page=${40 + (index % 10)}`,
            `&q=gelis${index}`,
          ].join(""),
        );

        break;

      case "encoded":
        urls.push(
          [
            "http://gelis.test/r/4999",
            "?page=42",
            `&q=hello+world%20${index}`,
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
    }
  }

  return urls;
}

function parseQueryFused(url: string): QueryResult {
  const result = Object.create(null) as QueryResult;

  const queryStart = url.indexOf("?");

  if (queryStart === -1) {
    return result;
  }

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

      // =
      if (code === 61 && equals === -1) {
        equals = index;

        continue;
      }

      // +
      if (code === 43) {
        if (equals === -1) {
          keyHasPlus = true;
        } else {
          valueHasPlus = true;
        }

        continue;
      }

      // %
      if (code === 37) {
        if (equals === -1) {
          keyHasPercent = true;
        } else {
          valueHasPercent = true;
        }

        continue;
      }

      // &
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

function warmup(operation: () => void, iterations: number): void {
  for (let index = 0; index < iterations; index++) {
    operation();
  }
}

function calibratePair(current: () => void, fused: () => void): number {
  let iterations = 1000;

  while (true) {
    const currentElapsed = measure(current, iterations);

    const fusedElapsed = measure(fused, iterations);

    const slowerElapsed = Math.max(currentElapsed, fusedElapsed);

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

function readScenario(): Scenario | undefined {
  const prefix = "--scenario=";

  const argument = process.argv.find((value) => value.startsWith(prefix));

  if (!argument) {
    return undefined;
  }

  const value = argument.slice(prefix.length);

  if (!scenarios.includes(value as Scenario)) {
    throw new Error(`Unknown paired scenario: ${value}`);
  }

  return value as Scenario;
}

function isScenarioResult(value: unknown): value is ScenarioResult {
  return (
    value !== null &&
    typeof value === "object" &&
    "scenario" in value &&
    typeof value.scenario === "string" &&
    scenarios.includes(value.scenario as Scenario) &&
    "iterations" in value &&
    typeof value.iterations === "number" &&
    "currentMedianNs" in value &&
    typeof value.currentMedianNs === "number" &&
    "fusedMedianNs" in value &&
    typeof value.fusedMedianNs === "number" &&
    "pairedMedianDeltaNs" in value &&
    typeof value.pairedMedianDeltaNs === "number" &&
    "pairedMedianDeltaPercent" in value &&
    typeof value.pairedMedianDeltaPercent === "number" &&
    "fusedWins" in value &&
    typeof value.fusedWins === "number" &&
    "samples" in value &&
    Array.isArray(value.samples)
  );
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}
