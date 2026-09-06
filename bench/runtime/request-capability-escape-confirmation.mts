const SAMPLES = 61;
const ITERATIONS = 250_000;
const WARMUP_ITERATIONS = 50_000;
const RING_SIZE = 8192;
const RING_MASK = RING_SIZE - 1;

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

type RequestFrame = {
  readonly context: BaseContext;

  readonly scope: RequestScope;
};

type Runner = (iterations: number) => number;

type Sample = {
  control: number;
  candidate: number;
  delta: number;
  deltaPercent: number;
  controlFirst: boolean;
};

type Summary = {
  candidate: string;
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

const frameRing = new Array<RequestFrame>(RING_SIZE);

let epoch = 0;
let numericSink = 0;

let contextSink: BaseContext | SymbolContext | undefined;

let frameSink: RequestFrame | undefined;

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

function beforeDirect(context: BaseContext, scope: RequestScope): number {
  return scope.userId + context.params.id.length;
}

function handlerDirect(context: BaseContext, scope: RequestScope): number {
  return scope.tenantId + context.params.id.length;
}

function afterDirect(
  context: BaseContext,
  result: number,
  scope: RequestScope,
): number {
  return result + scope.userId + context.params.id.length;
}

function beforeSymbol(context: SymbolContext): number {
  return context[REQUEST_SCOPE].userId + context.params.id.length;
}

function handlerSymbol(context: SymbolContext): number {
  return context[REQUEST_SCOPE].tenantId + context.params.id.length;
}

function afterSymbol(context: SymbolContext, result: number): number {
  return result + context[REQUEST_SCOPE].userId + context.params.id.length;
}

function beforeFrame(frame: RequestFrame): number {
  return frame.scope.userId + frame.context.params.id.length;
}

function handlerFrame(frame: RequestFrame): number {
  return frame.scope.tenantId + frame.context.params.id.length;
}

function afterFrame(frame: RequestFrame, result: number): number {
  return result + frame.scope.userId + frame.context.params.id.length;
}

function runLocalPass(iterations: number): number {
  let local = 0;

  for (let index = 0; index < iterations; index++) {
    const params = paramsPool[index & 255]!;

    const scope = deriveRequestScope(request, params);

    const context = createBaseContext(params);

    contextRing[index & RING_MASK] = context;

    local += beforeDirect(context, scope);

    const result = handlerDirect(context, scope);

    local += afterDirect(context, result, scope);
  }

  contextSink = contextRing[(iterations - 1) & RING_MASK];

  numericSink ^= local;

  return local;
}

function runSymbolConstruction(iterations: number): number {
  let local = 0;

  for (let index = 0; index < iterations; index++) {
    const params = paramsPool[index & 255]!;

    const scope = deriveRequestScope(request, params);

    const context = createSymbolContext(params, scope);

    contextRing[index & RING_MASK] = context;

    local += beforeSymbol(context);

    const result = handlerSymbol(context);

    local += afterSymbol(context, result);
  }

  contextSink = contextRing[(iterations - 1) & RING_MASK];

  numericSink ^= local;

  return local;
}

function runFrame(iterations: number): number {
  let local = 0;

  for (let index = 0; index < iterations; index++) {
    const params = paramsPool[index & 255]!;

    const scope = deriveRequestScope(request, params);

    const frame: RequestFrame = {
      context: createBaseContext(params),

      scope,
    };

    frameRing[index & RING_MASK] = frame;

    local += beforeFrame(frame);

    const result = handlerFrame(frame);

    local += afterFrame(frame, result);
  }

  frameSink = frameRing[(iterations - 1) & RING_MASK];

  numericSink ^= local;

  return local;
}

const candidates = [
  {
    name: "symbol-construction",

    run: runSymbolConstruction,
  },

  {
    name: "request-frame",

    run: runFrame,
  },
] as const;

assertCorrectness();

for (const candidate of candidates) {
  epoch = 1;

  runLocalPass(WARMUP_ITERATIONS);

  clearRings();

  candidate.run(WARMUP_ITERATIONS);

  clearRings();
}

const summaries: Summary[] = [];

for (
  let candidateIndex = 0;
  candidateIndex < candidates.length;
  candidateIndex++
) {
  const candidate = candidates[candidateIndex]!;

  summaries.push(
    summarize(
      candidate.name,

      runPaired(runLocalPass, candidate.run, candidateIndex),
    ),
  );
}

console.log("\nGelis P8-A5 request-capability escape confirmation");

console.log(`Runtime:       bun ${Bun.version}`);

console.log(`Samples:       ${SAMPLES}`);

console.log(`Iterations:    ${ITERATIONS.toLocaleString()} / side / sample`);

console.log(`Escape ring:   ${RING_SIZE.toLocaleString()}`);

console.log("Lifecycle:     before + handler + after");

console.log("Derivation:    identical request-scope object lookup");

console.log();

console.table(summaries.map(formatSummary));

console.log(`\nNumeric sink: ${numericSink}`);

console.log(`Context sink: ${contextSink?.params.id ?? "none"}`);

console.log(`Frame sink: ${frameSink?.context.params.id ?? "none"}`);

function assertCorrectness(): void {
  epoch = 3;

  const expected = runLocalPass(64);

  clearRings();

  for (const candidate of candidates) {
    epoch = 3;

    const actual = candidate.run(64);

    clearRings();

    if (actual !== expected) {
      throw new Error(`${candidate.name} correctness mismatch`);
    }
  }
}

function clearRings(): void {
  for (let index = 0; index < RING_SIZE; index++) {
    contextRing[index] = undefined as unknown as BaseContext;

    frameRing[index] = undefined as unknown as RequestFrame;
  }

  contextSink = undefined;

  frameSink = undefined;
}

function runPaired(
  control: Runner,

  candidate: Runner,

  candidateIndex: number,
): Sample[] {
  const samples: Sample[] = [];

  for (let sampleIndex = 0; sampleIndex < SAMPLES; sampleIndex++) {
    epoch = (sampleIndex + candidateIndex * 17 + 11) & 63;

    const controlFirst = sampleIndex % 2 === 0;

    let controlNs: number;

    let candidateNs: number;

    if (controlFirst) {
      clearRings();
      Bun.gc(true);

      controlNs = measure(control);

      clearRings();
      Bun.gc(true);

      candidateNs = measure(candidate);
    } else {
      clearRings();
      Bun.gc(true);

      candidateNs = measure(candidate);

      clearRings();
      Bun.gc(true);

      controlNs = measure(control);
    }

    clearRings();

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

function summarize(
  candidate: string,

  samples: readonly Sample[],
): Summary {
  const controlValues = samples.map((sample) => sample.control);

  const candidateValues = samples.map((sample) => sample.candidate);

  const controlFirst = samples.filter((sample) => sample.controlFirst);

  const candidateFirst = samples.filter((sample) => !sample.controlFirst);

  return {
    candidate,

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

function formatSummary(summary: Summary) {
  return {
    candidate: summary.candidate,

    "control ns": round(summary.controlMedian, 2),

    "candidate ns": round(summary.candidateMedian, 2),

    "delta ns": signed(summary.deltaMedian, 2),

    "delta %": signed(summary.deltaPercentMedian, 2),

    "control cv %": round(summary.controlCv, 2),

    "candidate cv %": round(summary.candidateCv, 2),

    wins: `${summary.candidateWins}/${summary.samples}`,

    "control-first %": signed(summary.controlFirstDeltaPercent, 2),

    "candidate-first %": signed(summary.candidateFirstDeltaPercent, 2),
  };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function signed(value: number, digits: number): string {
  const rounded = round(value, digits);

  return `${rounded > 0 ? "+" : ""}${rounded}`;
}
