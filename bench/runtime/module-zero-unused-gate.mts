import { Gelis, defineModule } from "../../src";

const EMPTY_MODULES = 5_000;

const REQUEST_SAMPLES = 41;

const REQUEST_WARMUP_ITERATIONS = 100_000;

const REQUEST_ITERATIONS = 300_000;

const REQUEST_MAX_DELTA_PERCENT = 3;

const response = new Response(null, {
  status: 204,
});

let numericSink = 0;

const controlApp = new Gelis();

controlApp.get("/plain", () => response);

const candidateApp = new Gelis();

/*
 * Populate setup-time module state aggressively while
 * leaving the request routing/lifecycle surface identical
 * to the control application.
 *
 * Empty mounted modules are intentionally used here:
 * module identity bookkeeping is active, but no module
 * route, lifecycle, scope, or request-scope plan can enter
 * the request path.
 */
for (let index = 0; index < EMPTY_MODULES; index++) {
  candidateApp.mount(
    defineModule(
      `/unused/${index}`,

      () => ({}),
    ),
  );
}

candidateApp.get("/plain", () => response);

const request = new Request("http://gelis.test/plain");

assertCorrectness();

const controlRunner = createFetchRunner(controlApp, request);

const candidateRunner = createFetchRunner(candidateApp, request);

controlRunner(REQUEST_WARMUP_ITERATIONS);

candidateRunner(REQUEST_WARMUP_ITERATIONS);

const samples: RequestSample[] = [];

for (let sampleIndex = 0; sampleIndex < REQUEST_SAMPLES; sampleIndex++) {
  numericSink ^= sampleIndex;

  const controlFirst = sampleIndex % 2 === 0;

  let controlNs: number;

  let candidateNs: number;

  if (controlFirst) {
    Bun.gc(true);

    controlNs = measureRequest(controlRunner);

    Bun.gc(true);

    candidateNs = measureRequest(candidateRunner);
  } else {
    Bun.gc(true);

    candidateNs = measureRequest(candidateRunner);

    Bun.gc(true);

    controlNs = measureRequest(controlRunner);
  }

  const delta = candidateNs - controlNs;

  samples.push({
    control: controlNs,

    candidate: candidateNs,

    delta,

    deltaPercent: (delta / controlNs) * 100,

    controlFirst,
  });
}

const summary = summarize(samples);

const pass = summary.deltaPercentMedian <= REQUEST_MAX_DELTA_PERCENT;

console.log("\nGelis P8-C8 zero-unused module request gate");

console.log(`Runtime:                bun ${Bun.version}`);

console.log(`Mounted empty modules:  ${EMPTY_MODULES.toLocaleString()}`);

console.log(`Request samples:        ${REQUEST_SAMPLES}`);

console.log(
  `Request iterations:     ${REQUEST_ITERATIONS.toLocaleString()} / side / sample`,
);

console.log();

console.table([
  {
    case: "plain-request-after-5000-empty-module-mounts",

    "control ns": round(summary.controlMedian, 2),

    "candidate ns": round(summary.candidateMedian, 2),

    "delta ns": signed(summary.deltaMedian, 2),

    "delta %": signed(summary.deltaPercentMedian, 2),

    "control cv %": round(summary.controlCv, 2),

    "candidate cv %": round(summary.candidateCv, 2),

    wins: `${summary.candidateWins}/${summary.samples}`,

    "control-first %": signed(summary.controlFirstDeltaPercent, 2),

    "candidate-first %": signed(summary.candidateFirstDeltaPercent, 2),
  },
]);

console.log("\nP8-C8 frozen zero-unused gate");

console.table([
  {
    metric: "plain request delta",

    observed: round(summary.deltaPercentMedian, 2),

    max: REQUEST_MAX_DELTA_PERCENT,

    pass,
  },
]);

console.log(
  `\nPre-frozen recommendation: ${
    pass ? "accept-c8-zero-unused" : "reject-c8-zero-unused"
  }`,
);

console.log(`Numeric sink: ${numericSink}`);

type Runner = (iterations: number) => number;

interface RequestSample {
  readonly control: number;

  readonly candidate: number;

  readonly delta: number;

  readonly deltaPercent: number;

  readonly controlFirst: boolean;
}

function assertCorrectness(): void {
  const control = controlApp.fetch(request);

  const candidate = candidateApp.fetch(request);

  if (control instanceof Promise || candidate instanceof Promise) {
    throw new Error("Unexpected async plain route in P8-C8 zero-unused gate");
  }

  if (control.status !== 204 || candidate.status !== 204) {
    throw new Error("Unexpected status in P8-C8 zero-unused gate");
  }
}

function createFetchRunner(
  app: Gelis,

  target: Request,
): Runner {
  return (iterations) => {
    let local = 0;

    for (let index = 0; index < iterations; index++) {
      const result = app.fetch(target);

      if (result instanceof Promise) {
        throw new Error("Unexpected async result in P8-C8 zero-unused gate");
      }

      local ^= result.status;
    }

    numericSink ^= local;

    return local;
  };
}

function measureRequest(runner: Runner): number {
  const start = Bun.nanoseconds();

  runner(REQUEST_ITERATIONS);

  return (Bun.nanoseconds() - start) / REQUEST_ITERATIONS;
}

function summarize(values: readonly RequestSample[]) {
  const controlValues = values.map((sample) => sample.control);

  const candidateValues = values.map((sample) => sample.candidate);

  const controlFirst = values.filter((sample) => sample.controlFirst);

  const candidateFirst = values.filter((sample) => !sample.controlFirst);

  return {
    controlMedian: median(controlValues),

    candidateMedian: median(candidateValues),

    deltaMedian: median(values.map((sample) => sample.delta)),

    deltaPercentMedian: median(values.map((sample) => sample.deltaPercent)),

    controlCv: cv(controlValues),

    candidateCv: cv(candidateValues),

    candidateWins: values.filter((sample) => sample.candidate < sample.control)
      .length,

    samples: values.length,

    controlFirstDeltaPercent: median(
      controlFirst.map((sample) => sample.deltaPercent),
    ),

    candidateFirstDeltaPercent: median(
      candidateFirst.map((sample) => sample.deltaPercent),
    ),
  };
}

function cv(values: readonly number[]): number {
  const average = mean(values);

  if (average === 0) {
    return 0;
  }

  const variance = mean(
    values.map((value) => {
      const difference = value - average;

      return difference * difference;
    }),
  );

  return (Math.sqrt(variance) / average) * 100;
}

function mean(values: readonly number[]): number {
  let total = 0;

  for (const value of values) {
    total += value;
  }

  return total / values.length;
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot compute median of empty values");
  }

  const sorted = [...values].sort((left, right) => left - right);

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle]!;
  }

  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function signed(value: number, digits: number): string {
  const rounded = round(value, digits);

  if (rounded > 0) {
    return `+${rounded}`;
  }

  return `${rounded}`;
}
