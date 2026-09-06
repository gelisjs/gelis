import { Gelis } from "../../src";

const ROUTES = 5_000;
const SAMPLES = 61;
const ITERATIONS = 300_000;
const WARMUP_ITERATIONS = 75_000;

type RequestScope = {
  readonly userId: number;
  readonly tenantId: number;
};

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

const scopePool = new Array<RequestScope>(64);

for (let index = 0; index < scopePool.length; index++) {
  scopePool[index] = {
    userId: index + 1,

    tenantId: index * 3 + 7,
  };
}

let epoch = 0;

let numericSink = 0;

const response = new Response(null, {
  status: 204,
});

function deriveScope({
  params,
}: {
  params: Record<string, string>;
}): RequestScope {
  const id = params.id ?? "";

  return scopePool[(epoch + id.length) & 63]!;
}

const controlApp = new Gelis();

const candidateApp = new Gelis();

const requestRoutes = candidateApp.requestContext(deriveScope);

type CandidateRootBefore = typeof candidateApp;

for (let index = 0; index < ROUTES; index++) {
  const kind = index % 4;

  if (kind === 0 || kind === 2) {
    const path = `/plain/${index}` as const;

    controlApp.get(path, () => response);

    candidateApp.get(path, () => response);

    continue;
  }

  if (kind === 1) {
    const path = `/lifecycle/${index}/:id` as const;

    const lifecycle = {
      beforeHandle() {
        numericSink ^= index;
      },

      afterHandle() {
        numericSink ^= index << 1;
      },
    };

    controlApp.get(
      path,

      ({ params }) => {
        numericSink ^= params.id!.length + index;

        return response;
      },

      lifecycle,
    );

    candidateApp.get(
      path,

      ({ params }) => {
        numericSink ^= params.id!.length + index;

        return response;
      },

      lifecycle,
    );

    continue;
  }

  const path = `/request/${index}/:id` as const;

  controlApp.get(
    path,

    (context) => {
      const scope = deriveScope(context);

      numericSink ^=
        scope.userId + scope.tenantId + context.params.id!.length + index;

      return response;
    },
  );

  requestRoutes.get(
    path,

    (context, scope) => {
      numericSink ^=
        scope.userId + scope.tenantId + context.params.id!.length + index;

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

const requests = {
  plain: new Request("http://gelis.test/plain/4998"),

  lifecycle: new Request("http://gelis.test/lifecycle/4997/abc"),

  requestScope: new Request("http://gelis.test/request/4999/abc"),
} as const;

assertCorrectness();

const pairs: Pair[] = [
  {
    name: "plain-zero-unused",

    control: createRunner(controlApp, requests.plain),

    candidate: createRunner(candidateApp, requests.plain),
  },

  {
    name: "lifecycle-zero-unused",

    control: createRunner(controlApp, requests.lifecycle),

    candidate: createRunner(candidateApp, requests.lifecycle),
  },

  {
    name: "request-scope-dynamic",

    control: createRunner(controlApp, requests.requestScope),

    candidate: createRunner(candidateApp, requests.requestScope),
  },
];

for (const pair of pairs) {
  pair.control(WARMUP_ITERATIONS);

  pair.candidate(WARMUP_ITERATIONS);
}

const summaries = pairs.map((pair, pairIndex) =>
  summarize(
    pair.name,

    runPaired(pair.control, pair.candidate, pairIndex),
  ),
);

console.log("\nGelis P8-A6.1 integrated request-context paired diagnostic");

console.log(`Runtime:       bun ${Bun.version}`);

console.log(`Routes/app:    ${ROUTES.toLocaleString()}`);

console.log("Topology:      2500 plain + 1250 lifecycle + 1250 request-scope");

console.log(`Samples:       ${SAMPLES}`);

console.log(`Iterations:    ${ITERATIONS.toLocaleString()} / side / sample`);

console.log();

console.table(summaries);

console.log(`\nNumeric sink: ${numericSink}`);

function createRunner(app: Gelis, request: Request): Runner {
  return (iterations) => {
    let local = 0;

    for (let index = 0; index < iterations; index++) {
      const result = app.fetch(request);

      if (result instanceof Promise) {
        throw new Error(
          "Unexpected async result in synchronous P8-A6.1 benchmark",
        );
      }

      local ^= result.status;
    }

    numericSink ^= local;

    return local;
  };
}

function assertCorrectness(): void {
  for (const [controlRequest, candidateRequest] of [
    [requests.plain, requests.plain],

    [requests.lifecycle, requests.lifecycle],

    [requests.requestScope, requests.requestScope],
  ] as const) {
    const control = controlApp.fetch(controlRequest);

    const candidate = candidateApp.fetch(candidateRequest);

    if (control instanceof Promise || candidate instanceof Promise) {
      throw new Error(
        "Unexpected async result during P8-A6.1 correctness check",
      );
    }

    if (control.status !== 204 || candidate.status !== 204) {
      throw new Error("Unexpected P8-A6.1 response status");
    }
  }
}

function runPaired(
  control: Runner,
  candidate: Runner,
  pairIndex: number,
): Sample[] {
  const samples: Sample[] = [];

  for (let sampleIndex = 0; sampleIndex < SAMPLES; sampleIndex++) {
    epoch = (sampleIndex + pairIndex * 17 + 11) & 63;

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

function summarize(name: string, samples: readonly Sample[]) {
  const controlValues = samples.map((sample) => sample.control);

  const candidateValues = samples.map((sample) => sample.candidate);

  const controlFirst = samples.filter((sample) => sample.controlFirst);

  const candidateFirst = samples.filter((sample) => !sample.controlFirst);

  return {
    case: name,

    "control ns": round(median(controlValues), 2),

    "candidate ns": round(median(candidateValues), 2),

    "delta ns": signed(median(samples.map((sample) => sample.delta)), 2),

    "delta %": signed(median(samples.map((sample) => sample.deltaPercent)), 2),

    "control cv %": round(cv(controlValues), 2),

    "candidate cv %": round(cv(candidateValues), 2),

    wins: `${
      samples.filter((sample) => sample.candidate < sample.control).length
    }/${samples.length}`,

    "control-first %": signed(
      median(controlFirst.map((sample) => sample.deltaPercent)),
      2,
    ),

    "candidate-first %": signed(
      median(candidateFirst.map((sample) => sample.deltaPercent)),
      2,
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
