import { Gelis } from "../../src";

import type { RouteContext } from "../../src";

import type { ValidRoutePath } from "../../src/types/path";

const ROUTES = 5_000;
const SAMPLES = 41;
const ITERATIONS = 100_000;
const WARMUP_ITERATIONS = 25_000;

type ServiceValue = {
  value: number;
};

type Services = {
  readonly cap0: ServiceValue;
  readonly cap7: ServiceValue;
  readonly cap13: ServiceValue;
  readonly cap23: ServiceValue;
};

type ScopedHandler<Path extends string, Scope, Result> = (
  context: RouteContext<Path>,
  scope: Scope,
) => Result;

class ScopedBuilder<Scope extends object> {
  readonly #app: Gelis;

  readonly #scope: Scope;

  constructor(app: Gelis, scope: Scope) {
    this.#app = app;
    this.#scope = scope;
  }

  get<const Path extends string, Result>(
    path: Path & ValidRoutePath<Path>,

    handler: ScopedHandler<Path, Scope, Result>,
  ): void {
    const scope = this.#scope;

    /*
     * Prototype hypothesis:
     *
     * Resolve the application scope once at
     * registration time, then store a normal unary
     * Gelis runtime handler.
     *
     * No request-context mutation, prototype swap,
     * Map lookup, or capability lookup occurs here.
     *
     * This benchmark does not need to expose the
     * RouteRef returned by Gelis. Keeping the
     * prototype registration-only also avoids adding
     * unrelated response-contract type algebra to
     * the P8-A3 measurement.
     */
    this.#app.get<Path, Result>(
      path,

      (context: RouteContext<Path>) => handler(context, scope),
    );
  }
}

function createScopedBuilder<const Scope extends object>(
  app: Gelis,
  scope: Scope,
): ScopedBuilder<Scope> {
  return new ScopedBuilder(app, scope);
}

const services: Services = {
  cap0: {
    value: 1,
  },

  cap7: {
    value: 8,
  },

  cap13: {
    value: 14,
  },

  cap23: {
    value: 24,
  },
};

const controlApp = new Gelis();

const candidateApp = new Gelis();

const scoped = createScopedBuilder(candidateApp, services);

type CandidateRootBefore = typeof candidateApp;

let numericSink = 0;

const response = new Response(null, {
  status: 204,
});

for (let index = 0; index < ROUTES; index++) {
  const isScoped = index % 2 === 1;

  if (!isScoped) {
    const path = `/plain/${index}` as const;

    controlApp.get(
      path,

      ({ params }) => {
        numericSink ^= index + Object.keys(params).length;

        return response;
      },
    );

    candidateApp.get(
      path,

      ({ params }) => {
        numericSink ^= index + Object.keys(params).length;

        return response;
      },
    );

    continue;
  }

  const path = `/scoped/${index}/:id` as const;

  controlApp.get(
    path,

    ({ params }) => {
      numericSink ^=
        services.cap0.value +
        services.cap7.value +
        services.cap13.value +
        services.cap23.value +
        params.id!.length +
        index;

      return response;
    },
  );

  scoped.get(
    path,

    (
      { params },

      scope,
    ) => {
      numericSink ^=
        scope.cap0.value +
        scope.cap7.value +
        scope.cap13.value +
        scope.cap23.value +
        params.id!.length +
        index;

      return response;
    },
  );
}

type CandidateRootAfter = typeof candidateApp;

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2
    ? true
    : false;

const rootStable: Equal<CandidateRootBefore, CandidateRootAfter> = true;

void rootStable;

if (false) {
  const typeApp = new Gelis();

  const typed = createScopedBuilder(typeApp, {
    db: {
      name: "database",
    },
  } as const);

  typed.get(
    "/users/:id",

    (
      { params },

      scope,
    ) => {
      const id: string = params.id;

      const name: "database" = scope.db.name;

      void id;
      void name;

      // @ts-expect-error unknown scope property.
      void scope.cache;

      return {
        id,
      };
    },
  );
}

const requests = {
  plainStatic: new Request("http://gelis.test/plain/4998"),

  scopedDynamic: new Request("http://gelis.test/scoped/4999/abc"),
} as const;

assertCorrectness();

type Runner = (iterations: number) => number;

type Pair = {
  name: string;
  control: Runner;
  candidate: Runner;
};

type Sample = {
  control: number;
  candidate: number;
  delta: number;
  deltaPercent: number;
  controlFirst: boolean;
};

type Summary = {
  case: string;
  controlMedian: number;
  candidateMedian: number;
  deltaMedian: number;
  deltaPercentMedian: number;
  controlCv: number;
  candidateCv: number;
  candidateWins: number;
  samples: number;
  controlFirstDeltaPercent: number;
  candidateFirstDeltaPercent: number;
};

const pairs: Pair[] = [
  {
    name: "plain-static-zero-unused",

    control: createFetchRunner(controlApp, requests.plainStatic),

    candidate: createFetchRunner(candidateApp, requests.plainStatic),
  },

  {
    name: "scoped-dynamic",

    control: createFetchRunner(controlApp, requests.scopedDynamic),

    candidate: createFetchRunner(candidateApp, requests.scopedDynamic),
  },
];

for (const pair of pairs) {
  pair.control(WARMUP_ITERATIONS);

  pair.candidate(WARMUP_ITERATIONS);
}

const summaries: Summary[] = [];

for (let pairIndex = 0; pairIndex < pairs.length; pairIndex++) {
  const pair = pairs[pairIndex]!;

  summaries.push(
    summarize(pair.name, runPaired(pair.control, pair.candidate, pairIndex)),
  );
}

console.log("\nGelis P8-A3 integrated scoped-builder paired diagnostic");

console.log(`Runtime:       bun ${Bun.version}`);

console.log(`Routes/app:    ${ROUTES.toLocaleString()}`);

console.log("Topology:      2500 plain static + 2500 scoped dynamic");

console.log(`Samples:       ${SAMPLES}`);

console.log(`Iterations:    ${ITERATIONS.toLocaleString()} / side / sample`);

console.log();

console.table(
  summaries.map((summary) => ({
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

console.log(`\nNumeric sink: ${numericSink}`);

function createFetchRunner(app: Gelis, request: Request): Runner {
  return (iterations) => {
    let local = 0;

    for (let index = 0; index < iterations; index++) {
      const result = app.fetch(request);

      if (result instanceof Promise) {
        throw new Error(
          "Unexpected async result in P8-A3 synchronous benchmark",
        );
      }

      local ^= result.status;
    }

    numericSink ^= local;

    return local;
  };
}

function assertCorrectness(): void {
  const controlPlain = controlApp.fetch(requests.plainStatic);

  const candidatePlain = candidateApp.fetch(requests.plainStatic);

  const controlScoped = controlApp.fetch(requests.scopedDynamic);

  const candidateScoped = candidateApp.fetch(requests.scopedDynamic);

  if (
    controlPlain instanceof Promise ||
    candidatePlain instanceof Promise ||
    controlScoped instanceof Promise ||
    candidateScoped instanceof Promise
  ) {
    throw new Error("Unexpected async result during P8-A3 correctness check");
  }

  for (const result of [
    controlPlain,
    candidatePlain,
    controlScoped,
    candidateScoped,
  ]) {
    if (result.status !== 204) {
      throw new Error(`Unexpected status: ${result.status}`);
    }
  }
}

function mutateServices(seed: number): void {
  services.cap0.value = (seed * 17 + 1) & 1023;

  services.cap7.value = (seed * 19 + 7) & 1023;

  services.cap13.value = (seed * 23 + 13) & 1023;

  services.cap23.value = (seed * 29 + 23) & 1023;
}

function runPaired(
  control: Runner,
  candidate: Runner,
  pairIndex: number,
): Sample[] {
  const samples: Sample[] = [];

  for (let sampleIndex = 0; sampleIndex < SAMPLES; sampleIndex++) {
    mutateServices(sampleIndex + pairIndex * 101 + 17);

    const controlFirst = sampleIndex % 2 === 0;

    let controlNs: number;

    let candidateNs: number;

    if (controlFirst) {
      Bun.gc(true);

      controlNs = measure(control);

      Bun.gc(true);

      candidateNs = measure(candidate);
    } else {
      Bun.gc(true);

      candidateNs = measure(candidate);

      Bun.gc(true);

      controlNs = measure(control);
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

function measure(runner: Runner): number {
  const start = Bun.nanoseconds();

  runner(ITERATIONS);

  return (Bun.nanoseconds() - start) / ITERATIONS;
}

function summarize(name: string, samples: readonly Sample[]): Summary {
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
  const mean =
    values.reduce((total, value) => total + value, 0) / values.length;

  const variance =
    values.reduce((total, value) => {
      const delta = value - mean;

      return total + delta * delta;
    }, 0) / values.length;

  return (Math.sqrt(variance) / mean) * 100;
}

function median(values: readonly number[]): number {
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

  return `${rounded > 0 ? "+" : ""}${rounded}`;
}
