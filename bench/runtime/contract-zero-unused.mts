import assert from "node:assert/strict";

import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

import { Gelis, inspectContract } from "../../src/index";

const HERE = dirname(fileURLToPath(import.meta.url));

const CHILD = resolve(HERE, "contract-zero-unused.mts");

const SAMPLES = 24;

const TARGET_MS = 150;

const MIN_CALIBRATION_MS = 25;

const WARMUP_ITERATIONS = 20_000;

const REQUEST = new Request("http://gelis.test/bench");

const RAW_RESPONSE = new Response(
  null,

  {
    status: 204,
  },
);

const BENCHMARK_HANDLER = () => RAW_RESPONSE;

type CandidateName = "control" | "documented" | "hidden";

type SetupOrder = "baseline-first" | "candidate-first";

interface PairSample {
  readonly order: "baseline-first" | "candidate-first";

  readonly baselineNs: number;

  readonly candidateNs: number;

  readonly deltaNs: number;

  readonly deltaPercent: number;
}

interface PairResult {
  readonly candidate: CandidateName;

  readonly setupOrder: SetupOrder;

  readonly baselineMedianNs: number;

  readonly candidateMedianNs: number;

  readonly pairedMedianDeltaNs: number;

  readonly pairedMedianDeltaPercent: number;

  readonly baselineCv: number;

  readonly candidateCv: number;

  readonly candidateWins: number;
}

const CANDIDATES: readonly CandidateName[] = [
  "control",
  "documented",
  "hidden",
];

const SETUP_ORDERS: readonly SetupOrder[] = [
  "baseline-first",
  "candidate-first",
];

let sink: Response | Promise<Response>;

const childCandidate = readArgument("--candidate");

const childSetupOrder = readArgument("--setup-order");

if (childCandidate !== undefined || childSetupOrder !== undefined) {
  if (!isCandidateName(childCandidate) || !isSetupOrder(childSetupOrder)) {
    throw new Error("Invalid child benchmark arguments");
  }

  runChild(childCandidate, childSetupOrder);
} else {
  await runParent();
}

async function runParent(): Promise<void> {
  runCorrectnessGate();

  console.log("\nGelis contract-source zero-unused pairwise benchmark");

  console.log(`Runtime:     bun ${Bun.version}`);

  console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);

  console.log(`Samples:     ${SAMPLES} per child`);

  console.log("Control:     plain vs independent plain");

  console.log("Candidates:  documented, openapi:false");

  console.log(
    "Handler:     same function identity + same prebuilt raw Response",
  );

  console.log("Setup:       both creation/warmup orders");

  console.log("Measurement: alternating pair order");

  console.log("Isolation:   fresh child process per pair/order\n");

  const results: PairResult[] = [];

  for (const candidate of CANDIDATES) {
    for (const setupOrder of SETUP_ORDERS) {
      results.push(await runPairChild(candidate, setupOrder));
    }
  }

  console.log("Pair results\n");

  console.table(
    results.map((result) => ({
      candidate: displayCandidate(result.candidate),

      setup: result.setupOrder,

      "baseline ns": round(result.baselineMedianNs, 2),

      "candidate ns": round(result.candidateMedianNs, 2),

      "Δ ns": round(result.pairedMedianDeltaNs, 2),

      "Δ %": round(result.pairedMedianDeltaPercent, 2),

      wins: `${result.candidateWins}/${SAMPLES}`,

      "baseline CV %": round(result.baselineCv * 100, 2),

      "candidate CV %": round(result.candidateCv * 100, 2),
    })),
  );

  console.log("\nCombined setup-order summary\n");

  console.table(
    CANDIDATES.map((candidate) => {
      const candidateResults = results.filter(
        (result) => result.candidate === candidate,
      );

      const deltas = candidateResults.map(
        (result) => result.pairedMedianDeltaPercent,
      );

      return {
        candidate: displayCandidate(candidate),

        "median Δ %": round(median(deltas), 2),

        "min Δ %": round(Math.min(...deltas), 2),

        "max Δ %": round(Math.max(...deltas), 2),
      };
    }),
  );

  console.log("\nPositive delta means candidate was slower.");

  console.log(
    "The plain-vs-plain control establishes the local JIT/noise floor.",
  );

  void sink;
}

async function runPairChild(
  candidate: CandidateName,

  setupOrder: SetupOrder,
): Promise<PairResult> {
  const child = Bun.spawn(
    [
      process.execPath,
      CHILD,
      "--candidate",
      candidate,
      "--setup-order",
      setupOrder,
    ],

    {
      cwd: resolve(HERE, "../.."),

      stdout: "pipe",

      stderr: "pipe",
    },
  );

  const stdoutPromise = new Response(child.stdout).text();

  const stderrPromise = new Response(child.stderr).text();

  const exitCode = await child.exited;

  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

  if (exitCode !== 0) {
    throw new Error(
      [
        `Contract zero-unused child failed: ${candidate}/${setupOrder}`,
        stdout,
        stderr,
      ].join("\n"),
    );
  }

  const line = stdout
    .split(/\r?\n/)
    .find((value) => value.startsWith("RESULT "));

  if (line === undefined) {
    throw new Error(
      `Missing benchmark result: ${candidate}/${setupOrder}\n${stdout}`,
    );
  }

  const parsed: unknown = JSON.parse(line.slice("RESULT ".length));

  if (!isPairResult(parsed)) {
    throw new Error(`Invalid benchmark result: ${candidate}/${setupOrder}`);
  }

  return parsed;
}

function runCorrectnessGate(): void {
  const plain = createPlainApp();

  const control = createPlainApp();

  const documented = createDocumentedApp();

  const hidden = createHiddenApp();

  assert.equal(plain.fetch(REQUEST), RAW_RESPONSE);

  assert.equal(control.fetch(REQUEST), RAW_RESPONSE);

  assert.equal(documented.fetch(REQUEST), RAW_RESPONSE);

  assert.equal(hidden.fetch(REQUEST), RAW_RESPONSE);

  assert.equal(inspectContract(plain).routes[0]?.openapi, undefined);

  assert.equal(inspectContract(control).routes[0]?.openapi, undefined);

  assert.deepEqual(inspectContract(documented).routes[0]?.openapi, {
    summary: "Benchmark route",

    tags: ["Benchmark"],
  });

  assert.equal(inspectContract(hidden).routes[0]?.openapi, false);

  console.log("Correctness: PASS");
}

function runChild(
  candidateName: CandidateName,

  setupOrder: SetupOrder,
): void {
  let baseline: Gelis;

  let candidate: Gelis;

  if (setupOrder === "baseline-first") {
    baseline = createPlainApp();

    candidate = createCandidateApp(candidateName);
  } else {
    candidate = createCandidateApp(candidateName);

    baseline = createPlainApp();
  }

  if (setupOrder === "baseline-first") {
    warmup(baseline, WARMUP_ITERATIONS);

    warmup(candidate, WARMUP_ITERATIONS);
  } else {
    warmup(candidate, WARMUP_ITERATIONS);

    warmup(baseline, WARMUP_ITERATIONS);
  }

  const iterations = calibratePair(baseline, candidate, setupOrder);

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

  const result: PairResult = {
    candidate: candidateName,

    setupOrder,

    baselineMedianNs: median(baselineValues),

    candidateMedianNs: median(candidateValues),

    pairedMedianDeltaNs: median(deltaValues),

    pairedMedianDeltaPercent: median(deltaPercentValues),

    baselineCv: coefficientOfVariation(baselineValues),

    candidateCv: coefficientOfVariation(candidateValues),

    candidateWins: samples.filter(
      (sample) => sample.candidateNs < sample.baselineNs,
    ).length,
  };

  console.log(`RESULT ${JSON.stringify(result)}`);

  void sink;
}

function createCandidateApp(candidate: CandidateName): Gelis {
  switch (candidate) {
    case "control":
      return createPlainApp();

    case "documented":
      return createDocumentedApp();

    case "hidden":
      return createHiddenApp();
  }
}

function createPlainApp(): Gelis {
  const app = new Gelis();

  app.get(
    "/bench",

    BENCHMARK_HANDLER,
  );

  return app;
}

function createDocumentedApp(): Gelis {
  const app = new Gelis();

  app.get(
    "/bench",

    {
      openapi: {
        summary: "Benchmark route",

        tags: ["Benchmark"],
      },
    },

    BENCHMARK_HANDLER,
  );

  return app;
}

function createHiddenApp(): Gelis {
  const app = new Gelis();

  app.get(
    "/bench",

    {
      openapi: false,
    },

    BENCHMARK_HANDLER,
  );

  return app;
}

function warmup(
  app: Gelis,

  iterations: number,
): void {
  for (let index = 0; index < iterations; index++) {
    sink = app.fetch(REQUEST);
  }
}

function calibratePair(
  baseline: Gelis,

  candidate: Gelis,

  setupOrder: SetupOrder,
): number {
  let iterations = 1000;

  while (true) {
    let baselineElapsed: number;

    let candidateElapsed: number;

    if (setupOrder === "baseline-first") {
      baselineElapsed = measure(baseline, iterations);

      candidateElapsed = measure(candidate, iterations);
    } else {
      candidateElapsed = measure(candidate, iterations);

      baselineElapsed = measure(baseline, iterations);
    }

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

function measure(
  app: Gelis,

  iterations: number,
): number {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    sink = app.fetch(REQUEST);
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

  if (sorted.length % 2 === 0) {
    const left = sorted[middle - 1];

    const right = sorted[middle];

    if (left === undefined || right === undefined) {
      throw new Error("Cannot compute median");
    }

    return (left + right) / 2;
  }

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

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function isCandidateName(value: string | undefined): value is CandidateName {
  return value === "control" || value === "documented" || value === "hidden";
}

function isSetupOrder(value: string | undefined): value is SetupOrder {
  return value === "baseline-first" || value === "candidate-first";
}

function isPairResult(value: unknown): value is PairResult {
  return (
    value !== null &&
    typeof value === "object" &&
    "candidate" in value &&
    typeof value.candidate === "string" &&
    "setupOrder" in value &&
    typeof value.setupOrder === "string" &&
    "baselineMedianNs" in value &&
    typeof value.baselineMedianNs === "number" &&
    "candidateMedianNs" in value &&
    typeof value.candidateMedianNs === "number" &&
    "pairedMedianDeltaPercent" in value &&
    typeof value.pairedMedianDeltaPercent === "number" &&
    "candidateWins" in value &&
    typeof value.candidateWins === "number"
  );
}

function displayCandidate(candidate: CandidateName): string {
  switch (candidate) {
    case "control":
      return "plain-control";

    case "documented":
      return "documented";

    case "hidden":
      return "openapi:false";
  }
}

function round(
  value: number,

  digits: number,
): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}
