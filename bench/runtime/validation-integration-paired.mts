import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { StandardSchemaV1 } from "../../src/index.ts";
import type {
  RuntimeRouteContext,
  RuntimeRouteHandler,
} from "../../src/runtime/types.ts";

import { normalizeResponse, runtimeReply } from "../../src/runtime/response.ts";

import { RUNTIME_INPUT_QUERY } from "../../src/runtime/input.ts";

import type { RuntimeInputPlan } from "../../src/runtime/input.ts";

import { querySyncSchema } from "../http/validation/schemas.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

const CHILD = resolve(HERE, "validation-integration-paired.mts");

const SAMPLES = 21;
const TARGET_MS = 150;
const MIN_CALIBRATION_MS = 25;
const WARMUP_ITERATIONS = 100_000;

const REQUEST = new Request("http://gelis.test/r/4999?page=42&q=gelis");

const PARAMS = Object.create(null) as Record<string, string>;

const RAW_QUERY: Record<string, string> = {
  page: "42",
  q: "gelis",
};

interface QueryOutput {
  readonly page: number;
  readonly q: string;
}

const VALIDATED_QUERY: QueryOutput = {
  page: 42,
  q: "gelis",
};

const OK_RESPONSE = new Response("ok");

interface RuntimeRouteLike {
  readonly handler: RuntimeRouteHandler;
  readonly input: RuntimeInputPlan | undefined;
}

const HANDLER: RuntimeRouteHandler = (context) => {
  const query = context.query as QueryOutput | undefined;

  if (query?.page === -1) {
    throw new Error("unreachable");
  }

  return OK_RESPONSE;
};

const INPUT: RuntimeInputPlan = {
  kind: RUNTIME_INPUT_QUERY,
  query: querySyncSchema,
  body: undefined,
};

const ROUTE: RuntimeRouteLike = {
  handler: HANDLER,
  input: INPUT,
};

const pairs = [
  "plain-to-source",
  "source-to-no-plan",
  "no-plan-to-no-invoke",
  "no-invoke-to-no-guard",
  "no-guard-to-sync-specialized",
  "sync-specialized-to-no-validation",
] as const;

type PairName = (typeof pairs)[number];

interface PairDefinition {
  readonly baselineName: string;
  readonly candidateName: string;
  readonly baseline: () => unknown;
  readonly candidate: () => unknown;
}

interface PairSample {
  readonly sample: number;

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
  readonly baselineWins: number;
  readonly ties: number;

  readonly baselineFirstMedianDeltaPercent: number;
  readonly candidateFirstMedianDeltaPercent: number;

  readonly samples: readonly PairSample[];
}

let sink: unknown;

const requestedPair = readPair();

if (requestedPair !== undefined) {
  runChild(requestedPair);
} else {
  await runParent();
}

async function runParent(): Promise<void> {
  console.log("\nGelis validation integration paired attribution");

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

  console.log("\nIntegration attribution\n");

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

  console.log(
    "\nNegative delta means removing that layer made the candidate faster.",
  );

  console.log(
    "plain → source is expected to be positive because source adds validation work.",
  );

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
      [`Integration benchmark failed: ${pair}`, stdout, stderr].join("\n"),
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

function runChild(pairName: PairName): void {
  const definition = createPair(pairName);

  const baseline = definition.baseline;

  const candidate = definition.candidate;

  warmup(baseline, WARMUP_ITERATIONS);

  warmup(candidate, WARMUP_ITERATIONS);

  const iterations = calibratePair(baseline, candidate);

  const samples: PairSample[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const baselineFirst = sample % 2 === 0;

    let baselineElapsed: number;
    let candidateElapsed: number;

    if (baselineFirst) {
      baselineElapsed = measure(baseline, iterations);

      candidateElapsed = measure(candidate, iterations);
    } else {
      candidateElapsed = measure(candidate, iterations);

      baselineElapsed = measure(baseline, iterations);
    }

    const baselineNs = millisecondsToNsPerOp(baselineElapsed, iterations);

    const candidateNs = millisecondsToNsPerOp(candidateElapsed, iterations);

    const deltaNs = candidateNs - baselineNs;

    const deltaPercent = (candidateNs / baselineNs - 1) * 100;

    samples.push({
      sample: sample + 1,

      order: baselineFirst ? "baseline-first" : "candidate-first",

      baselineNs,
      candidateNs,

      deltaNs,
      deltaPercent,
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

  let candidateWins = 0;
  let baselineWins = 0;
  let ties = 0;

  for (const sample of samples) {
    if (sample.candidateNs < sample.baselineNs) {
      candidateWins++;
    } else if (sample.candidateNs > sample.baselineNs) {
      baselineWins++;
    } else {
      ties++;
    }
  }

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
    baselineWins,
    ties,

    baselineFirstMedianDeltaPercent: median(baselineFirstDeltas),

    candidateFirstMedianDeltaPercent: median(candidateFirstDeltas),

    samples,
  };

  console.log(`RESULT ${JSON.stringify(result)}`);

  void sink;
}

function createPair(pair: PairName): PairDefinition {
  switch (pair) {
    case "plain-to-source":
      return {
        baselineName: "plain-model",
        candidateName: "source-no-parse",

        baseline: plainModel,
        candidate: sourceNoParse,
      };

    case "source-to-no-plan":
      return {
        baselineName: "source-no-parse",
        candidateName: "no-plan",

        baseline: sourceNoParse,
        candidate: noPlan,
      };

    case "no-plan-to-no-invoke":
      return {
        baselineName: "no-plan",
        candidateName: "no-invoke",

        baseline: noPlan,
        candidate: noInvoke,
      };

    case "no-invoke-to-no-guard":
      return {
        baselineName: "no-invoke",
        candidateName: "no-guard",

        baseline: noInvoke,
        candidate: noGuard,
      };

    case "no-guard-to-sync-specialized":
      return {
        baselineName: "no-guard",
        candidateName: "sync-specialized",

        baseline: noGuard,
        candidate: syncSpecialized,
      };

    case "sync-specialized-to-no-validation":
      return {
        baselineName: "sync-specialized",
        candidateName: "no-validation",

        baseline: syncSpecialized,

        candidate: noValidation,
      };
  }
}

/*
 * Control model for the existing plain-route
 * handler invocation shape.
 */
function plainModel(): Response | Promise<Response> {
  const result = HANDLER({
    request: REQUEST,
    params: PARAMS,

    query: undefined,
    body: undefined,

    reply: runtimeReply,
  });

  if (isPromiseLike(result)) {
    return Promise.resolve(result).then(normalizeResponse);
  }

  return normalizeResponse(result);
}

/*
 * Models the current query path after parsing:
 *
 * runInputPlan
 * -> runInputRoute
 * -> runQueryRoute
 * -> invokeHandlerRoute
 * -> invokeHandlerWithContext
 *
 * RAW_QUERY is already parsed so this specifically
 * targets the current ~73 ns integration remainder.
 */
function sourceNoParse(): Response | Promise<Response> {
  return runInputPlanModel(ROUTE, RAW_QUERY);
}

function runInputPlanModel(
  route: RuntimeRouteLike,
  rawQuery: Record<string, string | string[]>,
): Response | Promise<Response> {
  const input = route.input;

  if (input === undefined) {
    throw new Error("Missing Gelis runtime input plan");
  }

  return runInputRouteModel(route, input, rawQuery);
}

function runInputRouteModel(
  route: RuntimeRouteLike,
  input: RuntimeInputPlan,
  rawQuery: Record<string, string | string[]>,
): Response | Promise<Response> {
  switch (input.kind) {
    case RUNTIME_INPUT_QUERY:
      return runQueryModel(route, input, rawQuery);

    default:
      throw new Error("Invalid Gelis runtime input plan");
  }
}

function runQueryModel(
  route: RuntimeRouteLike,
  input: RuntimeInputPlan,
  rawQuery: Record<string, string | string[]>,
): Response | Promise<Response> {
  const schema = input.query;

  if (!schema) {
    throw new Error("Missing query schema");
  }

  const validation = schema["~standard"].validate(rawQuery);

  if (isPromiseLike(validation)) {
    return Promise.resolve(validation).then((result) => {
      if (result.issues !== undefined) {
        throw new Error("Unexpected validation failure");
      }

      return invokeHandlerRouteModel(route, result.value);
    });
  }

  if (validation.issues !== undefined) {
    throw new Error("Unexpected validation failure");
  }

  return invokeHandlerRouteModel(route, validation.value);
}

/*
 * Removes only:
 *
 * runInputPlan
 * runInputRoute
 * input.kind switch
 */
function noPlan(): Response | Promise<Response> {
  return runQueryModel(ROUTE, INPUT, RAW_QUERY);
}

/*
 * Removes the generic RuntimeRouteInvoker /
 * invokeHandlerRoute function boundary.
 */
function noInvoke(): Response | Promise<Response> {
  const schema = INPUT.query;

  if (!schema) {
    throw new Error("Missing query schema");
  }

  const validation = schema["~standard"].validate(RAW_QUERY);

  if (isPromiseLike(validation)) {
    return Promise.resolve(validation).then((result) => {
      if (result.issues !== undefined) {
        throw new Error("Unexpected validation failure");
      }

      return invokeDirect(result.value);
    });
  }

  if (validation.issues !== undefined) {
    throw new Error("Unexpected validation failure");
  }

  return invokeDirect(validation.value);
}

/*
 * Removes the query-schema existence guard.
 *
 * Route registration already guarantees this
 * shape for a query plan, but whether removing
 * the defensive assertion is worthwhile is
 * deliberately only being measured here.
 */
function noGuard(): Response | Promise<Response> {
  const schema = INPUT.query as StandardSchemaV1<unknown, QueryOutput>;

  const validation = schema["~standard"].validate(RAW_QUERY);

  if (isPromiseLike(validation)) {
    return Promise.resolve(validation).then((result) => {
      if (result.issues !== undefined) {
        throw new Error("Unexpected validation failure");
      }

      return invokeDirect(result.value);
    });
  }

  if (validation.issues !== undefined) {
    throw new Error("Unexpected validation failure");
  }

  return invokeDirect(validation.value);
}

/*
 * Theoretical only.
 *
 * Standard Schema currently permits either
 * synchronous or Promise results, so Gelis
 * cannot simply make this assumption in
 * production without a new explicit contract.
 *
 * This scenario tells us how expensive the
 * PromiseLike detection itself actually is.
 */
function syncSpecialized(): Response | Promise<Response> {
  const schema = INPUT.query as StandardSchemaV1<unknown, QueryOutput>;

  const validation = schema["~standard"].validate(
    RAW_QUERY,
  ) as StandardSchemaV1.Result<QueryOutput>;

  if (validation.issues !== undefined) {
    throw new Error("Unexpected validation failure");
  }

  return invokeDirect(validation.value);
}

/*
 * Lower bound after validation has already
 * produced its output.
 *
 * Not a production candidate.
 */
function noValidation(): Response | Promise<Response> {
  return invokeDirect(VALIDATED_QUERY);
}

function invokeHandlerRouteModel(
  route: RuntimeRouteLike,
  query: unknown,
): Response | Promise<Response> {
  return invokeHandlerWithContextModel(route.handler, createContext(query));
}

function invokeDirect(query: unknown): Response | Promise<Response> {
  return invokeHandlerWithContextModel(HANDLER, createContext(query));
}

function createContext(query: unknown): RuntimeRouteContext {
  return {
    request: REQUEST,
    params: PARAMS,

    query,
    body: undefined,

    reply: runtimeReply,
  };
}

function invokeHandlerWithContextModel(
  handler: RuntimeRouteHandler,
  context: RuntimeRouteContext,
): Response | Promise<Response> {
  const result = handler(context);

  if (isPromiseLike(result)) {
    return Promise.resolve(result).then(normalizeResponse);
  }

  return normalizeResponse(result);
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

function warmup(operation: () => unknown, iterations: number): void {
  for (let index = 0; index < iterations; index++) {
    sink = operation();
  }
}

function calibratePair(
  baseline: () => unknown,
  candidate: () => unknown,
): number {
  let iterations = 1000;

  while (true) {
    const baselineElapsed = measure(baseline, iterations);

    const candidateElapsed = measure(candidate, iterations);

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

function measure(operation: () => unknown, iterations: number): number {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    sink = operation();
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
    throw new Error(`Unknown integration pair: ${value}`);
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
