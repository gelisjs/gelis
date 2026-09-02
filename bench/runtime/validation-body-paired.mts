import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { bodySyncSchema, type BodyOutput } from "../http/validation/schemas.ts";

type BodyValidationResult = Awaited<
  ReturnType<(typeof bodySyncSchema)["~standard"]["validate"]>
>;

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = resolve(HERE, "validation-body-paired.mts");

const SAMPLES = 21;
const TARGET_MS = 150;
const MIN_CALIBRATION_MS = 25;
const WARMUP_ITERATIONS = 5_000;

const BODY_TEXT = JSON.stringify({
  name: "Gelis",
  count: 42,
});

const pairs = [
  "json-vs-text-parse",
  "then-vs-await",
  "current-vs-no-validation",
] as const;

type PairName = (typeof pairs)[number];

type AsyncOperation = () => Promise<unknown>;

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

  readonly baselineMedianNs: number;
  readonly candidateMedianNs: number;

  readonly pairedMedianDeltaNs: number;
  readonly pairedMedianDeltaPercent: number;

  readonly baselineCv: number;
  readonly candidateCv: number;

  readonly candidateWins: number;

  readonly baselineFirstDeltaPercent: number;
  readonly candidateFirstDeltaPercent: number;
}

let sink: unknown;

const requestedPair = readPair();

if (requestedPair !== undefined) {
  await runChild(requestedPair);
} else {
  await runParent();
}

async function runParent(): Promise<void> {
  console.log("\nGelis body validation paired attribution");
  console.log(`Runtime:    bun ${Bun.version}`);
  console.log(`CPU:        ${cpus()[0]?.model ?? "unknown"}`);
  console.log(`Samples:    ${SAMPLES}`);
  console.log("Isolation:  fresh process per comparison");
  console.log("Pairing:    baseline/candidate same process");
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

  console.log("\nBody attribution\n");

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

      "baseline-first Δ %": round(result.baselineFirstDeltaPercent, 2),

      "candidate-first Δ %": round(result.candidateFirstDeltaPercent, 2),
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
      [`Body benchmark failed: ${pair}`, stdout, stderr].join("\n"),
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

async function runChild(pair: PairName): Promise<void> {
  const definition = createPair(pair);

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

  const baselineFirstValues = samples
    .filter((sample) => sample.order === "baseline-first")
    .map((sample) => sample.deltaPercent);

  const candidateFirstValues = samples
    .filter((sample) => sample.order === "candidate-first")
    .map((sample) => sample.deltaPercent);

  const result: PairResult = {
    pair,

    baselineName: definition.baselineName,

    candidateName: definition.candidateName,

    baselineMedianNs: median(baselineValues),

    candidateMedianNs: median(candidateValues),

    pairedMedianDeltaNs: median(deltaValues),

    pairedMedianDeltaPercent: median(deltaPercentValues),

    baselineCv: coefficientOfVariation(baselineValues),

    candidateCv: coefficientOfVariation(candidateValues),

    candidateWins: samples.filter(
      (sample) => sample.candidateNs < sample.baselineNs,
    ).length,

    baselineFirstDeltaPercent: median(baselineFirstValues),

    candidateFirstDeltaPercent: median(candidateFirstValues),
  };

  console.log(`RESULT ${JSON.stringify(result)}`);

  void sink;
}

function createPair(pair: PairName): PairDefinition {
  switch (pair) {
    case "json-vs-text-parse":
      return {
        baselineName: "request.json",
        candidateName: "request.text+JSON.parse",

        baseline: requestJson,
        candidate: requestTextJsonParse,
      };

    case "then-vs-await":
      return {
        baselineName: "json-then",
        candidateName: "json-await",

        baseline: bodyThen,
        candidate: bodyAwait,
      };

    case "current-vs-no-validation":
      return {
        baselineName: "body-parse+validate",
        candidateName: "body-parse-only",

        baseline: bodyThen,
        candidate: bodyParseOnly,
      };
  }
}

function createBodyRequest(): Request {
  return new Request("http://gelis.test/body", {
    method: "POST",

    headers: {
      "content-type": "application/json",
    },

    body: BODY_TEXT,
  });
}

/*
 * Built-in Request.json().
 */
async function requestJson(): Promise<unknown> {
  const request = createBodyRequest();

  const value = await request.json();

  sink = value;

  return value;
}

/*
 * Candidate parser shape.
 *
 * Same fresh Request construction.
 */
async function requestTextJsonParse(): Promise<unknown> {
  const request = createBodyRequest();

  const text = await request.text();

  const value = JSON.parse(text);

  sink = value;

  return value;
}

/*
 * Models the current runBodyRoute continuation:
 *
 * request.json()
 *   .then(rawBody => sync validation)
 */
function bodyThen(): Promise<BodyOutput> {
  const request = createBodyRequest();

  return request.json().then((rawBody) => {
    const validation = bodySyncSchema["~standard"].validate(rawBody);

    if (isPromiseLike(validation)) {
      return Promise.resolve(validation).then(consumeValidation);
    }

    return consumeValidation(validation);
  }) as Promise<BodyOutput>;
}

/*
 * Alternative continuation shape.
 */
async function bodyAwait(): Promise<BodyOutput> {
  const request = createBodyRequest();

  const rawBody = await request.json();

  const validation = bodySyncSchema["~standard"].validate(rawBody);

  if (isPromiseLike(validation)) {
    return consumeValidation(await validation);
  }

  return consumeValidation(validation);
}

/*
 * Lower bound after parsing.
 *
 * Not a production candidate.
 */
function bodyParseOnly(): Promise<BodyOutput> {
  const request = createBodyRequest();

  return request.json().then((rawBody) => {
    const body = rawBody as BodyOutput;

    sink = body;

    return body;
  });
}

function consumeValidation(result: BodyValidationResult): BodyOutput {
  if (result.issues !== undefined) {
    throw new Error("Unexpected body validation failure");
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
  let iterations = 250;

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

  const value = sorted[middle];

  if (value === undefined) {
    throw new Error("Cannot compute median");
  }

  return value;
}

function coefficientOfVariation(values: readonly number[]): number {
  const average =
    values.reduce((total, value) => total + value, 0) / values.length;

  if (average === 0) {
    return 0;
  }

  const variance =
    values.reduce((total, value) => {
      const delta = value - average;

      return total + delta * delta;
    }, 0) / values.length;

  return Math.sqrt(variance) / average;
}

function readPair(): PairName | undefined {
  const prefix = "--pair=";

  const argument = process.argv.find((value) => value.startsWith(prefix));

  if (!argument) {
    return undefined;
  }

  const value = argument.slice(prefix.length);

  if (!pairs.includes(value as PairName)) {
    throw new Error(`Unknown pair: ${value}`);
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
    "pairedMedianDeltaNs" in value &&
    typeof value.pairedMedianDeltaNs === "number"
  );
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}
