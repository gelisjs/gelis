import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  queryAsyncSchema,
  type QueryOutput,
} from "../http/validation/schemas.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = resolve(HERE, "validation-async-paired.mts");

const SAMPLES = 21;
const TARGET_MS = 150;
const MIN_CALIBRATION_MS = 25;
const WARMUP_ITERATIONS = 20_000;

const RAW_QUERY = {
  page: "42",
  q: "gelis",
};

const pairs = [
  "current-to-direct",
  "current-to-schema-promise",
  "current-to-native-fast",
  "direct-to-trusted",
  "direct-to-await",
] as const;

type PairName = (typeof pairs)[number];

type ValidationResult =
  | {
      readonly value: QueryOutput;
      readonly issues?: undefined;
    }
  | {
      readonly issues: readonly unknown[];
    };

type AsyncOperation = () => Promise<QueryOutput>;

interface PairDefinition {
  readonly baselineName: string;
  readonly candidateName: string;
  readonly baseline: AsyncOperation;
  readonly candidate: AsyncOperation;
}

interface PairSample {
  readonly order: "baseline-first" | "candidate-first";

  readonly baselineNs: number;
  readonly candidateNs: number;

  readonly deltaNs: number;
  readonly deltaPercent: number;
}

interface PairResult {
  readonly pair: PairName;

  readonly baselineName: string;
  readonly candidateName: string;

  readonly iterations: number;

  readonly baselineMedianNs: number;
  readonly candidateMedianNs: number;

  readonly pairedMedianDeltaNs: number;
  readonly pairedMedianDeltaPercent: number;

  readonly baselineCv: number;
  readonly candidateCv: number;

  readonly candidateWins: number;

  readonly baselineFirstMedianDeltaPercent: number;
  readonly candidateFirstMedianDeltaPercent: number;

  readonly samples: readonly PairSample[];
}

let sink: unknown;

const requestedPair = readPair();

if (requestedPair !== undefined) {
  await runChild(requestedPair);
} else {
  await runParent();
}

async function runParent(): Promise<void> {
  console.log("\nGelis async validation continuation benchmark");
  console.log(`Runtime:    bun ${Bun.version}`);
  console.log(`CPU:        ${cpus()[0]?.model ?? "unknown"}`);
  console.log(`Samples:    ${SAMPLES}`);
  console.log("Isolation:  fresh process per comparison");
  console.log("Pairing:    same process");
  console.log("Order:      alternated every sample\n");

  const results: PairResult[] = [];

  for (let index = 0; index < pairs.length; index++) {
    const pair = pairs[index];

    if (pair === undefined) {
      continue;
    }

    console.log(`[${index + 1}/${pairs.length}] ${pair}`);

    results.push(await runIsolatedPair(pair));
  }

  console.log("\nAsync continuation results\n");

  console.table(
    results.map((result) => ({
      comparison: `${result.baselineName} → ${result.candidateName}`,

      "baseline ns": round(result.baselineMedianNs, 2),
      "candidate ns": round(result.candidateMedianNs, 2),

      "paired Δ ns": round(result.pairedMedianDeltaNs, 2),
      "paired Δ %": round(result.pairedMedianDeltaPercent, 2),

      "baseline CV %": round(result.baselineCv * 100, 2),
      "candidate CV %": round(result.candidateCv * 100, 2),

      wins: `${result.candidateWins}/${SAMPLES}`,
    })),
  );

  console.log("\nOrder-bias check\n");

  console.table(
    results.map((result) => ({
      comparison: `${result.baselineName} → ${result.candidateName}`,

      "baseline-first Δ %": round(result.baselineFirstMedianDeltaPercent, 2),

      "candidate-first Δ %": round(result.candidateFirstMedianDeltaPercent, 2),
    })),
  );

  console.log("\nNegative delta favors candidate.");

  void sink;
}

async function runIsolatedPair(pair: PairName): Promise<PairResult> {
  const child = Bun.spawn([process.execPath, CHILD, `--pair=${pair}`], {
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
      [`Async validation benchmark failed: ${pair}`, stdout, stderr].join("\n"),
    );
  }

  const line = stdout
    .split(/\r?\n/)
    .find((value) => value.startsWith("RESULT "));

  if (!line) {
    throw new Error(`Missing result: ${pair}\n${stdout}`);
  }

  const parsed: unknown = JSON.parse(line.slice("RESULT ".length));

  if (!isPairResult(parsed)) {
    throw new Error(`Invalid result: ${pair}`);
  }

  return parsed;
}

async function runChild(pairName: PairName): Promise<void> {
  const definition = createPair(pairName);

  await warmup(definition.baseline, WARMUP_ITERATIONS);

  await warmup(definition.candidate, WARMUP_ITERATIONS);

  const iterations = await calibratePair(
    definition.baseline,
    definition.candidate,
  );

  const samples: PairSample[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const baselineFirst = sample % 2 === 0;

    let baselineElapsed: number;
    let candidateElapsed: number;

    if (baselineFirst) {
      baselineElapsed = await measure(definition.baseline, iterations);

      candidateElapsed = await measure(definition.candidate, iterations);
    } else {
      candidateElapsed = await measure(definition.candidate, iterations);

      baselineElapsed = await measure(definition.baseline, iterations);
    }

    const baselineNs = millisecondsToNsPerOp(baselineElapsed, iterations);

    const candidateNs = millisecondsToNsPerOp(candidateElapsed, iterations);

    samples.push({
      order: baselineFirst ? "baseline-first" : "candidate-first",

      baselineNs,
      candidateNs,

      deltaNs: candidateNs - baselineNs,

      deltaPercent: (candidateNs / baselineNs - 1) * 100,
    });
  }

  const baselineValues = samples.map((sample) => sample.baselineNs);

  const candidateValues = samples.map((sample) => sample.candidateNs);

  const deltaValues = samples.map((sample) => sample.deltaNs);

  const deltaPercentValues = samples.map((sample) => sample.deltaPercent);

  const baselineFirstDeltas = samples
    .filter((sample) => sample.order === "baseline-first")
    .map((sample) => sample.deltaPercent);

  const candidateFirstDeltas = samples
    .filter((sample) => sample.order === "candidate-first")
    .map((sample) => sample.deltaPercent);

  const candidateWins = samples.filter(
    (sample) => sample.candidateNs < sample.baselineNs,
  ).length;

  const result: PairResult = {
    pair: pairName,

    baselineName: definition.baselineName,
    candidateName: definition.candidateName,

    iterations,

    baselineMedianNs: median(baselineValues),
    candidateMedianNs: median(candidateValues),

    pairedMedianDeltaNs: median(deltaValues),

    pairedMedianDeltaPercent: median(deltaPercentValues),

    baselineCv: coefficientOfVariation(baselineValues),

    candidateCv: coefficientOfVariation(candidateValues),

    candidateWins,

    baselineFirstMedianDeltaPercent: median(baselineFirstDeltas),

    candidateFirstMedianDeltaPercent: median(candidateFirstDeltas),

    samples,
  };

  console.log(`RESULT ${JSON.stringify(result)}`);

  void sink;
}

function createPair(pair: PairName): PairDefinition {
  switch (pair) {
    case "current-to-direct":
      return {
        baselineName: "current-resolve-then",
        candidateName: "direct-native-then",

        baseline: currentResolveThen,
        candidate: directNativeThen,
      };

    case "current-to-schema-promise":
      return {
        baselineName: "current-resolve-then",
        candidateName: "schema-promise-direct",

        baseline: currentResolveThen,
        candidate: schemaPromiseDirect,
      };

    case "current-to-native-fast":
      return {
        baselineName: "current-resolve-then",
        candidateName: "native-fast-fallback",

        baseline: currentResolveThen,
        candidate: nativeFastFallback,
      };

    case "direct-to-trusted":
      return {
        baselineName: "direct-native-then",
        candidateName: "trusted-native-then",

        baseline: directNativeThen,
        candidate: trustedNativeThen,
      };

    case "direct-to-await":
      return {
        baselineName: "direct-native-then",
        candidateName: "async-await",

        baseline: directNativeThen,
        candidate: asyncAwait,
      };
  }
}

function nativeFastFallback(): Promise<QueryOutput> {
  const validation = queryAsyncSchema["~standard"].validate(RAW_QUERY);

  /*
   * Standard Schema V1 specifies Promise<Result>
   * for asynchronous validation.
   *
   * A same-realm native Promise can therefore skip
   * Promise.resolve() entirely.
   */
  if (validation instanceof Promise) {
    return validation.then((result) =>
      consumeResult(result as ValidationResult),
    );
  }

  /*
   * Defensive compatibility path.
   *
   * This is broader than the Standard Schema
   * contract, but preserves Gelis' existing
   * tolerance for PromiseLike implementations
   * and cross-realm Promise-like values.
   */
  if (isPromiseLike(validation)) {
    return Promise.resolve(validation).then((result) =>
      consumeResult(result as ValidationResult),
    );
  }

  return Promise.resolve(consumeResult(validation as ValidationResult));
}

/*
 * Models current Gelis async validator branch:
 *
 * validate
 * -> isPromiseLike
 * -> Promise.resolve
 * -> then
 */
function currentResolveThen(): Promise<QueryOutput> {
  const validation = queryAsyncSchema["~standard"].validate(RAW_QUERY);

  if (!isPromiseLike(validation)) {
    return Promise.resolve(consumeResult(validation as ValidationResult));
  }

  return Promise.resolve(validation).then((result) =>
    consumeResult(result as ValidationResult),
  );
}

/*
 * Native-Promise experimental candidate.
 *
 * Still performs the current PromiseLike check,
 * but skips Promise.resolve().
 *
 * This relies on the benchmark validator returning
 * a real Promise, which async functions do.
 */
function directNativeThen(): Promise<QueryOutput> {
  const validation = queryAsyncSchema["~standard"].validate(RAW_QUERY);

  if (!isPromiseLike(validation)) {
    return Promise.resolve(consumeResult(validation as ValidationResult));
  }

  return (validation as Promise<ValidationResult>).then(consumeResult);
}

function schemaPromiseDirect(): Promise<QueryOutput> {
  const validation = queryAsyncSchema["~standard"].validate(RAW_QUERY);

  if (isSchemaPromise(validation)) {
    return validation.then((result) =>
      consumeResult(result as ValidationResult),
    );
  }

  return Promise.resolve(consumeResult(validation as ValidationResult));
}

function isSchemaPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return isPromiseLike(value);
}

/*
 * Theoretical lower bound.
 *
 * Assumes this schema is known async and native-Promise.
 * Gelis does NOT currently have such a registration-time
 * contract, so this is attribution only.
 */
function trustedNativeThen(): Promise<QueryOutput> {
  const validation = queryAsyncSchema["~standard"].validate(
    RAW_QUERY,
  ) as Promise<ValidationResult>;

  return validation.then(consumeResult);
}

/*
 * Alternative continuation shape.
 */
async function asyncAwait(): Promise<QueryOutput> {
  const validation = queryAsyncSchema["~standard"].validate(RAW_QUERY);

  if (!isPromiseLike(validation)) {
    return consumeResult(validation as ValidationResult);
  }

  const result = await validation;

  return consumeResult(result as ValidationResult);
}

function consumeResult(result: ValidationResult): QueryOutput {
  if (result.issues !== undefined) {
    throw new Error("Unexpected validation failure");
  }

  sink = result.value;

  return result.value;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return false;
  }

  return (
    typeof (
      value as {
        then?: unknown;
      }
    ).then === "function"
  );
}

async function warmup(
  operation: AsyncOperation,
  iterations: number,
): Promise<void> {
  for (let index = 0; index < iterations; index++) {
    sink = await operation();
  }
}

async function calibratePair(
  baseline: AsyncOperation,
  candidate: AsyncOperation,
): Promise<number> {
  let iterations = 1000;

  while (true) {
    const baselineElapsed = await measure(baseline, iterations);

    const candidateElapsed = await measure(candidate, iterations);

    const slowerElapsed = Math.max(baselineElapsed, candidateElapsed);

    if (slowerElapsed >= MIN_CALIBRATION_MS) {
      return Math.max(
        1,
        Math.round((iterations * TARGET_MS) / Math.max(slowerElapsed, 0.001)),
      );
    }

    iterations *= 2;
  }
}

async function measure(
  operation: AsyncOperation,
  iterations: number,
): Promise<number> {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    sink = await operation();
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

function readPair(): PairName | undefined {
  const prefix = "--pair=";

  const argument = process.argv.find((value) => value.startsWith(prefix));

  if (!argument) {
    return undefined;
  }

  const value = argument.slice(prefix.length);

  if (!pairs.includes(value as PairName)) {
    throw new Error(`Unknown async validation pair: ${value}`);
  }

  return value as PairName;
}

function isPairResult(value: unknown): value is PairResult {
  return (
    value !== null &&
    typeof value === "object" &&
    "pair" in value &&
    typeof value.pair === "string" &&
    pairs.includes(value.pair as PairName) &&
    "baselineMedianNs" in value &&
    typeof value.baselineMedianNs === "number" &&
    "candidateMedianNs" in value &&
    typeof value.candidateMedianNs === "number" &&
    "pairedMedianDeltaNs" in value &&
    typeof value.pairedMedianDeltaNs === "number" &&
    "pairedMedianDeltaPercent" in value &&
    typeof value.pairedMedianDeltaPercent === "number" &&
    "candidateWins" in value &&
    typeof value.candidateWins === "number" &&
    "samples" in value &&
    Array.isArray(value.samples)
  );
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}
