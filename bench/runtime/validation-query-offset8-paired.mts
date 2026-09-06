import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseQueryFromUrl } from "../../src/runtime/input.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = resolve(HERE, "validation-query-offset8-paired.mts");

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
  readonly order: "current-first" | "offset8-first";
  readonly currentNs: number;
  readonly offset8Ns: number;
  readonly deltaNs: number;
  readonly deltaPercent: number;
}

interface ScenarioResult {
  readonly scenario: Scenario;
  readonly iterations: number;
  readonly currentMedianNs: number;
  readonly offset8MedianNs: number;
  readonly pairedMedianDeltaNs: number;
  readonly pairedMedianDeltaPercent: number;
  readonly currentCv: number;
  readonly offset8Cv: number;
  readonly offset8Wins: number;
  readonly currentWins: number;
  readonly ties: number;
  readonly currentFirstMedianDeltaPercent: number;
  readonly offset8FirstMedianDeltaPercent: number;
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
    "Correctness: offset-8 parser matches current Request.url semantics PASS\n",
  );

  console.log("Gelis P7-B8 query offset-8 paired benchmark");
  console.log(`Runtime:     bun ${Bun.version}`);
  console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);
  console.log(`URLs:        ${URL_COUNT}`);
  console.log(`Samples:     ${SAMPLES}`);
  console.log(`Target:      ${TARGET_MS} ms/side/sample`);
  console.log("URL source:  Bun Request.url");
  console.log("Isolation:   fresh process per workload");
  console.log("Pairing:     current/offset8 same process");
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
      "offset8 ns": round(result.offset8MedianNs, 2),
      "paired Δ ns": round(result.pairedMedianDeltaNs, 2),
      "paired Δ %": round(result.pairedMedianDeltaPercent, 2),
      "current CV %": round(result.currentCv * 100, 2),
      "offset8 CV %": round(result.offset8Cv * 100, 2),
      "offset8 faster": `${result.offset8Wins}/${SAMPLES}`,
    })),
  );

  console.log("\nOrder-bias check\n");

  console.table(
    results.map((result) => ({
      scenario: result.scenario,
      "current-first Δ %": round(result.currentFirstMedianDeltaPercent, 2),
      "offset8-first Δ %": round(result.offset8FirstMedianDeltaPercent, 2),
    })),
  );

  console.log("\nInterpretation: negative delta favors offset-8.");
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
  const urls = createRuntimeUrls(scenario);

  const currentOperation = createOperation(parseQueryFromUrl, urls);
  const offset8Operation = createOperation(parseQueryFromUrlOffset8, urls);

  warmup(currentOperation, WARMUP_ITERATIONS);
  warmup(offset8Operation, WARMUP_ITERATIONS);

  const iterations = calibratePair(currentOperation, offset8Operation);

  const samples: PairSample[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const currentFirst = sample % 2 === 0;

    let currentElapsed: number;
    let offset8Elapsed: number;

    if (currentFirst) {
      currentElapsed = measure(currentOperation, iterations);
      offset8Elapsed = measure(offset8Operation, iterations);
    } else {
      offset8Elapsed = measure(offset8Operation, iterations);
      currentElapsed = measure(currentOperation, iterations);
    }

    const currentNs = millisecondsToNsPerOp(currentElapsed, iterations);
    const offset8Ns = millisecondsToNsPerOp(offset8Elapsed, iterations);

    const deltaNs = offset8Ns - currentNs;
    const deltaPercent = (offset8Ns / currentNs - 1) * 100;

    samples.push({
      sample: sample + 1,
      order: currentFirst ? "current-first" : "offset8-first",
      currentNs,
      offset8Ns,
      deltaNs,
      deltaPercent,
    });
  }

  const currentValues = samples.map((sample) => sample.currentNs);
  const offset8Values = samples.map((sample) => sample.offset8Ns);
  const deltaValues = samples.map((sample) => sample.deltaNs);
  const deltaPercentValues = samples.map((sample) => sample.deltaPercent);

  const currentFirstDeltas = samples
    .filter((sample) => sample.order === "current-first")
    .map((sample) => sample.deltaPercent);

  const offset8FirstDeltas = samples
    .filter((sample) => sample.order === "offset8-first")
    .map((sample) => sample.deltaPercent);

  let offset8Wins = 0;
  let currentWins = 0;
  let ties = 0;

  for (const sample of samples) {
    if (sample.offset8Ns < sample.currentNs) {
      offset8Wins++;
    } else if (sample.offset8Ns > sample.currentNs) {
      currentWins++;
    } else {
      ties++;
    }
  }

  const result: ScenarioResult = {
    scenario,
    iterations,
    currentMedianNs: median(currentValues),
    offset8MedianNs: median(offset8Values),
    pairedMedianDeltaNs: median(deltaValues),
    pairedMedianDeltaPercent: median(deltaPercentValues),
    currentCv: coefficientOfVariation(currentValues),
    offset8Cv: coefficientOfVariation(offset8Values),
    offset8Wins,
    currentWins,
    ties,
    currentFirstMedianDeltaPercent: median(currentFirstDeltas),
    offset8FirstMedianDeltaPercent: median(offset8FirstDeltas),
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

function createRuntimeUrls(scenario: Scenario): string[] {
  const urls: string[] = [];

  for (let index = 0; index < URL_COUNT; index++) {
    let rawUrl: string;

    switch (scenario) {
      case "basic":
        rawUrl = [
          "http://gelis.test/r/4999",
          `?page=${40 + (index % 10)}`,
          `&q=gelis${index}`,
        ].join("");
        break;

      case "encoded":
        rawUrl = [
          "https://gelis.test/r/4999",
          "?page=42",
          `&q=hello+world%20${index}`,
        ].join("");
        break;

      case "duplicates":
        rawUrl = [
          "http://127.0.0.1:3000/r/4999",
          "?tag=a",
          "&tag=b",
          "&page=42",
          `&q=gelis${index}`,
        ].join("");
        break;

      case "wide":
        rawUrl = [
          "https://[::1]:3000/r/4999",
          `?a=${index}`,
          "&b=two",
          "&c=three",
          "&d=four",
          "&e=five",
          "&f=six",
        ].join("");
        break;
    }

    urls.push(new Request(rawUrl).url);
  }

  return urls;
}

function parseQueryFromUrlOffset8(url: string): QueryResult {
  const result = Object.create(null) as QueryResult;

  const queryStart = url.indexOf("?", 8);

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
  const requestUrls = [
    "http://a/?page=42&q=gelis",
    "https://a/?page=42&q=gelis",
    "http://localhost/?flag",
    "http://127.0.0.1:3000/?empty=",
    "https://example.com/?=value",
    "https://example.com/path?tag=a&tag=b&tag=c",
    "http://[::1]:3000/path?q=hello+world",
    "https://example.com/path?q=hello%20world",
    "http://example.com/path?q=%2B%25",
    "https://example.com/path?a=one=two",
    "http://example.com/path?__proto__=safe&constructor=value&toString=x",
    "https://example.com/path?a=1&&b=2",
    "http://example.com/path?a=1#fragment",
  ];

  for (const rawUrl of requestUrls) {
    const url = new Request(rawUrl).url;

    const current = parseQueryFromUrl(url);
    const offset8 = parseQueryFromUrlOffset8(url);

    assertEquivalent(current, offset8, url);

    if (Object.getPrototypeOf(offset8) !== null) {
      throw new Error(`Candidate result prototype is not null: ${url}`);
    }
  }

  const invalidUrls = [
    "http://a/?q=%",
    "https://a/?q=%2",
    "http://localhost/?q=%GG",
  ];

  for (const rawUrl of invalidUrls) {
    const url = new Request(rawUrl).url;

    const currentError = captureError(() => parseQueryFromUrl(url));
    const offset8Error = captureError(() => parseQueryFromUrlOffset8(url));

    if (
      currentError === undefined ||
      offset8Error === undefined ||
      currentError.constructor !== offset8Error.constructor
    ) {
      throw new Error(`Malformed encoding behavior mismatch: ${url}`);
    }
  }
}

function assertEquivalent(
  current: QueryResult,
  offset8: QueryResult,
  url: string,
): void {
  const currentKeys = Object.keys(current);
  const offset8Keys = Object.keys(offset8);

  if (
    currentKeys.length !== offset8Keys.length ||
    currentKeys.some((key, index) => key !== offset8Keys[index])
  ) {
    throw new Error(`Query key mismatch: ${url}`);
  }

  for (const key of currentKeys) {
    const left = current[key];
    const right = offset8[key];

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

function calibratePair(current: () => void, offset8: () => void): number {
  let iterations = 1000;

  while (true) {
    const currentElapsed = measure(current, iterations);
    const offset8Elapsed = measure(offset8, iterations);

    const slowerElapsed = Math.max(currentElapsed, offset8Elapsed);

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
    typeof candidate.offset8MedianNs === "number" &&
    typeof candidate.pairedMedianDeltaNs === "number" &&
    typeof candidate.pairedMedianDeltaPercent === "number" &&
    typeof candidate.currentCv === "number" &&
    typeof candidate.offset8Cv === "number" &&
    typeof candidate.offset8Wins === "number" &&
    typeof candidate.currentWins === "number" &&
    typeof candidate.ties === "number" &&
    typeof candidate.currentFirstMedianDeltaPercent === "number" &&
    typeof candidate.offset8FirstMedianDeltaPercent === "number" &&
    Array.isArray(candidate.samples)
  );
}
