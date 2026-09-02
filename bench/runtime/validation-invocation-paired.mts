import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeResponse, runtimeReply } from "../../src/runtime/response.ts";

import type {
  RuntimeRouteContext,
  RuntimeRouteHandler,
} from "../../src/runtime/types.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = resolve(HERE, "validation-invocation-paired.mts");

const ROUTE_COUNT = 128;
const ROUTE_MASK = ROUTE_COUNT - 1;

const SAMPLES = 21;
const TARGET_MS = 150;
const MIN_CALIBRATION_MS = 25;
const WARMUP_ITERATIONS = 100_000;

const REQUEST = new Request("http://gelis.test/r/127?page=42&q=gelis");

const PARAMS = Object.create(null) as Record<string, string>;

interface QueryOutput {
  readonly page: number;
  readonly q: string;
}

const QUERY: QueryOutput = {
  page: 42,
  q: "gelis",
};

interface RouteLike {
  readonly handler: RuntimeRouteHandler;
}

const ROUTES = createRoutes();

const pairs = [
  "mono-wrapper-direct",
  "rotating-wrapper-direct",
  "mono-direct-inline",
  "rotating-direct-inline",
] as const;

type PairName = (typeof pairs)[number];

type Mode = "mono" | "rotating";

type Variant = "wrapper" | "direct" | "inline";

interface PairDefinition {
  readonly baselineName: string;
  readonly candidateName: string;
  readonly baseline: () => Response | Promise<Response>;
  readonly candidate: () => Response | Promise<Response>;
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
  console.log("\nGelis validation handler invocation benchmark");
  console.log(`Runtime:    bun ${Bun.version}`);
  console.log(`CPU:        ${cpus()[0]?.model ?? "unknown"}`);
  console.log(`Routes:     ${ROUTE_COUNT}`);
  console.log(`Samples:    ${SAMPLES}`);
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

  console.log("\nInvocation results\n");

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

  console.log("\nNegative delta means removing the boundary was faster.");

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
      [`Invocation benchmark failed: ${pair}`, stdout, stderr].join("\n"),
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
    case "mono-wrapper-direct":
      return {
        baselineName: "mono-wrapper",
        candidateName: "mono-direct",

        baseline: createOperation("mono", "wrapper"),

        candidate: createOperation("mono", "direct"),
      };

    case "rotating-wrapper-direct":
      return {
        baselineName: "rotating-wrapper",
        candidateName: "rotating-direct",

        baseline: createOperation("rotating", "wrapper"),

        candidate: createOperation("rotating", "direct"),
      };

    case "mono-direct-inline":
      return {
        baselineName: "mono-direct",
        candidateName: "mono-inline",

        baseline: createOperation("mono", "direct"),

        candidate: createOperation("mono", "inline"),
      };

    case "rotating-direct-inline":
      return {
        baselineName: "rotating-direct",
        candidateName: "rotating-inline",

        baseline: createOperation("rotating", "direct"),

        candidate: createOperation("rotating", "inline"),
      };
  }
}

function createOperation(
  mode: Mode,
  variant: Variant,
): () => Response | Promise<Response> {
  let cursor = 0;

  return () => {
    const route = mode === "mono" ? ROUTES[0] : ROUTES[cursor];

    if (route === undefined) {
      throw new Error("Missing benchmark route");
    }

    if (mode === "rotating") {
      cursor = (cursor + 1) & ROUTE_MASK;
    }

    switch (variant) {
      case "wrapper":
        return invokeHandlerRouteModel(
          route,
          REQUEST,
          PARAMS,
          QUERY,
          undefined,
        );

      case "direct":
        return invokeHandlerWithContextModel(
          route.handler,
          createContext(REQUEST, PARAMS, QUERY, undefined),
        );

      case "inline": {
        const result = route.handler(
          createContext(REQUEST, PARAMS, QUERY, undefined),
        );

        if (isPromiseLike(result)) {
          return Promise.resolve(result).then(normalizeResponse);
        }

        return normalizeResponse(result);
      }
    }
  };
}

function invokeHandlerRouteModel(
  route: RouteLike,
  request: Request,
  params: Record<string, string>,
  query: unknown,
  body: unknown,
): Response | Promise<Response> {
  return invokeHandlerWithContextModel(
    route.handler,
    createContext(request, params, query, body),
  );
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

function createContext(
  request: Request,
  params: Record<string, string>,
  query: unknown,
  body: unknown,
): RuntimeRouteContext {
  return {
    request,
    params,
    query,
    body,
    reply: runtimeReply,
  };
}

function createRoutes(): RouteLike[] {
  const routes: RouteLike[] = [];

  for (let index = 0; index < ROUTE_COUNT; index++) {
    const response = new Response(`ok:${index}`);

    const expectedPage = index === -1 ? -1 : 42;

    const handler: RuntimeRouteHandler = (context) => {
      const query = context.query as QueryOutput;

      if (query.page !== expectedPage) {
        throw new Error("Unexpected query");
      }

      return response;
    };

    routes.push({
      handler,
    });
  }

  return routes;
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
    throw new Error(`Unknown invocation pair: ${value}`);
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
