import { cpus } from "node:os";

import { Gelis } from "../../src";

import type { StandardSchemaV1 } from "../../src";

const ROUTES = 5_000;

const SAMPLES = 31;

const WARMUP_ITERATIONS = 100_000;

const TARGET_MS = 200;

const MIN_CALIBRATION_MS = 30;

const TARGET_PATH = "/route/0";

const request = new Request(`http://gelis.test${TARGET_PATH}`);

const Query = {
  "~standard": {
    version: 1,

    vendor: "gelis-zero-unused",

    validate(value: unknown) {
      return {
        value: value as Record<string, string | string[]>,
      };
    },
  },
} as StandardSchemaV1<Record<string, string | string[]>>;

interface Sample {
  readonly order: "plain-first" | "mixed-first";

  readonly plainNs: number;

  readonly mixedNs: number;

  readonly deltaNs: number;

  readonly deltaPercent: number;
}

let sink = 0;

const plainApp = createPlainApplication();

const mixedApp = createMixedApplication();

verifyCorrectness();

warmup(plainApp, WARMUP_ITERATIONS);

warmup(mixedApp, WARMUP_ITERATIONS);

const iterations = calibrateIterations(plainApp, mixedApp);

const samples: Sample[] = [];

for (let sample = 0; sample < SAMPLES; sample++) {
  const plainFirst = sample % 2 === 0;

  let plainElapsed: number;

  let mixedElapsed: number;

  if (plainFirst) {
    plainElapsed = measure(plainApp, iterations);

    mixedElapsed = measure(mixedApp, iterations);
  } else {
    mixedElapsed = measure(mixedApp, iterations);

    plainElapsed = measure(plainApp, iterations);
  }

  const plainNs = millisecondsToNsPerOp(plainElapsed, iterations);

  const mixedNs = millisecondsToNsPerOp(mixedElapsed, iterations);

  samples.push({
    order: plainFirst ? "plain-first" : "mixed-first",

    plainNs,

    mixedNs,

    deltaNs: mixedNs - plainNs,

    deltaPercent: (mixedNs / plainNs - 1) * 100,
  });
}

const plainValues = samples.map((sample) => sample.plainNs);

const mixedValues = samples.map((sample) => sample.mixedNs);

const deltaValues = samples.map((sample) => sample.deltaNs);

const deltaPercentValues = samples.map((sample) => sample.deltaPercent);

const plainFirstValues = samples
  .filter((sample) => sample.order === "plain-first")
  .map((sample) => sample.deltaPercent);

const mixedFirstValues = samples
  .filter((sample) => sample.order === "mixed-first")
  .map((sample) => sample.deltaPercent);

const candidateWins = samples.filter(
  (sample) => sample.mixedNs < sample.plainNs,
).length;

console.log("\nGelis validation zero-unused paired benchmark");

console.log(`Runtime:     bun ${Bun.version}`);

console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);

console.log(`Routes:      ${ROUTES}`);

console.log(`Samples:     ${SAMPLES}`);

console.log(`Iterations:  ${iterations}`);

console.log("Target:      identical plain route");

console.log("Control:     5000 plain routes");

console.log("Candidate:   1 plain + 4999 validated routes");

console.log("Pairing:     same process");

console.log("Order:       alternated\n");

console.table([
  {
    comparison: "plain-only → validation-heavy",

    "plain ns": round(median(plainValues), 2),

    "mixed ns": round(median(mixedValues), 2),

    "paired Δ ns": round(median(deltaValues), 2),

    "paired Δ %": round(median(deltaPercentValues), 2),

    "plain CV %": round(coefficientOfVariation(plainValues) * 100, 2),

    "mixed CV %": round(coefficientOfVariation(mixedValues) * 100, 2),

    "mixed faster": `${candidateWins}/${SAMPLES}`,
  },
]);

console.log("\nOrder-bias check\n");

console.table([
  {
    comparison: "plain-only → validation-heavy",

    "plain-first Δ %": round(median(plainFirstValues), 2),

    "mixed-first Δ %": round(median(mixedFirstValues), 2),
  },
]);

console.log(
  "\nPositive delta means validation elsewhere made the plain route slower.",
);

void sink;

function createPlainApplication(): Gelis {
  const app = new Gelis();

  const response = new Response("ok");

  for (let index = 0; index < ROUTES; index++) {
    app.get(`/route/${index}`, () => response);
  }

  return app;
}

function createMixedApplication(): Gelis {
  const app = new Gelis();

  const response = new Response("ok");

  app.get(TARGET_PATH, () => response);

  for (let index = 1; index < ROUTES; index++) {
    app.get(
      `/route/${index}`,

      {
        query: Query,
      },

      () => response,
    );
  }

  return app;
}

function verifyCorrectness(): void {
  const plainResult = plainApp.fetch(request);

  const mixedResult = mixedApp.fetch(request);

  if (!(plainResult instanceof Response)) {
    throw new Error("Plain-only route became asynchronous");
  }

  if (!(mixedResult instanceof Response)) {
    throw new Error("Plain route in validation-heavy app became asynchronous");
  }

  if (plainResult.status !== 200 || mixedResult.status !== 200) {
    throw new Error("Unexpected benchmark response");
  }

  console.log("Correctness: synchronous plain route PASS");
}

function warmup(app: Gelis, iterations: number): void {
  for (let index = 0; index < iterations; index++) {
    consume(app.fetch(request));
  }
}

function calibrateIterations(plain: Gelis, mixed: Gelis): number {
  let iterations = 10_000;

  while (true) {
    const plainElapsed = measure(plain, iterations);

    const mixedElapsed = measure(mixed, iterations);

    const slowerElapsed = Math.max(plainElapsed, mixedElapsed);

    if (slowerElapsed >= MIN_CALIBRATION_MS) {
      return Math.max(
        1,
        Math.round((iterations * TARGET_MS) / Math.max(slowerElapsed, 0.001)),
      );
    }

    iterations *= 2;
  }
}

function measure(app: Gelis, iterations: number): number {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    consume(app.fetch(request));
  }

  return performance.now() - start;
}

function consume(result: Response | Promise<Response>): void {
  if (!(result instanceof Response)) {
    throw new Error("Expected synchronous plain route");
  }

  sink += result.status;
}

function millisecondsToNsPerOp(
  elapsedMilliseconds: number,
  iterations: number,
): number {
  return (elapsedMilliseconds * 1_000_000) / iterations;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);

  const value = sorted[Math.floor(sorted.length / 2)];

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

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}
