import { Gelis, definePlugin } from "../../src";

const ROUTES = 5_000;

const REQUEST_SAMPLES = 41;

const REQUEST_ITERATIONS = 300_000;

const REQUEST_WARMUP_ITERATIONS = 100_000;

const REGISTRATION_SAMPLES = 21;

const REGISTRATION_WARMUP_RUNS = 5;

const REGISTRATION_MAX_RATIO = 1.75;

const REQUEST_MAX_DELTA_PERCENT = 3;

type Runner = (iterations: number) => number;

type RequestPair = {
  readonly name: string;

  readonly control: Runner;

  readonly candidate: Runner;
};

type RequestSample = {
  readonly control: number;

  readonly candidate: number;

  readonly delta: number;

  readonly deltaPercent: number;

  readonly controlFirst: boolean;
};

type RequestSummary = {
  readonly case: string;

  readonly controlMedian: number;

  readonly candidateMedian: number;

  readonly deltaMedian: number;

  readonly deltaPercentMedian: number;

  readonly controlCv: number;

  readonly candidateCv: number;

  readonly candidateWins: number;

  readonly samples: number;

  readonly controlFirstDeltaPercent: number;

  readonly candidateFirstDeltaPercent: number;
};

type RegistrationSample = {
  readonly control: number;

  readonly candidate: number;

  readonly ratio: number;

  readonly controlFirst: boolean;
};

type RegistrationSummary = {
  readonly controlMedianNs: number;

  readonly candidateMedianNs: number;

  readonly ratioMedian: number;

  readonly controlCv: number;

  readonly candidateCv: number;

  readonly controlFirstRatio: number;

  readonly candidateFirstRatio: number;

  readonly samples: number;
};

let numericSink = 0;

const sharedResponse = new Response(null, {
  status: 204,
});

const plainPlugin = definePlugin(
  "b6-plain-routes",

  (setup) => {
    for (let index = 0; index < ROUTES; index++) {
      setup.routes.get(
        `/plain/${index}`,

        sharedHandler,
      );
    }
  },
);

const lifecyclePlugin = definePlugin(
  "b6-lifecycle-routes",

  (setup) => {
    setup.onBeforeHandle(globalBeforeHandle);

    setup.onAfterHandle(globalAfterHandle);

    for (let index = 0; index < ROUTES; index++) {
      setup.routes.get(
        `/lifecycle/${index}`,

        sharedHandler,
      );
    }
  },
);

/*
 * Registration gate:
 *
 * Both sides allocate one Gelis app inside the timed region.
 * The plugin object itself is pre-created outside measurement.
 *
 * Control performs the same 5,000 RouteBuilder registrations
 * directly. Candidate performs them inside plugin setup and then
 * commits the buffered composition.
 */
for (let warmup = 0; warmup < REGISTRATION_WARMUP_RUNS; warmup++) {
  runDirectRegistration();

  runPluginRegistration();
}

const registrationSummary = summarizeRegistration(runRegistrationPaired());

/*
 * Plain request parity:
 *
 * Both applications contain the same 5,000 final runtime routes.
 * Only their registration path differs.
 */
const directPlainApp = new Gelis();

registerDirectPlainRoutes(directPlainApp, "/plain");

const pluginPlainApp = new Gelis();

pluginPlainApp.use(plainPlugin);

/*
 * Lifecycle request parity:
 *
 * Control installs global lifecycle directly.
 * Candidate installs the same lifecycle through plugin setup.
 *
 * Both route sets are otherwise equivalent.
 */
const directLifecycleApp = new Gelis();

directLifecycleApp.onBeforeHandle(globalBeforeHandle);

directLifecycleApp.onAfterHandle(globalAfterHandle);

registerDirectPlainRoutes(directLifecycleApp, "/lifecycle");

const pluginLifecycleApp = new Gelis();

pluginLifecycleApp.use(lifecyclePlugin);

const requests = {
  plain: new Request(`http://gelis.test/plain/${ROUTES - 1}`),

  lifecycle: new Request(`http://gelis.test/lifecycle/${ROUTES - 1}`),
} as const;

assertCorrectness();

const requestPairs: readonly RequestPair[] = [
  {
    name: "plugin-declared-plain-request",

    control: createFetchRunner(directPlainApp, requests.plain),

    candidate: createFetchRunner(pluginPlainApp, requests.plain),
  },

  {
    name: "plugin-global-before-after-request",

    control: createFetchRunner(directLifecycleApp, requests.lifecycle),

    candidate: createFetchRunner(pluginLifecycleApp, requests.lifecycle),
  },
];

for (const pair of requestPairs) {
  pair.control(REQUEST_WARMUP_ITERATIONS);

  pair.candidate(REQUEST_WARMUP_ITERATIONS);
}

const requestSummaries: RequestSummary[] = [];

for (let pairIndex = 0; pairIndex < requestPairs.length; pairIndex++) {
  const pair = requestPairs[pairIndex]!;

  requestSummaries.push(
    summarizeRequest(
      pair.name,

      runRequestPaired(pair.control, pair.candidate, pairIndex),
    ),
  );
}

const registrationGate = {
  case: "plugin-declared-5000-route-registration",

  "control ms": round(registrationSummary.controlMedianNs / 1_000_000, 3),

  "candidate ms": round(registrationSummary.candidateMedianNs / 1_000_000, 3),

  ratio: round(registrationSummary.ratioMedian, 3),

  "max ratio": REGISTRATION_MAX_RATIO,

  pass: registrationSummary.ratioMedian <= REGISTRATION_MAX_RATIO,
};

const requestGateRows = requestSummaries.map((summary) => ({
  case: summary.case,

  "delta %": round(summary.deltaPercentMedian, 2),

  "max %": REQUEST_MAX_DELTA_PERCENT,

  pass: summary.deltaPercentMedian <= REQUEST_MAX_DELTA_PERCENT,
}));

const requestPass = requestGateRows.every((row) => row.pass);

const registrationPass = registrationGate.pass;

console.log("\nGelis P8-B6 plugin composition gate");

console.log(`Runtime:                bun ${Bun.version}`);

console.log(`Routes/app:             ${ROUTES.toLocaleString()}`);

console.log(`Registration samples:   ${REGISTRATION_SAMPLES}`);

console.log(`Request samples:        ${REQUEST_SAMPLES}`);

console.log(
  `Request iterations:     ${REQUEST_ITERATIONS.toLocaleString()} / side / sample`,
);

console.log();

console.log("Registration diagnostics");

console.table([
  {
    case: "plugin-declared-5000-route-registration",

    "control ms": round(registrationSummary.controlMedianNs / 1_000_000, 3),

    "candidate ms": round(registrationSummary.candidateMedianNs / 1_000_000, 3),

    ratio: round(registrationSummary.ratioMedian, 3),

    "control cv %": round(registrationSummary.controlCv, 2),

    "candidate cv %": round(registrationSummary.candidateCv, 2),

    "control-first ratio": round(registrationSummary.controlFirstRatio, 3),

    "candidate-first ratio": round(registrationSummary.candidateFirstRatio, 3),

    samples: registrationSummary.samples,
  },
]);

console.log("\nRequest parity diagnostics");

console.table(
  requestSummaries.map((summary) => ({
    case: summary.case,

    "control ns": round(summary.controlMedian, 2),

    "candidate ns": round(summary.candidateMedian, 2),

    "delta ns": signed(summary.deltaMedian, 2),

    "delta %": signed(summary.deltaPercentMedian, 2),

    "control cv %": round(summary.controlCv, 2),

    "candidate cv %": round(summary.candidateCv, 2),

    wins: `${summary.candidateWins}/${summary.samples}`,

    "control-first %": signed(summary.controlFirstDeltaPercent, 2),

    "candidate-first %": signed(summary.candidateFirstDeltaPercent, 2),
  })),
);

console.log("\nP8-B6 frozen registration gate");

console.table([registrationGate]);

console.log("\nP8-B6 frozen request gates");

console.table(requestGateRows);

console.log(
  `\nPre-frozen recommendation: ${
    registrationPass && requestPass ? "accept-b6" : "reject-b6"
  }`,
);

console.log(`Numeric sink: ${numericSink}`);

function sharedHandler(): Response {
  return sharedResponse;
}

function globalBeforeHandle(): void {
  numericSink ^= 1;
}

function globalAfterHandle(): void {
  numericSink ^= 2;
}

type DirectRoutePrefix = "/plain" | "/lifecycle";

function registerDirectPlainRoutes(
  app: Gelis,
  prefix: DirectRoutePrefix,
): void {
  for (let index = 0; index < ROUTES; index++) {
    const path = `${prefix}/${index}` as `${DirectRoutePrefix}/${number}`;

    app.get(
      path,

      sharedHandler,
    );
  }
}

function runDirectRegistration(): void {
  const app = new Gelis();

  registerDirectPlainRoutes(app, "/plain");

  numericSink ^= ROUTES;
}

function runPluginRegistration(): void {
  const app = new Gelis();

  app.use(plainPlugin);

  numericSink ^= ROUTES;
}

function runRegistrationPaired(): RegistrationSample[] {
  const samples: RegistrationSample[] = [];

  for (let sampleIndex = 0; sampleIndex < REGISTRATION_SAMPLES; sampleIndex++) {
    numericSink ^= sampleIndex * 17;

    const controlFirst = sampleIndex % 2 === 0;

    let controlNs: number;

    let candidateNs: number;

    if (controlFirst) {
      Bun.gc(true);

      controlNs = measureRegistration(runDirectRegistration);

      Bun.gc(true);

      candidateNs = measureRegistration(runPluginRegistration);
    } else {
      Bun.gc(true);

      candidateNs = measureRegistration(runPluginRegistration);

      Bun.gc(true);

      controlNs = measureRegistration(runDirectRegistration);
    }

    samples.push({
      control: controlNs,

      candidate: candidateNs,

      ratio: candidateNs / controlNs,

      controlFirst,
    });
  }

  return samples;
}

function measureRegistration(run: () => void): number {
  const start = Bun.nanoseconds();

  run();

  return Bun.nanoseconds() - start;
}

function summarizeRegistration(
  samples: readonly RegistrationSample[],
): RegistrationSummary {
  const controlValues = samples.map((sample) => sample.control);

  const candidateValues = samples.map((sample) => sample.candidate);

  const controlFirst = samples.filter((sample) => sample.controlFirst);

  const candidateFirst = samples.filter((sample) => !sample.controlFirst);

  return {
    controlMedianNs: median(controlValues),

    candidateMedianNs: median(candidateValues),

    ratioMedian: median(samples.map((sample) => sample.ratio)),

    controlCv: cv(controlValues),

    candidateCv: cv(candidateValues),

    controlFirstRatio: median(controlFirst.map((sample) => sample.ratio)),

    candidateFirstRatio: median(candidateFirst.map((sample) => sample.ratio)),

    samples: samples.length,
  };
}

function assertCorrectness(): void {
  const cases = [
    [directPlainApp, pluginPlainApp, requests.plain],

    [directLifecycleApp, pluginLifecycleApp, requests.lifecycle],
  ] as const;

  for (const [controlApp, candidateApp, request] of cases) {
    const control = controlApp.fetch(request);

    const candidate = candidateApp.fetch(request);

    if (control instanceof Promise || candidate instanceof Promise) {
      throw new Error("Unexpected async result during P8-B6 correctness check");
    }

    if (control.status !== 204 || candidate.status !== 204) {
      throw new Error("Unexpected status during P8-B6 correctness check");
    }
  }
}

function createFetchRunner(app: Gelis, request: Request): Runner {
  return (iterations) => {
    let local = 0;

    for (let index = 0; index < iterations; index++) {
      const result = app.fetch(request);

      if (result instanceof Promise) {
        throw new Error("Unexpected async request result in P8-B6");
      }

      local ^= result.status;
    }

    numericSink ^= local;

    return local;
  };
}

function runRequestPaired(
  control: Runner,
  candidate: Runner,
  pairIndex: number,
): RequestSample[] {
  const samples: RequestSample[] = [];

  for (let sampleIndex = 0; sampleIndex < REQUEST_SAMPLES; sampleIndex++) {
    numericSink ^= sampleIndex + pairIndex * 131;

    const controlFirst = sampleIndex % 2 === 0;

    let controlNs: number;

    let candidateNs: number;

    if (controlFirst) {
      Bun.gc(true);

      controlNs = measureRequest(control);

      Bun.gc(true);

      candidateNs = measureRequest(candidate);
    } else {
      Bun.gc(true);

      candidateNs = measureRequest(candidate);

      Bun.gc(true);

      controlNs = measureRequest(control);
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

  return samples;
}

function measureRequest(runner: Runner): number {
  const start = Bun.nanoseconds();

  runner(REQUEST_ITERATIONS);

  return (Bun.nanoseconds() - start) / REQUEST_ITERATIONS;
}

function summarizeRequest(
  name: string,
  samples: readonly RequestSample[],
): RequestSummary {
  const controlValues = samples.map((sample) => sample.control);

  const candidateValues = samples.map((sample) => sample.candidate);

  const controlFirst = samples.filter((sample) => sample.controlFirst);

  const candidateFirst = samples.filter((sample) => !sample.controlFirst);

  return {
    case: name,

    controlMedian: median(controlValues),

    candidateMedian: median(candidateValues),

    deltaMedian: median(samples.map((sample) => sample.delta)),

    deltaPercentMedian: median(samples.map((sample) => sample.deltaPercent)),

    controlCv: cv(controlValues),

    candidateCv: cv(candidateValues),

    candidateWins: samples.filter((sample) => sample.candidate < sample.control)
      .length,

    samples: samples.length,

    controlFirstDeltaPercent: median(
      controlFirst.map((sample) => sample.deltaPercent),
    ),

    candidateFirstDeltaPercent: median(
      candidateFirst.map((sample) => sample.deltaPercent),
    ),
  };
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

function cv(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  let total = 0;

  for (const value of values) {
    total += value;
  }

  const mean = total / values.length;

  if (mean === 0) {
    return 0;
  }

  let squared = 0;

  for (const value of values) {
    const delta = value - mean;

    squared += delta * delta;
  }

  const variance = squared / values.length;

  return (Math.sqrt(variance) / mean) * 100;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function signed(value: number, digits: number): string {
  const rounded = round(value, digits);

  return `${rounded >= 0 ? "+" : ""}${rounded}`;
}
