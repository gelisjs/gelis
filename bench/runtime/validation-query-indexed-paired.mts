import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseQueryFromUrl } from "../../src/runtime/input.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = resolve(HERE, "validation-query-indexed-paired.mts");

const URL_COUNT = 128;
const URL_MASK = URL_COUNT - 1;

const SAMPLES = 31;
const TARGET_MS = 150;
const MIN_CALIBRATION_MS = 25;
const WARMUP_ITERATIONS = 100_000;

const scenarios = ["basic", "encoded", "duplicates", "wide"] as const;

type Scenario = (typeof scenarios)[number];
type QueryResult = Record<string, string | string[]>;
type QueryParser = (url: string) => QueryResult;

interface PairSample {
  readonly sample: number;
  readonly order: "current-first" | "indexed-first";
  readonly currentNs: number;
  readonly indexedNs: number;
  readonly deltaNs: number;
  readonly deltaPercent: number;
}

interface ScenarioResult {
  readonly scenario: Scenario;
  readonly iterations: number;
  readonly currentMedianNs: number;
  readonly indexedMedianNs: number;
  readonly pairedMedianDeltaNs: number;
  readonly pairedMedianDeltaPercent: number;
  readonly currentCv: number;
  readonly indexedCv: number;
  readonly indexedWins: number;
  readonly currentWins: number;
  readonly ties: number;
  readonly currentFirstMedianDeltaPercent: number;
  readonly indexedFirstMedianDeltaPercent: number;
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
  runCorrectnessCorpus();

  console.log("Correctness: indexed parser matches current parser PASS\n");
  console.log("Gelis P7-B query indexed-search paired benchmark");
  console.log(`Runtime:     bun ${Bun.version}`);
  console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);
  console.log(`URLs:        ${URL_COUNT}`);
  console.log(`Samples:     ${SAMPLES}`);
  console.log(`Target:      ${TARGET_MS} ms/side/sample`);
  console.log("Isolation:   fresh process per workload");
  console.log("Pairing:     current/indexed same process");
  console.log("Order:       alternated every sample\n");

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
      "indexed ns": round(result.indexedMedianNs, 2),
      "paired Δ ns": round(result.pairedMedianDeltaNs, 2),
      "paired Δ %": round(result.pairedMedianDeltaPercent, 2),
      "current CV %": round(result.currentCv * 100, 2),
      "indexed CV %": round(result.indexedCv * 100, 2),
      "indexed faster": `${result.indexedWins}/${SAMPLES}`,
    })),
  );

  console.log("\nOrder-bias check\n");

  console.table(
    results.map((result) => ({
      scenario: result.scenario,
      "current-first Δ %": round(result.currentFirstMedianDeltaPercent, 2),
      "indexed-first Δ %": round(result.indexedFirstMedianDeltaPercent, 2),
    })),
  );

  console.log("\nInterpretation: negative delta favors indexed-search.");
  console.log(
    "Primary gate: basic must improve by >5 ns and >3%, with both order halves negative.",
  );
  console.log(
    "Safety gate: encoded, duplicates, and wide must not regress by >5 ns and >3% with consistent order direction.",
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
  const urls = createUrls(scenario);
  const currentOperation = createOperation(parseQueryFromUrl, urls);
  const indexedOperation = createOperation(parseQueryIndexed, urls);

  warmup(currentOperation, WARMUP_ITERATIONS);
  warmup(indexedOperation, WARMUP_ITERATIONS);

  const iterations = calibratePair(currentOperation, indexedOperation);
  const samples: PairSample[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const currentFirst = sample % 2 === 0;

    let currentElapsed: number;
    let indexedElapsed: number;

    if (currentFirst) {
      currentElapsed = measure(currentOperation, iterations);
      indexedElapsed = measure(indexedOperation, iterations);
    } else {
      indexedElapsed = measure(indexedOperation, iterations);
      currentElapsed = measure(currentOperation, iterations);
    }

    const currentNs = millisecondsToNsPerOp(currentElapsed, iterations);
    const indexedNs = millisecondsToNsPerOp(indexedElapsed, iterations);
    const deltaNs = indexedNs - currentNs;
    const deltaPercent = (indexedNs / currentNs - 1) * 100;

    samples.push({
      sample: sample + 1,
      order: currentFirst ? "current-first" : "indexed-first",
      currentNs,
      indexedNs,
      deltaNs,
      deltaPercent,
    });
  }

  const currentValues = samples.map((sample) => sample.currentNs);
  const indexedValues = samples.map((sample) => sample.indexedNs);
  const deltaValues = samples.map((sample) => sample.deltaNs);
  const deltaPercentValues = samples.map((sample) => sample.deltaPercent);

  const currentFirstDeltas = samples
    .filter((sample) => sample.order === "current-first")
    .map((sample) => sample.deltaPercent);

  const indexedFirstDeltas = samples
    .filter((sample) => sample.order === "indexed-first")
    .map((sample) => sample.deltaPercent);

  let indexedWins = 0;
  let currentWins = 0;
  let ties = 0;

  for (const sample of samples) {
    if (sample.indexedNs < sample.currentNs) {
      indexedWins++;
    } else if (sample.indexedNs > sample.currentNs) {
      currentWins++;
    } else {
      ties++;
    }
  }

  const result: ScenarioResult = {
    scenario,
    iterations,
    currentMedianNs: median(currentValues),
    indexedMedianNs: median(indexedValues),
    pairedMedianDeltaNs: median(deltaValues),
    pairedMedianDeltaPercent: median(deltaPercentValues),
    currentCv: coefficientOfVariation(currentValues),
    indexedCv: coefficientOfVariation(indexedValues),
    indexedWins,
    currentWins,
    ties,
    currentFirstMedianDeltaPercent: median(currentFirstDeltas),
    indexedFirstMedianDeltaPercent: median(indexedFirstDeltas),
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

      case "wide":
        urls.push(
          [
            "http://gelis.test/r/4999?",
            `a=${index}`,
            `&b=${index + 1}`,
            `&c=${index + 2}`,
            `&d=${index + 3}`,
            `&e=${index + 4}`,
            `&f=${index + 5}`,
            `&g=${index + 6}`,
            `&h=${index + 7}`,
          ].join(""),
        );
        break;
    }
  }

  return urls;
}

function parseQueryIndexed(url: string): QueryResult {
  const result = Object.create(null) as QueryResult;

  const queryStart = url.indexOf("?");

  if (queryStart === -1) {
    return result;
  }

  const hashStart = url.indexOf("#", queryStart + 1);
  const queryEnd = hashStart === -1 ? url.length : hashStart;

  let pairStart = queryStart + 1;

  while (pairStart < queryEnd) {
    const nextSeparator = url.indexOf("&", pairStart);
    const pairEnd =
      nextSeparator === -1 || nextSeparator > queryEnd
        ? queryEnd
        : nextSeparator;

    if (pairEnd > pairStart) {
      const nextEquals = url.indexOf("=", pairStart);
      const equals =
        nextEquals === -1 || nextEquals >= pairEnd ? pairEnd : nextEquals;

      let key = url.slice(pairStart, equals);
      let value = equals < pairEnd ? url.slice(equals + 1, pairEnd) : "";

      key = decodeQueryComponentIndexed(key);
      value = decodeQueryComponentIndexed(value);

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

function decodeQueryComponentIndexed(value: string): string {
  const plus = value.indexOf("+");
  const percent = value.indexOf("%");

  if (plus === -1) {
    return percent === -1 ? value : decodeURIComponent(value);
  }

  value = value.replace(/\+/g, " ");

  return percent === -1 ? value : decodeURIComponent(value);
}

function runCorrectnessCorpus(): void {
  const urls = [
    "http://gelis.test/r/1",
    "http://gelis.test/r/1?",
    "http://gelis.test/r/1?a=1",
    "http://gelis.test/r/1?a",
    "http://gelis.test/r/1?=x",
    "http://gelis.test/r/1?=",
    "http://gelis.test/r/1?a=1&b=2",
    "http://gelis.test/r/1?a=1&&b=2&",
    "http://gelis.test/r/1?&&",
    "http://gelis.test/r/1?a=b=c",
    "http://gelis.test/r/1?a=1&a=2",
    "http://gelis.test/r/1?a=1&a=2&a=3",
    "http://gelis.test/r/1?tag=a&tag=b&page=42&q=gelis",
    "http://gelis.test/r/1?hello+world=gelis+js",
    "http://gelis.test/r/1?q=hello%20world",
    "http://gelis.test/r/1?q=hello+world%20again",
    "http://gelis.test/r/1?%61=1&a=2",
    "http://gelis.test/r/1?q=%E2%9C%93",
    "http://gelis.test/r/1?q=%26%3D%2B",
    "http://gelis.test/r/1?a=1#fragment",
    "http://gelis.test/r/1?a=1&b=2#fragment",
    "http://gelis.test/r/1?x=%F0%9F%98%80",
  ];

  for (const url of urls) {
    const current = parseQueryFromUrl(url);
    const indexed = parseQueryIndexed(url);

    assertQueryResultEqual(current, indexed, url);
  }

  const malformedUrls = [
    "http://gelis.test/r/1?q=%",
    "http://gelis.test/r/1?q=%ZZ",
    "http://gelis.test/r/1?%ZZ=value",
  ];

  for (const url of malformedUrls) {
    const currentError = captureError(() => parseQueryFromUrl(url));
    const indexedError = captureError(() => parseQueryIndexed(url));

    if (!currentError || !indexedError) {
      throw new Error(`Malformed query behavior mismatch: ${url}`);
    }

    if (currentError.constructor !== indexedError.constructor) {
      throw new Error(`Malformed query error type mismatch: ${url}`);
    }
  }
}

function assertQueryResultEqual(
  left: QueryResult,
  right: QueryResult,
  url: string,
): void {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    throw new Error(`Query result key count mismatch: ${url}`);
  }

  for (let index = 0; index < leftKeys.length; index++) {
    const leftKey = leftKeys[index];
    const rightKey = rightKeys[index];

    if (
      leftKey === undefined ||
      rightKey === undefined ||
      leftKey !== rightKey
    ) {
      throw new Error(`Query result key mismatch: ${url}`);
    }

    const leftValue = left[leftKey];
    const rightValue = right[rightKey];

    if (!queryValueEqual(leftValue, rightValue)) {
      throw new Error(`Query result value mismatch for ${leftKey}: ${url}`);
    }
  }
}

function queryValueEqual(
  left: string | string[] | undefined,
  right: string | string[] | undefined,
): boolean {
  if (typeof left === "string" || typeof right === "string") {
    return left === right;
  }

  if (left === undefined || right === undefined) {
    return left === right;
  }

  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
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

function calibratePair(current: () => void, indexed: () => void): number {
  let iterations = 1000;

  while (true) {
    const currentElapsed = measure(current, iterations);
    const indexedElapsed = measure(indexed, iterations);
    const slowerElapsed = Math.max(currentElapsed, indexedElapsed);

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

  const value = argument.slice(prefix.length);

  return scenarios.find((scenario) => scenario === value);
}

function isScenarioResult(value: unknown): value is ScenarioResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ScenarioResult>;

  return (
    typeof candidate.scenario === "string" &&
    typeof candidate.iterations === "number" &&
    typeof candidate.currentMedianNs === "number" &&
    typeof candidate.indexedMedianNs === "number" &&
    typeof candidate.pairedMedianDeltaNs === "number" &&
    typeof candidate.pairedMedianDeltaPercent === "number" &&
    typeof candidate.currentCv === "number" &&
    typeof candidate.indexedCv === "number" &&
    typeof candidate.indexedWins === "number" &&
    typeof candidate.currentWins === "number" &&
    typeof candidate.ties === "number" &&
    typeof candidate.currentFirstMedianDeltaPercent === "number" &&
    typeof candidate.indexedFirstMedianDeltaPercent === "number" &&
    Array.isArray(candidate.samples)
  );
}
