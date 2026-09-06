const MODE = process.argv[2];

const ITERATIONS = 1_000_000;

const WARMUP = 200_000;

const RING_SIZE = 8192;

const RING_MASK = RING_SIZE - 1;

const SAMPLES = 31;

const REQUEST_SCOPE = Symbol("gelis.request.scope");

type RequestScope = {
  readonly userId: number;

  readonly tenantId: number;
};

type BaseContext = {
  request: Request;

  params: {
    id: string;
  };

  query: undefined;

  body: undefined;

  reply: typeof runtimeReply;
};

type SymbolContext = BaseContext & {
  readonly [REQUEST_SCOPE]: RequestScope;
};

type Sample = {
  control: number;

  candidate: number;

  delta: number;

  deltaPercent: number;

  controlFirst: boolean;
};

const runtimeReply = {
  status(status: number, body?: unknown) {
    return {
      status,
      body,
    };
  },
};

const request = new Request("http://gelis.test/users/42");

const paramsPool = new Array<{
  id: string;
}>(256);

for (let index = 0; index < paramsPool.length; index++) {
  paramsPool[index] = {
    id: String(index),
  };
}

const requestScopes = new Array<RequestScope>(64);

for (let index = 0; index < requestScopes.length; index++) {
  requestScopes[index] = {
    userId: index + 1,

    tenantId: index * 3 + 7,
  };
}

const contextRing = new Array<BaseContext | SymbolContext>(RING_SIZE);

let epoch = Number(process.env.GELIS_A5_EPOCH ?? "0");

let sink = 0;

function deriveRequestScope(
  currentRequest: Request,

  params: {
    id: string;
  },
): RequestScope {
  const index = (epoch + currentRequest.method.length + params.id.length) & 63;

  return requestScopes[index]!;
}

function createBaseContext(params: { id: string }): BaseContext {
  return {
    request,
    params,

    query: undefined,

    body: undefined,

    reply: runtimeReply,
  };
}

function createSymbolContext(
  params: {
    id: string;
  },

  scope: RequestScope,
): SymbolContext {
  return {
    request,
    params,

    query: undefined,

    body: undefined,

    reply: runtimeReply,

    [REQUEST_SCOPE]: scope,
  };
}

function runBase(iterations: number): number {
  let local = 0;

  for (let index = 0; index < iterations; index++) {
    const params = paramsPool[index & 255]!;

    const scope = deriveRequestScope(request, params);

    const context = createBaseContext(params);

    contextRing[index & RING_MASK] = context;

    local += scope.userId + scope.tenantId + context.params.id.length * 3;
  }

  sink ^= local;

  return local;
}

function runSymbol(iterations: number): number {
  let local = 0;

  for (let index = 0; index < iterations; index++) {
    const params = paramsPool[index & 255]!;

    const scope = deriveRequestScope(request, params);

    const context = createSymbolContext(params, scope);

    contextRing[index & RING_MASK] = context;

    local +=
      context[REQUEST_SCOPE].userId +
      context[REQUEST_SCOPE].tenantId +
      context.params.id.length * 3;
  }

  sink ^= local;

  return local;
}

if (MODE === "child-base" || MODE === "child-symbol") {
  const runner = MODE === "child-base" ? runBase : runSymbol;

  runner(WARMUP);

  Bun.gc(true);

  const start = Bun.nanoseconds();

  runner(ITERATIONS);

  const ns = (Bun.nanoseconds() - start) / ITERATIONS;

  process.stdout.write(
    JSON.stringify({
      ns,
      sink,
    }),
  );

  process.exit(0);
}

const samples: Sample[] = [];

for (let sampleIndex = 0; sampleIndex < SAMPLES; sampleIndex++) {
  const controlFirst = sampleIndex % 2 === 0;

  const epochValue = (sampleIndex * 17 + 11) & 63;

  let control: number;

  let candidate: number;

  if (controlFirst) {
    control = runChild("child-base", epochValue);

    candidate = runChild("child-symbol", epochValue);
  } else {
    candidate = runChild("child-symbol", epochValue);

    control = runChild("child-base", epochValue);
  }

  const delta = candidate - control;

  samples.push({
    control,
    candidate,
    delta,

    deltaPercent: (delta / control) * 100,

    controlFirst,
  });
}

const controlValues = samples.map((sample) => sample.control);

const candidateValues = samples.map((sample) => sample.candidate);

const controlFirstSamples = samples.filter((sample) => sample.controlFirst);

const candidateFirstSamples = samples.filter((sample) => !sample.controlFirst);

const summary = {
  candidate: "symbol-construction",

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
    median(controlFirstSamples.map((sample) => sample.deltaPercent)),
    2,
  ),

  "candidate-first %": signed(
    median(candidateFirstSamples.map((sample) => sample.deltaPercent)),
    2,
  ),
};

console.log("\nGelis P8-A5 request-capability fresh-process confirmation");

console.log(`Runtime:       bun ${Bun.version}`);

console.log(`Samples:       ${SAMPLES}`);

console.log(`Iterations:    ${ITERATIONS.toLocaleString()} / child`);

console.log(`Warmup:        ${WARMUP.toLocaleString()} / child`);

console.log(`Escape ring:   ${RING_SIZE.toLocaleString()}`);

console.log("Process model: paired fresh Bun processes");

console.log();

console.table([summary]);

function runChild(
  childMode: "child-base" | "child-symbol",

  epochValue: number,
): number {
  const result = Bun.spawnSync({
    cmd: [process.execPath, import.meta.path, childMode],

    env: {
      ...process.env,

      GELIS_A5_EPOCH: String(epochValue),
    },

    stdout: "pipe",

    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr));
  }

  const parsed = JSON.parse(new TextDecoder().decode(result.stdout)) as {
    ns: number;

    sink: number;
  };

  sink ^= parsed.sink;

  return parsed.ns;
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

  return `${rounded > 0 ? "+" : ""}${rounded}`;
}
