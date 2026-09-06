const SAMPLES = 61;
const ACCESS_ITERATIONS = 750_000;
const MATERIALIZE_ITERATIONS = 250_000;
const CONTEXT_POOL_SIZE = 4096;
const CONTEXT_POOL_MASK = CONTEXT_POOL_SIZE - 1;
const RING_SIZE = 8192;
const RING_MASK = RING_SIZE - 1;
const WARMUP_ITERATIONS = 150_000;

type CapabilityObject = {
  value: number;
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

type Scope = {
  readonly cap0: CapabilityObject;
  readonly cap7: CapabilityObject;
  readonly cap13: CapabilityObject;
  readonly cap23: CapabilityObject;
};

type ScopedContext = BaseContext & Scope;

type AccessRunner = (iterations: number) => number;

type MaterializeRunner = (iterations: number) => BaseContext;

type PairedSample = {
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

const request = new Request("http://gelis.test/context-model");

const capabilities = [
  { value: 1 },
  { value: 8 },
  { value: 14 },
  { value: 24 },
] satisfies CapabilityObject[];

const [cap0, cap7, cap13, cap23] = capabilities as [
  CapabilityObject,
  CapabilityObject,
  CapabilityObject,
  CapabilityObject,
];

const scope: Scope = {
  cap0,
  cap7,
  cap13,
  cap23,
};

const baseContexts = createContextPool(createBaseContext);

const scopedContexts = createContextPool(createScopedContext);

const materializeRing = new Array<BaseContext>(RING_SIZE);

let numericSink = 0;

let objectSink: BaseContext | undefined;

function lowerBoundHandler(context: BaseContext): number {
  return (
    cap0.value +
    cap7.value +
    cap13.value +
    cap23.value +
    context.params.id.length
  );
}

function closureScopeHandler(context: BaseContext): number {
  return (
    scope.cap0.value +
    scope.cap7.value +
    scope.cap13.value +
    scope.cap23.value +
    context.params.id.length
  );
}

function secondArgHandler(context: BaseContext, values: Scope): number {
  return (
    values.cap0.value +
    values.cap7.value +
    values.cap13.value +
    values.cap23.value +
    context.params.id.length
  );
}

const compiledUnaryHandler = (context: BaseContext): number =>
  secondArgHandler(context, scope);

function inheritedHandler(context: ScopedContext): number {
  return (
    context.cap0.value +
    context.cap7.value +
    context.cap13.value +
    context.cap23.value +
    context.params.id.length
  );
}

function runLowerBoundAccess(iterations: number): number {
  let local = 0;

  for (let index = 0; index < iterations; index++) {
    local += lowerBoundHandler(baseContexts[index & CONTEXT_POOL_MASK]!);
  }

  numericSink ^= local;

  return local;
}

function runClosureScopeAccess(iterations: number): number {
  let local = 0;

  for (let index = 0; index < iterations; index++) {
    local += closureScopeHandler(baseContexts[index & CONTEXT_POOL_MASK]!);
  }

  numericSink ^= local;

  return local;
}

function runSecondArgAccess(iterations: number): number {
  let local = 0;

  for (let index = 0; index < iterations; index++) {
    const context = baseContexts[index & CONTEXT_POOL_MASK]!;

    local += secondArgHandler(context, scope);
  }

  numericSink ^= local;

  return local;
}

function runCompiledUnaryAccess(iterations: number): number {
  let local = 0;

  for (let index = 0; index < iterations; index++) {
    local += compiledUnaryHandler(baseContexts[index & CONTEXT_POOL_MASK]!);
  }

  numericSink ^= local;

  return local;
}

function runInheritedAccess(iterations: number): number {
  let local = 0;

  for (let index = 0; index < iterations; index++) {
    local += inheritedHandler(scopedContexts[index & CONTEXT_POOL_MASK]!);
  }

  numericSink ^= local;

  return local;
}

function createBaseContext(index = 0): BaseContext {
  return {
    request,

    params: {
      id: String(index & 255),
    },

    query: undefined,
    body: undefined,

    reply: runtimeReply,
  };
}

function createScopedContext(index = 0): ScopedContext {
  return {
    __proto__: scope,

    request,

    params: {
      id: String(index & 255),
    },

    query: undefined,
    body: undefined,

    reply: runtimeReply,
  } as unknown as ScopedContext;
}

function createContextPool<Context extends BaseContext>(
  factory: (index: number) => Context,
): Context[] {
  const result = new Array<Context>(CONTEXT_POOL_SIZE);

  for (let index = 0; index < CONTEXT_POOL_SIZE; index++) {
    result[index] = factory(index);
  }

  return result;
}

function runBaseMaterialize(iterations: number): BaseContext {
  let last = createBaseContext();

  for (let index = 0; index < iterations; index++) {
    const context = createBaseContext(index);

    materializeRing[index & RING_MASK] = context;

    last = context;
  }

  objectSink = materializeRing[(iterations - 1) & RING_MASK];

  return last;
}

function runScopedMaterialize(iterations: number): BaseContext {
  let last: ScopedContext = createScopedContext();

  for (let index = 0; index < iterations; index++) {
    const context = createScopedContext(index);

    materializeRing[index & RING_MASK] = context;

    last = context;
  }

  objectSink = materializeRing[(iterations - 1) & RING_MASK];

  return last;
}

const accessCandidates = [
  {
    name: "scope-object-closure",
    run: runClosureScopeAccess,
  },

  {
    name: "scope-second-arg",
    run: runSecondArgAccess,
  },

  {
    name: "compiled-unary-wrapper",
    run: runCompiledUnaryAccess,
  },

  {
    name: "inherited-property",
    run: runInheritedAccess,
  },
] as const;

assertCorrectness();

for (const candidate of accessCandidates) {
  warmAccess(runLowerBoundAccess, candidate.run);
}

warmMaterialize(runBaseMaterialize, runScopedMaterialize);

const accessSummaries: Summary[] = [];

for (let index = 0; index < accessCandidates.length; index++) {
  const candidate = accessCandidates[index]!;

  accessSummaries.push(
    summarize(
      candidate.name,
      runAccessPaired(runLowerBoundAccess, candidate.run, index),
    ),
  );
}

const materializeSummary = summarize(
  "scoped-prototype",
  runMaterializePaired(runBaseMaterialize, runScopedMaterialize),
);

console.log(
  "\nGelis P8-A2 confirmation + resolved-capability delivery diagnostic",
);

console.log(`Runtime:                  bun ${Bun.version}`);

console.log(`Samples:                  ${SAMPLES}`);

console.log(
  `Access iterations:        ${ACCESS_ITERATIONS.toLocaleString()} / side / sample`,
);

console.log(
  `Materialize iterations:   ${MATERIALIZE_ITERATIONS.toLocaleString()} / side / sample`,
);

console.log("Capability reads:         4 / access operation");

console.log();

console.log("Resolved application-capability delivery");

console.table(accessSummaries.map(formatSummary));

console.log("\nScoped custom-prototype materialization confirmation");

console.table([formatSummary(materializeSummary)]);

console.log(`\nNumeric sink: ${numericSink}`);

console.log(`Object sink: ${objectSink?.params.id ?? "none"}`);

function assertCorrectness(): void {
  const expected = lowerBoundHandler(baseContexts[0]!);

  if (closureScopeHandler(baseContexts[0]!) !== expected) {
    throw new Error("Scope closure correctness failure");
  }

  if (secondArgHandler(baseContexts[0]!, scope) !== expected) {
    throw new Error("Second-arg correctness failure");
  }

  if (compiledUnaryHandler(baseContexts[0]!) !== expected) {
    throw new Error("Compiled wrapper correctness failure");
  }

  if (inheritedHandler(scopedContexts[0]!) !== expected) {
    throw new Error("Inherited property correctness failure");
  }
}

function mutateCapabilities(seed: number): void {
  for (let index = 0; index < capabilities.length; index++) {
    capabilities[index]!.value = (seed * 17 + index * 29 + 11) & 1023;
  }
}

function warmAccess(control: AccessRunner, candidate: AccessRunner): void {
  mutateCapabilities(1);

  control(WARMUP_ITERATIONS);

  candidate(WARMUP_ITERATIONS);
}

function warmMaterialize(
  control: MaterializeRunner,
  candidate: MaterializeRunner,
): void {
  control(20_000);

  candidate(20_000);
}

function runAccessPaired(
  control: AccessRunner,
  candidate: AccessRunner,
  candidateIndex: number,
): PairedSample[] {
  const samples: PairedSample[] = [];

  for (let sampleIndex = 0; sampleIndex < SAMPLES; sampleIndex++) {
    mutateCapabilities(sampleIndex + candidateIndex * 101 + 13);

    const controlFirst = sampleIndex % 2 === 0;

    let controlNs: number;

    let candidateNs: number;

    if (controlFirst) {
      forceGc();

      controlNs = measureAccess(control);

      forceGc();

      candidateNs = measureAccess(candidate);
    } else {
      forceGc();

      candidateNs = measureAccess(candidate);

      forceGc();

      controlNs = measureAccess(control);
    }

    samples.push(makeSample(controlNs, candidateNs, controlFirst));
  }

  return samples;
}

function runMaterializePaired(
  control: MaterializeRunner,
  candidate: MaterializeRunner,
): PairedSample[] {
  const samples: PairedSample[] = [];

  for (let sampleIndex = 0; sampleIndex < SAMPLES; sampleIndex++) {
    const controlFirst = sampleIndex % 2 === 0;

    let controlNs: number;

    let candidateNs: number;

    if (controlFirst) {
      clearRing();
      forceGc();

      controlNs = measureMaterialize(control);

      clearRing();
      forceGc();

      candidateNs = measureMaterialize(candidate);
    } else {
      clearRing();
      forceGc();

      candidateNs = measureMaterialize(candidate);

      clearRing();
      forceGc();

      controlNs = measureMaterialize(control);
    }

    clearRing();

    samples.push(makeSample(controlNs, candidateNs, controlFirst));
  }

  return samples;
}

function measureAccess(runner: AccessRunner): number {
  const start = Bun.nanoseconds();

  runner(ACCESS_ITERATIONS);

  return (Bun.nanoseconds() - start) / ACCESS_ITERATIONS;
}

function measureMaterialize(runner: MaterializeRunner): number {
  const start = Bun.nanoseconds();

  runner(MATERIALIZE_ITERATIONS);

  return (Bun.nanoseconds() - start) / MATERIALIZE_ITERATIONS;
}

function clearRing(): void {
  for (let index = 0; index < materializeRing.length; index++) {
    materializeRing[index] = undefined as unknown as BaseContext;
  }

  objectSink = undefined;
}

function forceGc(): void {
  Bun.gc(true);
}

function makeSample(
  control: number,
  candidate: number,
  controlFirst: boolean,
): PairedSample {
  const delta = candidate - control;

  return {
    control,
    candidate,
    delta,

    deltaPercent: (delta / control) * 100,

    controlFirst,
  };
}

function summarize(
  candidate: string,
  samples: readonly PairedSample[],
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

    controlCv: coefficientOfVariation(controlValues),

    candidateCv: coefficientOfVariation(candidateValues),

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

function coefficientOfVariation(values: readonly number[]): number {
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

    "delta ns": signedRound(summary.deltaMedian, 2),

    "delta %": signedRound(summary.deltaPercentMedian, 2),

    "control cv %": round(summary.controlCv, 2),

    "candidate cv %": round(summary.candidateCv, 2),

    wins: `${summary.candidateWins}/${summary.samples}`,

    "control-first %": signedRound(summary.controlFirstDeltaPercent, 2),

    "candidate-first %": signedRound(summary.candidateFirstDeltaPercent, 2),
  };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function signedRound(value: number, digits: number): string {
  const rounded = round(value, digits);

  return `${rounded > 0 ? "+" : ""}${rounded}`;
}
