import { Gelis, defineCapability, defineModule, definePlugin } from "../../src";

import type {
  Capability,
  ModuleLifecycle,
  ModuleScopeLifecycle,
} from "../../src";

const ROUTES = 5_000;

const REGISTRATION_SAMPLES = 21;

const REGISTRATION_WARMUP_RUNS = 5;

const REQUEST_SAMPLES = 41;

const REQUEST_WARMUP_ITERATIONS = 100_000;

const REQUEST_ITERATIONS = 300_000;

const REGISTRATION_MAX_RATIO = 1.35;

const REQUEST_MAX_DELTA_PERCENT = 3;

interface DatabaseClient {
  readonly id: "primary";
}

const Database: Capability<DatabaseClient> = defineCapability(
  "p8-c6-module-lifecycle-database",
);

const database: DatabaseClient = {
  id: "primary",
};

const databasePlugin = definePlugin(
  "p8-c6-module-lifecycle-database-provider",

  (setup) => {
    Database.provide(setup, database);
  },
);

const sharedResponse = new Response(null, {
  status: 204,
});

let numericSink = 0;

function plainHandler(): Response {
  return sharedResponse;
}

function plainBefore(): void {
  numericSink ^= 1;
}

function plainAfter(): void {
  numericSink ^= 2;
}

const staticModuleLifecycle: ModuleLifecycle = {
  beforeHandle: plainBefore,

  afterHandle: plainAfter,
};

const staticRouteLifecycle = {
  beforeHandle: plainBefore,

  afterHandle: plainAfter,
} as const;

function scopedHandler(
  _context: unknown,

  scope: {
    readonly database: DatabaseClient;
  },
): Response {
  numericSink ^= scope.database.id.length;

  return sharedResponse;
}

function scopedBefore(
  _context: unknown,

  scope: {
    readonly database: DatabaseClient;
  },
): void {
  numericSink ^= scope.database.id.length;
}

function scopedAfter(
  _context: unknown,

  _result: unknown,

  scope: {
    readonly database: DatabaseClient;
  },
): void {
  numericSink ^= scope.database.id.length << 1;
}

const scopedModuleLifecycle: ModuleScopeLifecycle<{
  readonly database: DatabaseClient;
}> = {
  beforeHandle: scopedBefore,

  afterHandle: scopedAfter,
};

const scopedRouteLifecycle = {
  beforeHandle: scopedBefore,

  afterHandle: scopedAfter,
} as const;

type RegistrationCase = {
  readonly name: string;

  readonly control: () => void;

  readonly candidate: () => void;
};

type RegistrationSample = {
  readonly control: number;

  readonly candidate: number;

  readonly ratio: number;

  readonly controlFirst: boolean;
};

type RegistrationSummary = {
  readonly case: string;

  readonly controlMedianNs: number;

  readonly candidateMedianNs: number;

  readonly ratioMedian: number;

  readonly controlCv: number;

  readonly candidateCv: number;

  readonly controlFirstRatio: number;

  readonly candidateFirstRatio: number;

  readonly samples: number;
};

type Runner = (iterations: number) => number;

type RequestCase = {
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

function createStaticPerRouteModule() {
  return defineModule(
    "/lifecycle",

    (route) => {
      const routes: Record<string, any> = {};

      for (let index = 0; index < ROUTES; index++) {
        const path = `/${index}` as `/${number}`;

        routes[`route${index}`] = route.get(
          path,
          plainHandler,
          staticRouteLifecycle,
        );
      }

      return routes;
    },
  );
}

function createStaticModuleLifecycleModule() {
  return defineModule(
    "/lifecycle",

    staticModuleLifecycle,

    (route) => {
      const routes: Record<string, any> = {};

      for (let index = 0; index < ROUTES; index++) {
        const path = `/${index}` as `/${number}`;

        routes[`route${index}`] = route.get(path, plainHandler);
      }

      return routes;
    },
  );
}

function createScopedPerRouteModule() {
  return defineModule(
    "/scoped-lifecycle",

    (setup) => ({
      database: Database.require(setup),
    }),

    (route) => {
      const routes: Record<string, any> = {};

      for (let index = 0; index < ROUTES; index++) {
        const path = `/${index}` as `/${number}`;

        routes[`route${index}`] = route.get(
          path,
          scopedHandler,
          scopedRouteLifecycle,
        );
      }

      return routes;
    },
  );
}

function createScopedModuleLifecycleModule() {
  return defineModule(
    "/scoped-lifecycle",

    (setup) => ({
      database: Database.require(setup),
    }),

    scopedModuleLifecycle,

    (route) => {
      const routes: Record<string, any> = {};

      for (let index = 0; index < ROUTES; index++) {
        const path = `/${index}` as `/${number}`;

        routes[`route${index}`] = route.get(path, scopedHandler);
      }

      return routes;
    },
  );
}

function runStaticPerRouteRegistration(): void {
  const module = createStaticPerRouteModule();

  const app = new Gelis();

  app.mount(module);

  numericSink ^= ROUTES;
}

function runStaticModuleLifecycleRegistration(): void {
  const module = createStaticModuleLifecycleModule();

  const app = new Gelis();

  app.mount(module);

  numericSink ^= ROUTES;
}

function runScopedPerRouteRegistration(): void {
  const module = createScopedPerRouteModule();

  const app = new Gelis();

  app.use(databasePlugin);

  app.mount(module);

  numericSink ^= ROUTES;
}

function runScopedModuleLifecycleRegistration(): void {
  const module = createScopedModuleLifecycleModule();

  const app = new Gelis();

  app.use(databasePlugin);

  app.mount(module);

  numericSink ^= ROUTES;
}

const registrationCases: readonly RegistrationCase[] = [
  {
    name: "static-module-lifecycle-build-mount",

    control: runStaticPerRouteRegistration,

    candidate: runStaticModuleLifecycleRegistration,
  },

  {
    name: "scoped-module-lifecycle-build-mount",

    control: runScopedPerRouteRegistration,

    candidate: runScopedModuleLifecycleRegistration,
  },
];

for (let warmup = 0; warmup < REGISTRATION_WARMUP_RUNS; warmup++) {
  for (const registrationCase of registrationCases) {
    registrationCase.control();
    registrationCase.candidate();
  }
}

const registrationSummaries: RegistrationSummary[] = [];

for (let caseIndex = 0; caseIndex < registrationCases.length; caseIndex++) {
  const registrationCase = registrationCases[caseIndex]!;

  registrationSummaries.push(
    summarizeRegistration(
      registrationCase.name,

      runRegistrationPaired(
        registrationCase.control,
        registrationCase.candidate,
        caseIndex,
      ),
    ),
  );
}

const staticControlApp = new Gelis();

staticControlApp.mount(createStaticPerRouteModule());

const staticCandidateApp = new Gelis();

staticCandidateApp.mount(createStaticModuleLifecycleModule());

const scopedControlApp = new Gelis();

scopedControlApp.use(databasePlugin);

scopedControlApp.mount(createScopedPerRouteModule());

const scopedCandidateApp = new Gelis();

scopedCandidateApp.use(databasePlugin);

scopedCandidateApp.mount(createScopedModuleLifecycleModule());

const staticRequest = new Request(`http://gelis.test/lifecycle/${ROUTES - 1}`);

const scopedRequest = new Request(
  `http://gelis.test/scoped-lifecycle/${ROUTES - 1}`,
);

assertCorrectness();

const requestCases: readonly RequestCase[] = [
  {
    name: "static-module-lifecycle-request",

    control: createFetchRunner(staticControlApp, staticRequest),

    candidate: createFetchRunner(staticCandidateApp, staticRequest),
  },

  {
    name: "scoped-module-lifecycle-request",

    control: createFetchRunner(scopedControlApp, scopedRequest),

    candidate: createFetchRunner(scopedCandidateApp, scopedRequest),
  },
];

for (const requestCase of requestCases) {
  requestCase.control(REQUEST_WARMUP_ITERATIONS);

  requestCase.candidate(REQUEST_WARMUP_ITERATIONS);
}

const requestSummaries: RequestSummary[] = [];

for (let caseIndex = 0; caseIndex < requestCases.length; caseIndex++) {
  const requestCase = requestCases[caseIndex]!;

  requestSummaries.push(
    summarizeRequest(
      requestCase.name,

      runRequestPaired(requestCase.control, requestCase.candidate, caseIndex),
    ),
  );
}

const registrationGateRows = registrationSummaries.map((summary) => ({
  case: summary.case,

  "control ms": round(summary.controlMedianNs / 1_000_000, 3),

  "candidate ms": round(summary.candidateMedianNs / 1_000_000, 3),

  ratio: round(summary.ratioMedian, 3),

  "max ratio": REGISTRATION_MAX_RATIO,

  pass: summary.ratioMedian <= REGISTRATION_MAX_RATIO,
}));

const requestGateRows = requestSummaries.map((summary) => ({
  case: summary.case,

  "delta %": round(summary.deltaPercentMedian, 2),

  "max %": REQUEST_MAX_DELTA_PERCENT,

  pass: summary.deltaPercentMedian <= REQUEST_MAX_DELTA_PERCENT,
}));

const registrationPass = registrationGateRows.every((row) => row.pass);

const requestPass = requestGateRows.every((row) => row.pass);

console.log("\nGelis P8-C6-A module lifecycle gate");

console.log(`Runtime:                bun ${Bun.version}`);

console.log(`Routes/app:             ${ROUTES.toLocaleString()}`);

console.log(`Registration samples:   ${REGISTRATION_SAMPLES}`);

console.log(`Request samples:        ${REQUEST_SAMPLES}`);

console.log(
  `Request iterations:     ${REQUEST_ITERATIONS.toLocaleString()} / side / sample`,
);

console.log();

console.log("Registration diagnostics");

console.table(
  registrationSummaries.map((summary) => ({
    case: summary.case,

    "control ms": round(summary.controlMedianNs / 1_000_000, 3),

    "candidate ms": round(summary.candidateMedianNs / 1_000_000, 3),

    ratio: round(summary.ratioMedian, 3),

    "control cv %": round(summary.controlCv, 2),

    "candidate cv %": round(summary.candidateCv, 2),

    "control-first ratio": round(summary.controlFirstRatio, 3),

    "candidate-first ratio": round(summary.candidateFirstRatio, 3),

    samples: summary.samples,
  })),
);

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

console.log("\nP8-C6-A frozen registration gates");

console.table(registrationGateRows);

console.log("\nP8-C6-A frozen request gates");

console.table(requestGateRows);

console.log(
  `\nPre-frozen recommendation: ${
    registrationPass && requestPass ? "accept-c6a" : "reject-c6a"
  }`,
);

console.log(`Numeric sink: ${numericSink}`);

function runRegistrationPaired(
  control: () => void,

  candidate: () => void,

  caseIndex: number,
): RegistrationSample[] {
  const samples: RegistrationSample[] = [];

  for (let sampleIndex = 0; sampleIndex < REGISTRATION_SAMPLES; sampleIndex++) {
    numericSink ^= sampleIndex + caseIndex * 257;

    const controlFirst = sampleIndex % 2 === 0;

    let controlNs: number;

    let candidateNs: number;

    if (controlFirst) {
      Bun.gc(true);

      controlNs = measureRegistration(control);

      Bun.gc(true);

      candidateNs = measureRegistration(candidate);
    } else {
      Bun.gc(true);

      candidateNs = measureRegistration(candidate);

      Bun.gc(true);

      controlNs = measureRegistration(control);
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
  name: string,

  samples: readonly RegistrationSample[],
): RegistrationSummary {
  const controlValues = samples.map((sample) => sample.control);

  const candidateValues = samples.map((sample) => sample.candidate);

  const controlFirst = samples.filter((sample) => sample.controlFirst);

  const candidateFirst = samples.filter((sample) => !sample.controlFirst);

  return {
    case: name,

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
  const pairs = [
    [staticControlApp, staticCandidateApp, staticRequest],

    [scopedControlApp, scopedCandidateApp, scopedRequest],
  ] as const;

  for (const [controlApp, candidateApp, request] of pairs) {
    const control = controlApp.fetch(request);

    const candidate = candidateApp.fetch(request);

    if (control instanceof Promise || candidate instanceof Promise) {
      throw new Error(
        "Unexpected async result during P8-C6-A correctness check",
      );
    }

    if (control.status !== 204 || candidate.status !== 204) {
      throw new Error("Unexpected status during P8-C6-A correctness check");
    }
  }
}

function createFetchRunner(
  app: Gelis,

  request: Request,
): Runner {
  return (iterations) => {
    let local = 0;

    for (let index = 0; index < iterations; index++) {
      const result = app.fetch(request);

      if (result instanceof Promise) {
        throw new Error("Unexpected async request result in P8-C6-A");
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

  caseIndex: number,
): RequestSample[] {
  const samples: RequestSample[] = [];

  for (let sampleIndex = 0; sampleIndex < REQUEST_SAMPLES; sampleIndex++) {
    numericSink ^= sampleIndex + caseIndex * 131;

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

function round(
  value: number,

  digits: number,
): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function signed(
  value: number,

  digits: number,
): string {
  const rounded = round(value, digits);

  if (rounded > 0) {
    return `+${rounded}`;
  }

  return `${rounded}`;
}
