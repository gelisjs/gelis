import { Gelis, defineCapability, defineModule, definePlugin } from "../../src";

import type {
  Capability,
  ModuleLifecycle,
  ModuleScopeLifecycle,
  RequestScopeDeriveContext,
} from "../../src";

const ROUTES = 5_000;

const REGISTRATION_SAMPLES = 21;

const REGISTRATION_WARMUP_RUNS = 5;

const REQUEST_SAMPLES = 41;

const REQUEST_WARMUP_ITERATIONS = 100_000;

const REQUEST_ITERATIONS = 300_000;

const REQUEST_MAX_DELTA_PERCENT = 3;

type RequestScopeValue = {
  readonly requestId: number;
};

interface DatabaseClient {
  readonly id: "primary";
}

const Database: Capability<DatabaseClient> = defineCapability(
  "p8-c6b-module-request-scope-database",
);

const database: DatabaseClient = {
  id: "primary",
};

const databasePlugin = definePlugin(
  "p8-c6b-module-request-scope-database-provider",

  (setup) => {
    Database.provide(setup, database);
  },
);

const sharedResponse = new Response(null, {
  status: 204,
});

let numericSink = 0;

function staticDerive(_context: RequestScopeDeriveContext): RequestScopeValue {
  return {
    requestId: 7,
  };
}

function directStaticHandler(
  _context: unknown,

  requestScope: RequestScopeValue,
): Response {
  numericSink ^= requestScope.requestId;

  return sharedResponse;
}

function scopedDerive(
  _context: RequestScopeDeriveContext,

  databaseClient: DatabaseClient,
): RequestScopeValue {
  numericSink ^= databaseClient.id.length;

  return {
    requestId: 11,
  };
}

function directScopedHandler(
  _context: unknown,

  requestScope: RequestScopeValue,
): Response {
  numericSink ^= database.id.length;

  numericSink ^= requestScope.requestId;

  return sharedResponse;
}

function moduleScopedHandler(
  _context: unknown,

  moduleScope: {
    readonly database: DatabaseClient;
  },

  requestScope: RequestScopeValue,
): Response {
  numericSink ^= moduleScope.database.id.length;

  numericSink ^= requestScope.requestId;

  return sharedResponse;
}

function staticBefore(_context: unknown): void {
  numericSink ^= 3;
}

function staticAfter(
  _context: unknown,

  _result: unknown,
): void {
  numericSink ^= 5;
}

function directStaticRequestBefore(
  _context: unknown,

  _requestScope: RequestScopeValue,
): void {
  staticBefore(undefined);
}

function directStaticRequestAfter(
  _context: unknown,

  result: unknown,

  _requestScope: RequestScopeValue,
): void {
  staticAfter(undefined, result);
}

const staticModuleLifecycle: ModuleLifecycle = {
  beforeHandle: staticBefore,

  afterHandle: staticAfter,
};

const staticDirectRequestLifecycle = {
  beforeHandle: directStaticRequestBefore,

  afterHandle: directStaticRequestAfter,
} as const;

function scopedModuleBefore(
  _context: unknown,

  moduleScope: {
    readonly database: DatabaseClient;
  },
): void {
  numericSink ^= moduleScope.database.id.length;
}

function scopedModuleAfter(
  _context: unknown,

  _result: unknown,

  moduleScope: {
    readonly database: DatabaseClient;
  },
): void {
  numericSink ^= moduleScope.database.id.length << 1;
}

function directScopedRequestBefore(
  _context: unknown,

  _requestScope: RequestScopeValue,
): void {
  numericSink ^= database.id.length;
}

function directScopedRequestAfter(
  _context: unknown,

  _result: unknown,

  _requestScope: RequestScopeValue,
): void {
  numericSink ^= database.id.length << 1;
}

const scopedModuleLifecycle: ModuleScopeLifecycle<{
  readonly database: DatabaseClient;
}> = {
  beforeHandle: scopedModuleBefore,

  afterHandle: scopedModuleAfter,
};

const scopedDirectRequestLifecycle = {
  beforeHandle: directScopedRequestBefore,

  afterHandle: directScopedRequestAfter,
} as const;

function moduleScopedRequestBefore(
  _context: unknown,

  moduleScope: {
    readonly database: DatabaseClient;
  },

  _requestScope: RequestScopeValue,
): void {
  numericSink ^= moduleScope.database.id.length;
}

function moduleScopedRequestAfter(
  _context: unknown,

  _result: unknown,

  moduleScope: {
    readonly database: DatabaseClient;
  },

  _requestScope: RequestScopeValue,
): void {
  numericSink ^= moduleScope.database.id.length << 1;
}

const scopedModuleRequestLocalLifecycle = {
  beforeHandle: moduleScopedRequestBefore,

  afterHandle: moduleScopedRequestAfter,
} as const;

type RegistrationCase = {
  readonly name: string;

  readonly control: () => void;

  readonly candidate: () => void;

  readonly maxRatio: number;
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

  readonly maxRatio: number;
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

/*
 * Registration comparisons:
 *
 * 1. Static module requestScope vs direct app.requestScope.
 * 2. Scoped module requestScope vs direct app.requestScope
 *    with the same database reference captured by closure.
 * 3. Static module lifecycle on requestScope vs equivalent
 *    request-local lifecycle inside the same module composition.
 * 4. Scoped module lifecycle on requestScope vs equivalent
 *    module request-local lifecycle with the same resolved module scope.
 *
 * Rows 3-4 deliberately hold module composition constant so the
 * <=1.35x lifecycle gate measures incremental lifecycle composition,
 * not the already-accounted-for module build+mount cost from rows 1-2.
 *
 * Module definitions are inside the timed region because
 * the gate covers construction + mount, not mount alone.
 */
const registrationCases: readonly RegistrationCase[] = [
  {
    name: "static-module-request-scope-build-mount",

    control: runDirectStaticRegistration,

    candidate: runModuleStaticRegistration,

    maxRatio: 1.75,
  },

  {
    name: "scoped-module-request-scope-build-mount",

    control: runDirectScopedRegistration,

    candidate: runModuleScopedRegistration,

    maxRatio: 1.75,
  },

  {
    name: "static-module-request-lifecycle-build-mount",

    control: runModuleStaticRequestLocalLifecycleRegistration,

    candidate: runModuleStaticLifecycleRegistration,

    maxRatio: 1.35,
  },

  {
    name: "scoped-module-request-lifecycle-build-mount",

    control: runModuleScopedRequestLocalLifecycleRegistration,

    candidate: runModuleScopedLifecycleRegistration,

    maxRatio: 1.35,
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

      registrationCase.maxRatio,

      runRegistrationPaired(
        registrationCase.control,
        registrationCase.candidate,
        caseIndex,
      ),
    ),
  );
}

/*
 * Request applications are built once before timing.
 */
const directStaticApp = new Gelis();

registerDirectStatic(directStaticApp, false);

const moduleStaticApp = new Gelis();

moduleStaticApp.mount(createModuleStatic(false));

const directScopedApp = new Gelis();

directScopedApp.use(databasePlugin);

registerDirectScoped(directScopedApp, false);

const moduleScopedApp = new Gelis();

moduleScopedApp.use(databasePlugin);

moduleScopedApp.mount(createModuleScoped(false));

const moduleStaticRequestLocalLifecycleApp = new Gelis();

moduleStaticRequestLocalLifecycleApp.mount(
  createModuleStaticRequestLocalLifecycleControl(),
);

const moduleStaticLifecycleApp = new Gelis();

moduleStaticLifecycleApp.mount(createModuleStatic(true));

const moduleScopedRequestLocalLifecycleApp = new Gelis();

moduleScopedRequestLocalLifecycleApp.use(databasePlugin);

moduleScopedRequestLocalLifecycleApp.mount(
  createModuleScopedRequestLocalLifecycleControl(),
);

const moduleScopedLifecycleApp = new Gelis();

moduleScopedLifecycleApp.use(databasePlugin);

moduleScopedLifecycleApp.mount(createModuleScoped(true));

const requests = {
  static: new Request(`http://gelis.test/static-request/${ROUTES - 1}`),

  scoped: new Request(`http://gelis.test/scoped-request/${ROUTES - 1}`),

  staticLifecycle: new Request(
    `http://gelis.test/static-request-lifecycle/${ROUTES - 1}`,
  ),

  scopedLifecycle: new Request(
    `http://gelis.test/scoped-request-lifecycle/${ROUTES - 1}`,
  ),
} as const;

assertCorrectness();

const requestCases: readonly RequestCase[] = [
  {
    name: "static-module-request-scope-request",

    control: createFetchRunner(directStaticApp, requests.static),

    candidate: createFetchRunner(moduleStaticApp, requests.static),
  },

  {
    name: "scoped-module-request-scope-request",

    control: createFetchRunner(directScopedApp, requests.scoped),

    candidate: createFetchRunner(moduleScopedApp, requests.scoped),
  },

  {
    name: "static-module-request-lifecycle-request",

    control: createFetchRunner(
      moduleStaticRequestLocalLifecycleApp,
      requests.staticLifecycle,
    ),

    candidate: createFetchRunner(
      moduleStaticLifecycleApp,
      requests.staticLifecycle,
    ),
  },

  {
    name: "scoped-module-request-lifecycle-request",

    control: createFetchRunner(
      moduleScopedRequestLocalLifecycleApp,
      requests.scopedLifecycle,
    ),

    candidate: createFetchRunner(
      moduleScopedLifecycleApp,
      requests.scopedLifecycle,
    ),
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

  "max ratio": summary.maxRatio,

  pass: summary.ratioMedian <= summary.maxRatio,
}));

const requestGateRows = requestSummaries.map((summary) => ({
  case: summary.case,

  "delta %": round(summary.deltaPercentMedian, 2),

  "max %": REQUEST_MAX_DELTA_PERCENT,

  pass: summary.deltaPercentMedian <= REQUEST_MAX_DELTA_PERCENT,
}));

const registrationPass = registrationGateRows.every((row) => row.pass);

const requestPass = requestGateRows.every((row) => row.pass);

console.log("\nGelis P8-C6-B module request-scope gate");

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

console.log("\nP8-C6-B frozen registration gates");

console.table(registrationGateRows);

console.log("\nP8-C6-B frozen request gates");

console.table(requestGateRows);

console.log(
  `\nPre-frozen recommendation: ${
    registrationPass && requestPass ? "accept-c6b" : "reject-c6b"
  }`,
);

console.log(`Numeric sink: ${numericSink}`);

function createModuleStatic(lifecycle: boolean) {
  const prefix = lifecycle ? "/static-request-lifecycle" : "/static-request";

  if (lifecycle) {
    return defineModule(
      prefix,

      staticModuleLifecycle,

      (module) => {
        const scoped = module.requestScope(staticDerive);

        const routes: Record<string, any> = {};

        for (let index = 0; index < ROUTES; index++) {
          const path = `/${index}` as `/${number}`;

          routes[`route${index}`] = scoped.get(path, directStaticHandler);
        }

        return routes;
      },
    );
  }

  return defineModule(
    prefix,

    (module) => {
      const scoped = module.requestScope(staticDerive);

      const routes: Record<string, any> = {};

      for (let index = 0; index < ROUTES; index++) {
        const path = `/${index}` as `/${number}`;

        routes[`route${index}`] = scoped.get(path, directStaticHandler);
      }

      return routes;
    },
  );
}

function createModuleScoped(lifecycle: boolean) {
  const prefix = lifecycle ? "/scoped-request-lifecycle" : "/scoped-request";

  if (lifecycle) {
    return defineModule(
      prefix,

      (setup) => ({
        database: Database.require(setup),
      }),

      scopedModuleLifecycle,

      (module) => {
        const scoped = module.requestScope((context, moduleScope) =>
          scopedDerive(context, moduleScope.database),
        );

        const routes: Record<string, any> = {};

        for (let index = 0; index < ROUTES; index++) {
          const path = `/${index}` as `/${number}`;

          routes[`route${index}`] = scoped.get(path, moduleScopedHandler);
        }

        return routes;
      },
    );
  }

  return defineModule(
    prefix,

    (setup) => ({
      database: Database.require(setup),
    }),

    (module) => {
      const scoped = module.requestScope((context, moduleScope) =>
        scopedDerive(context, moduleScope.database),
      );

      const routes: Record<string, any> = {};

      for (let index = 0; index < ROUTES; index++) {
        const path = `/${index}` as `/${number}`;

        routes[`route${index}`] = scoped.get(path, moduleScopedHandler);
      }

      return routes;
    },
  );
}

function createModuleStaticRequestLocalLifecycleControl() {
  return defineModule(
    "/static-request-lifecycle",

    (module) => {
      const scoped = module.requestScope(staticDerive);

      const routes: Record<string, any> = {};

      for (let index = 0; index < ROUTES; index++) {
        const path = `/${index}` as `/${number}`;

        routes[`route${index}`] = scoped.get(
          path,
          directStaticHandler,
          staticDirectRequestLifecycle,
        );
      }

      return routes;
    },
  );
}

function createModuleScopedRequestLocalLifecycleControl() {
  return defineModule(
    "/scoped-request-lifecycle",

    (setup) => ({
      database: Database.require(setup),
    }),

    (module) => {
      const scoped = module.requestScope((context, moduleScope) =>
        scopedDerive(context, moduleScope.database),
      );

      const routes: Record<string, any> = {};

      for (let index = 0; index < ROUTES; index++) {
        const path = `/${index}` as `/${number}`;

        routes[`route${index}`] = scoped.get(
          path,
          moduleScopedHandler,
          scopedModuleRequestLocalLifecycle,
        );
      }

      return routes;
    },
  );
}

function registerDirectStatic(
  app: Gelis,

  lifecycle: boolean,
): void {
  const scoped = app.requestScope(staticDerive);

  const prefix = lifecycle ? "/static-request-lifecycle" : "/static-request";

  for (let index = 0; index < ROUTES; index++) {
    const path = `${prefix}/${index}` as `/${string}`;

    if (lifecycle) {
      scoped.get(path, directStaticHandler, staticDirectRequestLifecycle);
    } else {
      scoped.get(path, directStaticHandler);
    }
  }
}

function registerDirectScoped(
  app: Gelis,

  lifecycle: boolean,
): void {
  const scoped = app.requestScope((context) => scopedDerive(context, database));

  const prefix = lifecycle ? "/scoped-request-lifecycle" : "/scoped-request";

  for (let index = 0; index < ROUTES; index++) {
    const path = `${prefix}/${index}` as `/${string}`;

    if (lifecycle) {
      scoped.get(path, directScopedHandler, scopedDirectRequestLifecycle);
    } else {
      scoped.get(path, directScopedHandler);
    }
  }
}

function runDirectStaticRegistration(): void {
  const app = new Gelis();

  registerDirectStatic(app, false);

  numericSink ^= ROUTES;
}

function runModuleStaticRegistration(): void {
  const module = createModuleStatic(false);

  const app = new Gelis();

  app.mount(module);

  numericSink ^= ROUTES;
}

function runDirectScopedRegistration(): void {
  const app = new Gelis();

  app.use(databasePlugin);

  registerDirectScoped(app, false);

  numericSink ^= ROUTES;
}

function runModuleScopedRegistration(): void {
  const module = createModuleScoped(false);

  const app = new Gelis();

  app.use(databasePlugin);

  app.mount(module);

  numericSink ^= ROUTES;
}

function runModuleStaticRequestLocalLifecycleRegistration(): void {
  const module = createModuleStaticRequestLocalLifecycleControl();

  const app = new Gelis();

  app.mount(module);

  numericSink ^= ROUTES;
}

function runModuleStaticLifecycleRegistration(): void {
  const module = createModuleStatic(true);

  const app = new Gelis();

  app.mount(module);

  numericSink ^= ROUTES;
}

function runModuleScopedRequestLocalLifecycleRegistration(): void {
  const module = createModuleScopedRequestLocalLifecycleControl();

  const app = new Gelis();

  app.use(databasePlugin);

  app.mount(module);

  numericSink ^= ROUTES;
}

function runModuleScopedLifecycleRegistration(): void {
  const module = createModuleScoped(true);

  const app = new Gelis();

  app.use(databasePlugin);

  app.mount(module);

  numericSink ^= ROUTES;
}

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

  maxRatio: number,

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

    maxRatio,
  };
}

function assertCorrectness(): void {
  const pairs = [
    [directStaticApp, moduleStaticApp, requests.static],

    [directScopedApp, moduleScopedApp, requests.scoped],

    [
      moduleStaticRequestLocalLifecycleApp,
      moduleStaticLifecycleApp,
      requests.staticLifecycle,
    ],

    [
      moduleScopedRequestLocalLifecycleApp,
      moduleScopedLifecycleApp,
      requests.scopedLifecycle,
    ],
  ] as const;

  for (const [controlApp, candidateApp, request] of pairs) {
    const control = controlApp.fetch(request);

    const candidate = candidateApp.fetch(request);

    if (control instanceof Promise || candidate instanceof Promise) {
      throw new Error(
        "Unexpected async result during P8-C6-B correctness check",
      );
    }

    if (control.status !== 204 || candidate.status !== 204) {
      throw new Error("Unexpected status during P8-C6-B correctness check");
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
        throw new Error("Unexpected async request result in P8-C6-B");
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
