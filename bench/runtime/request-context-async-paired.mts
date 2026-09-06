import { Gelis } from "../../src";

const ROUTES = 5_000;
const SAMPLES = 41;
const ITERATIONS = 50_000;
const WARMUP_ITERATIONS = 10_000;

type RequestScope = {
  readonly userId: number;
  readonly tenantId: number;
};

type AsyncRunner = (iterations: number) => Promise<number>;

type Pair = {
  name: string;
  control: AsyncRunner;
  candidate: AsyncRunner;
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

/*
 * Shared async derivation used by both control and candidate.
 *
 * Awaiting a resolved Promise forces one asynchronous continuation
 * while keeping external I/O out of this framework-overhead gate.
 */
async function deriveScope({
  params,
}: {
  params: Record<string, string>;
}): Promise<RequestScope> {
  const currentEpoch = await Promise.resolve(epoch);

  const id = params.id ?? "";

  return scopePool[(currentEpoch + id.length) & 63]!;
}

const controlApp = new Gelis();

const candidateApp = new Gelis();

const requestRoutes = candidateApp.requestContext(deriveScope);

for (let index = 0; index < ROUTES; index++) {
  const kind = index % 4;

  if (kind === 0 || kind === 2) {
    const path = `/plain/${index}` as const;

    controlApp.get(path, () => response);

    candidateApp.get(path, () => response);

    continue;
  }

  if (kind === 1) {
    const path = `/async-scope/${index}/:id` as const;

    controlApp.get(
      path,

      async (context) => {
        const scope = await deriveScope(context);

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

    continue;
  }

  const path = `/async-lifecycle/${index}/:id` as const;

  /*
   * Control = implementable fused async lower bound:
   * derive once, await it, then execute before/handler/after work
   * linearly inside one ordinary async route handler.
   */
  controlApp.get(
    path,

    async (context) => {
      const scope = await deriveScope(context);

      const idLength = context.params.id!.length;

      // before
      numericSink ^= scope.userId + idLength + index;

      // handler
      numericSink ^= scope.tenantId + idLength + index;

      const result = response;

      // after
      numericSink ^= scope.userId + scope.tenantId + result.status + index;

      return result;
    },
  );

  /*
   * Candidate = requestContext async derive with local lifecycle.
   * Phase work intentionally matches the fused control.
   */
  requestRoutes.get(
    path,

    (context, scope) => {
      numericSink ^= scope.tenantId + context.params.id!.length + index;

      return response;
    },

    {
      beforeHandle(context, scope) {
        numericSink ^= scope.userId + context.params.id!.length + index;
      },

      afterHandle(_context, result, scope) {
        numericSink ^= scope.userId + scope.tenantId + result.status + index;
      },
    },
  );
}

const requests = {
  asyncScope: new Request("http://gelis.test/async-scope/4997/abc"),

  asyncLifecycle: new Request("http://gelis.test/async-lifecycle/4999/abc"),
} as const;

await assertCorrectness();

const pairs: Pair[] = [
  {
    name: "async-request-scope",

    control: createAsyncRunner(controlApp, requests.asyncScope),

    candidate: createAsyncRunner(candidateApp, requests.asyncScope),
  },

  {
    name: "async-request-scope-lifecycle",

    control: createAsyncRunner(controlApp, requests.asyncLifecycle),

    candidate: createAsyncRunner(candidateApp, requests.asyncLifecycle),
  },
];

for (const pair of pairs) {
  await pair.control(WARMUP_ITERATIONS);

  await pair.candidate(WARMUP_ITERATIONS);
}

const summaries = [];

for (let pairIndex = 0; pairIndex < pairs.length; pairIndex++) {
  const pair = pairs[pairIndex]!;

  summaries.push(
    summarize(
      pair.name,

      await runPaired(pair.control, pair.candidate, pairIndex),
    ),
  );
}

console.log("\nGelis P8-A6.5 async request-context paired diagnostic");

console.log(`Runtime:       bun ${Bun.version}`);

console.log(`Routes/app:    ${ROUTES.toLocaleString()}`);

console.log(
  "Topology:      2500 plain + 1250 async request-scope + 1250 async request-scope lifecycle",
);

console.log(`Samples:       ${SAMPLES}`);

console.log(`Iterations:    ${ITERATIONS.toLocaleString()} / side / sample`);

console.log(
  "Derivation:    identical async function with one resolved-Promise await",
);

console.log(
  "Control:       ordinary async route with fused manual scope delivery",
);

console.log();

console.table(summaries);

console.log(`\nNumeric sink: ${numericSink}`);

function createAsyncRunner(app: Gelis, request: Request): AsyncRunner {
  return async (iterations) => {
    let local = 0;

    for (let index = 0; index < iterations; index++) {
      const result = app.fetch(request);

      if (!(result instanceof Promise)) {
        throw new Error("Expected asynchronous P8-A6.5 route result");
      }

      const resolved = await result;

      local ^= resolved.status;
    }

    numericSink ^= local;

    return local;
  };
}

async function assertCorrectness(): Promise<void> {
  for (const request of [
    requests.asyncScope,
    requests.asyncLifecycle,
  ] as const) {
    const control = controlApp.fetch(request);

    const candidate = candidateApp.fetch(request);

    if (!(control instanceof Promise) || !(candidate instanceof Promise)) {
      throw new Error("Expected Promise from P8-A6.5 async correctness route");
    }

    const [controlResponse, candidateResponse] = await Promise.all([
      control,
      candidate,
    ]);

    if (controlResponse.status !== 204 || candidateResponse.status !== 204) {
      throw new Error("Unexpected P8-A6.5 response status");
    }
  }
}

async function runPaired(
  control: AsyncRunner,
  candidate: AsyncRunner,
  pairIndex: number,
): Promise<Sample[]> {
  const samples: Sample[] = [];

  for (let sampleIndex = 0; sampleIndex < SAMPLES; sampleIndex++) {
    epoch = (sampleIndex + pairIndex * 17 + 11) & 63;

    const controlFirst = sampleIndex % 2 === 0;

    let controlNs: number;

    let candidateNs: number;

    if (controlFirst) {
      Bun.gc(true);

      controlNs = await measure(control);

      Bun.gc(true);

      candidateNs = await measure(candidate);
    } else {
      Bun.gc(true);

      candidateNs = await measure(candidate);

      Bun.gc(true);

      controlNs = await measure(control);
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

async function measure(runner: AsyncRunner): Promise<number> {
  const start = Bun.nanoseconds();

  await runner(ITERATIONS);

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
