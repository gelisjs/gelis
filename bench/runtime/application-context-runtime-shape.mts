const SAMPLES = 41;
const ACCESS_ITERATIONS = 500_000;
const MATERIALIZE_ITERATIONS = 100_000;
const CONTEXT_POOL_SIZE = 4096;
const CONTEXT_POOL_MASK = CONTEXT_POOL_SIZE - 1;
const MATERIALIZE_RING_SIZE = 4096;
const MATERIALIZE_RING_MASK = MATERIALIZE_RING_SIZE - 1;
const WARMUP_ITERATIONS = 100_000;

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
  readonly cap1: CapabilityObject;
  readonly cap2: CapabilityObject;
  readonly cap3: CapabilityObject;
  readonly cap4: CapabilityObject;
  readonly cap5: CapabilityObject;
  readonly cap6: CapabilityObject;
  readonly cap7: CapabilityObject;
  readonly cap8: CapabilityObject;
  readonly cap9: CapabilityObject;
  readonly cap10: CapabilityObject;
  readonly cap11: CapabilityObject;
  readonly cap12: CapabilityObject;
  readonly cap13: CapabilityObject;
  readonly cap14: CapabilityObject;
  readonly cap15: CapabilityObject;
  readonly cap16: CapabilityObject;
  readonly cap17: CapabilityObject;
  readonly cap18: CapabilityObject;
  readonly cap19: CapabilityObject;
  readonly cap20: CapabilityObject;
  readonly cap21: CapabilityObject;
  readonly cap22: CapabilityObject;
  readonly cap23: CapabilityObject;
  readonly cap24: CapabilityObject;
  readonly cap25: CapabilityObject;
  readonly cap26: CapabilityObject;
  readonly cap27: CapabilityObject;
  readonly cap28: CapabilityObject;
  readonly cap29: CapabilityObject;
  readonly cap30: CapabilityObject;
  readonly cap31: CapabilityObject;
};

type ScopedContext = BaseContext & Scope;

declare const capabilityValue: unique symbol;

type Capability<Value> = {
  readonly name: string;
  readonly slot: number;
  readonly [capabilityValue]?: Value;
};

type CapabilityValue<Token> =
  Token extends Capability<infer Value> ? Value : never;

type TokenContext = BaseContext & {
  use<const Token extends Capability<unknown>>(
    token: Token,
  ): CapabilityValue<Token>;
};

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

const capabilityObjects = createCapabilityObjects();

const scope = createScope(capabilityObjects);

const controlCap0 = capabilityObjects[0]!;
const controlCap7 = capabilityObjects[7]!;
const controlCap13 = capabilityObjects[13]!;
const controlCap23 = capabilityObjects[23]!;

const cap0 = defineCapability<CapabilityObject>("cap0", 0);

const cap7 = defineCapability<CapabilityObject>("cap7", 7);

const cap13 = defineCapability<CapabilityObject>("cap13", 13);

const cap23 = defineCapability<CapabilityObject>("cap23", 23);

const tokenValues: readonly CapabilityObject[] = capabilityObjects;

const tokenMap = new Map<Capability<unknown>, unknown>();

tokenMap.set(cap0, controlCap0);
tokenMap.set(cap7, controlCap7);
tokenMap.set(cap13, controlCap13);
tokenMap.set(cap23, controlCap23);

const TOKEN_VALUES = Symbol("gelis.context.values");

const TOKEN_MAP = Symbol("gelis.context.map");

type SlotPrototype = {
  readonly [TOKEN_VALUES]: readonly CapabilityObject[];

  use<const Token extends Capability<unknown>>(
    token: Token,
  ): CapabilityValue<Token>;
};

type MapPrototype = {
  readonly [TOKEN_MAP]: ReadonlyMap<Capability<unknown>, unknown>;

  use<const Token extends Capability<unknown>>(
    token: Token,
  ): CapabilityValue<Token>;
};

const slotPrototype: SlotPrototype = {
  [TOKEN_VALUES]: tokenValues,

  use(token) {
    return this[TOKEN_VALUES][token.slot] as CapabilityValue<typeof token>;
  },
};

const mapPrototype: MapPrototype = {
  [TOKEN_MAP]: tokenMap,

  use(token) {
    return this[TOKEN_MAP].get(token) as CapabilityValue<typeof token>;
  },
};

const baseContexts = createContextPool(createBaseContext);

const scopedContexts = createContextPool(createScopedContext);

const slotContexts = createContextPool(createSlotContext);

const mapContexts = createContextPool(createMapContext);

const materializeRing = new Array<BaseContext>(MATERIALIZE_RING_SIZE);

let sink = 0;
let objectSink: BaseContext | undefined;

assertCorrectness();

const accessCandidates = [
  {
    name: "scoped-prototype",
    run: runScopedAccess,
  },
  {
    name: "token-slot",
    run: runTokenSlotAccess,
  },
  {
    name: "token-map",
    run: runTokenMapAccess,
  },
] as const;

const materializeCandidates = [
  {
    name: "scoped-prototype",
    run: runScopedMaterialize,
  },
  {
    name: "token-slot",
    run: runTokenSlotMaterialize,
  },
  {
    name: "token-map",
    run: runTokenMapMaterialize,
  },
] as const;

for (const candidate of accessCandidates) {
  warmAccess(runControlAccess, candidate.run);
}

for (const candidate of materializeCandidates) {
  warmMaterialize(runBaseMaterialize, candidate.run);
}

const accessSummaries: Summary[] = [];

for (
  let candidateIndex = 0;
  candidateIndex < accessCandidates.length;
  candidateIndex++
) {
  const candidate = accessCandidates[candidateIndex]!;

  const samples = runAccessPaired(
    runControlAccess,
    candidate.run,
    candidateIndex,
  );

  accessSummaries.push(summarize(candidate.name, samples));
}

const materializeSummaries: Summary[] = [];

for (
  let candidateIndex = 0;
  candidateIndex < materializeCandidates.length;
  candidateIndex++
) {
  const candidate = materializeCandidates[candidateIndex]!;

  const samples = runMaterializePaired(runBaseMaterialize, candidate.run);

  materializeSummaries.push(summarize(candidate.name, samples));
}

console.log("\nGelis P8-A2 application-context runtime-shape diagnostic v2");

console.log(`Runtime:                  bun ${Bun.version}`);

console.log(`Samples:                  ${SAMPLES}`);

console.log(
  `Access iterations:        ${ACCESS_ITERATIONS.toLocaleString()} / side / sample`,
);

console.log(
  `Materialize iterations:   ${MATERIALIZE_ITERATIONS.toLocaleString()} / side / sample`,
);

console.log(`Prebuilt context pool:    ${CONTEXT_POOL_SIZE.toLocaleString()}`);

console.log("Capability reads:         4 / access operation");

console.log();

console.log("Access-only (prebuilt contexts)");

console.table(accessSummaries.map(formatSummary));

console.log("\nMaterialization-only (objects escape through ring buffer)");

console.table(materializeSummaries.map(formatSummary));

console.log(`\nNumeric sink: ${sink}`);

console.log(`Object sink: ${objectSink?.params.id ?? "none"}`);

function createCapabilityObjects(): CapabilityObject[] {
  const result: CapabilityObject[] = [];

  for (let index = 0; index < 32; index++) {
    result.push({
      value: index + 1,
    });
  }

  return result;
}

function createScope(values: readonly CapabilityObject[]): Scope {
  const result: Record<string, CapabilityObject> = {};

  for (let index = 0; index < 32; index++) {
    result[`cap${index}`] = values[index]!;
  }

  return result as unknown as Scope;
}

function defineCapability<Value>(
  name: string,
  slot: number,
): Capability<Value> {
  return {
    name,
    slot,
  };
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

function createSlotContext(index = 0): TokenContext {
  return {
    __proto__: slotPrototype,

    request,

    params: {
      id: String(index & 255),
    },

    query: undefined,
    body: undefined,

    reply: runtimeReply,
  } as unknown as TokenContext;
}

function createMapContext(index = 0): TokenContext {
  return {
    __proto__: mapPrototype,

    request,

    params: {
      id: String(index & 255),
    },

    query: undefined,
    body: undefined,

    reply: runtimeReply,
  } as unknown as TokenContext;
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

function controlHandler(context: BaseContext): number {
  return (
    controlCap0.value +
    controlCap7.value +
    controlCap13.value +
    controlCap23.value +
    context.params.id.length
  );
}

function scopedHandler(context: ScopedContext): number {
  return (
    context.cap0.value +
    context.cap7.value +
    context.cap13.value +
    context.cap23.value +
    context.params.id.length
  );
}

function tokenHandler(context: TokenContext): number {
  return (
    context.use(cap0).value +
    context.use(cap7).value +
    context.use(cap13).value +
    context.use(cap23).value +
    context.params.id.length
  );
}

function runControlAccess(iterations: number): number {
  let local = 0;

  for (let index = 0; index < iterations; index++) {
    local += controlHandler(baseContexts[index & CONTEXT_POOL_MASK]!);
  }

  sink ^= local;

  return local;
}

function runScopedAccess(iterations: number): number {
  let local = 0;

  for (let index = 0; index < iterations; index++) {
    local += scopedHandler(scopedContexts[index & CONTEXT_POOL_MASK]!);
  }

  sink ^= local;

  return local;
}

function runTokenSlotAccess(iterations: number): number {
  let local = 0;

  for (let index = 0; index < iterations; index++) {
    local += tokenHandler(slotContexts[index & CONTEXT_POOL_MASK]!);
  }

  sink ^= local;

  return local;
}

function runTokenMapAccess(iterations: number): number {
  let local = 0;

  for (let index = 0; index < iterations; index++) {
    local += tokenHandler(mapContexts[index & CONTEXT_POOL_MASK]!);
  }

  sink ^= local;

  return local;
}

function runBaseMaterialize(iterations: number): BaseContext {
  let last: BaseContext = createBaseContext();

  for (let index = 0; index < iterations; index++) {
    const context = createBaseContext(index);

    materializeRing[index & MATERIALIZE_RING_MASK] = context;

    last = context;
  }

  objectSink = materializeRing[(iterations - 1) & MATERIALIZE_RING_MASK];

  return last;
}

function runScopedMaterialize(iterations: number): BaseContext {
  let last: ScopedContext = createScopedContext();

  for (let index = 0; index < iterations; index++) {
    const context = createScopedContext(index);

    materializeRing[index & MATERIALIZE_RING_MASK] = context;

    last = context;
  }

  objectSink = materializeRing[(iterations - 1) & MATERIALIZE_RING_MASK];

  return last;
}

function runTokenSlotMaterialize(iterations: number): BaseContext {
  let last: TokenContext = createSlotContext();

  for (let index = 0; index < iterations; index++) {
    const context = createSlotContext(index);

    materializeRing[index & MATERIALIZE_RING_MASK] = context;

    last = context;
  }

  objectSink = materializeRing[(iterations - 1) & MATERIALIZE_RING_MASK];

  return last;
}

function runTokenMapMaterialize(iterations: number): BaseContext {
  let last: TokenContext = createMapContext();

  for (let index = 0; index < iterations; index++) {
    const context = createMapContext(index);

    materializeRing[index & MATERIALIZE_RING_MASK] = context;

    last = context;
  }

  objectSink = materializeRing[(iterations - 1) & MATERIALIZE_RING_MASK];

  return last;
}

function assertCorrectness(): void {
  for (let index = 0; index < 32; index++) {
    capabilityObjects[index]!.value = index + 1;
  }

  const expected = controlHandler(baseContexts[0]!);

  if (scopedHandler(scopedContexts[0]!) !== expected) {
    throw new Error("Scoped prototype correctness failure");
  }

  if (tokenHandler(slotContexts[0]!) !== expected) {
    throw new Error("Token slot correctness failure");
  }

  if (tokenHandler(mapContexts[0]!) !== expected) {
    throw new Error("Token map correctness failure");
  }

  if (false) {
    const stringToken = defineCapability<string>("string", 100);

    const stringContext = slotContexts[0]!;

    const value = stringContext.use(stringToken);

    const typed: string = value;

    void typed;

    // @ts-expect-error token value is string.
    const invalid: number = value;

    void invalid;
  }
}

function mutateCapabilities(seed: number): void {
  for (let index = 0; index < 32; index++) {
    capabilityObjects[index]!.value = (seed * 17 + index * 13) & 1023;
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
  control(10_000);

  candidate(10_000);
}

function runAccessPaired(
  control: AccessRunner,
  candidate: AccessRunner,
  candidateIndex: number,
): PairedSample[] {
  const samples: PairedSample[] = [];

  for (let sampleIndex = 0; sampleIndex < SAMPLES; sampleIndex++) {
    mutateCapabilities(sampleIndex + candidateIndex * 101 + 7);

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
      forceGc();

      controlNs = measureMaterialize(control);

      clearMaterializeRing();

      forceGc();

      candidateNs = measureMaterialize(candidate);
    } else {
      forceGc();

      candidateNs = measureMaterialize(candidate);

      clearMaterializeRing();

      forceGc();

      controlNs = measureMaterialize(control);
    }

    clearMaterializeRing();

    samples.push(makeSample(controlNs, candidateNs, controlFirst));
  }

  return samples;
}

function measureAccess(runner: AccessRunner): number {
  const start = Bun.nanoseconds();

  runner(ACCESS_ITERATIONS);

  const elapsed = Bun.nanoseconds() - start;

  return elapsed / ACCESS_ITERATIONS;
}

function measureMaterialize(runner: MaterializeRunner): number {
  const start = Bun.nanoseconds();

  runner(MATERIALIZE_ITERATIONS);

  const elapsed = Bun.nanoseconds() - start;

  return elapsed / MATERIALIZE_ITERATIONS;
}

function clearMaterializeRing(): void {
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
    const value = sorted[middle];

    if (value === undefined) {
      throw new Error("Cannot calculate median");
    }

    return value;
  }

  const left = sorted[middle - 1];

  const right = sorted[middle];

  if (left === undefined || right === undefined) {
    throw new Error("Cannot calculate median");
  }

  return (left + right) / 2;
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
