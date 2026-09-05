import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../..");

const WORKER = resolve(HERE, "generic-param-vector-pool-worker.mts");

const POOL_KINDS = ["shared", "unique"] as const;

const SCENARIOS = ["semantic", "current-flat", "prepooled-flat"] as const;

const SAMPLES = 31;

type PoolKind = (typeof POOL_KINDS)[number];

type Scenario = (typeof SCENARIOS)[number];

interface Result {
  readonly poolKind: PoolKind;

  readonly scenario: Scenario;

  readonly sample: number;

  readonly hydrateMs: number;

  readonly vectorCount: number;

  readonly originalParamEntries: number;

  readonly pooledParamEntries: number;
}

const raw: Result[] = [];

for (const poolKind of POOL_KINDS) {
  for (let sample = 0; sample < SAMPLES; sample++) {
    const order = rotate(SCENARIOS, sample);

    for (const scenario of order) {
      const result = await runWorker(poolKind, scenario, sample);

      raw.push(result);

      console.log(
        [
          poolKind,
          scenario,
          `sample ${sample + 1}/${SAMPLES}`,
          `hydrate ${round(result.hydrateMs, 3)} ms`,
        ].join(" | "),
      );
    }
  }
}

const rows = POOL_KINDS.flatMap((poolKind) =>
  SCENARIOS.map((scenario) => {
    const group = raw.filter(
      (result) => result.poolKind === poolKind && result.scenario === scenario,
    );

    return {
      poolKind,
      scenario,

      hydrate: median(group.map((result) => result.hydrateMs)),

      cv: coefficientOfVariation(group.map((result) => result.hydrateMs)),

      vectorCount: group[0]?.vectorCount ?? 0,

      originalParamEntries: group[0]?.originalParamEntries ?? 0,

      pooledParamEntries: group[0]?.pooledParamEntries ?? 0,
    };
  }),
);

console.log("\nGelis P6-E6-E3D.3 build-time param vector pool lower bound");

console.log(`Runtime: bun ${Bun.version}`);

console.log(`CPU:     ${cpus()[0]?.model ?? "unknown"}`);

console.log("Routes:  5000 generic");

console.log(`Samples: ${SAMPLES}`);

console.log("Pool construction excluded from hydration timer\n");

console.table(
  rows.map((row) => ({
    pool: row.poolKind,

    scenario: row.scenario,

    "hydrate ms": round(row.hydrate, 3),

    "cv %": round(row.cv * 100, 2),

    vectors: row.vectorCount,

    "original entries": row.originalParamEntries,

    "pooled entries": row.pooledParamEntries,
  })),
);

console.log("\nPrepooled deltas\n");

const ratios: {
  poolKind: PoolKind;

  currentRatio: number;

  semanticRatio: number;
}[] = [];

for (const poolKind of POOL_KINDS) {
  const semantic = findRow(poolKind, "semantic");

  const current = findRow(poolKind, "current-flat");

  const prepooled = findRow(poolKind, "prepooled-flat");

  const currentRatio = prepooled.hydrate / current.hydrate;

  const semanticRatio = prepooled.hydrate / semantic.hydrate;

  ratios.push({
    poolKind,
    currentRatio,
    semanticRatio,
  });

  console.log(
    [
      poolKind,

      `prepooled vs current ${delta(current.hydrate, prepooled.hydrate)}`,

      `prepooled vs semantic ${delta(semantic.hydrate, prepooled.hydrate)}`,
    ].join(" | "),
  );
}

console.log(`\nDecision: ${classify(ratios)}`);

function classify(
  values: readonly {
    readonly poolKind: PoolKind;

    readonly currentRatio: number;

    readonly semanticRatio: number;
  }[],
): "STRONG SIGNAL" | "ADVANCE" | "BORDERLINE" | "STOP" {
  const shared = values.find((value) => value.poolKind === "shared");

  const unique = values.find((value) => value.poolKind === "unique");

  if (shared === undefined || unique === undefined) {
    throw new Error("Missing param pool classification row");
  }

  const strong =
    shared.currentRatio <= 0.9 &&
    unique.currentRatio <= 0.9 &&
    shared.semanticRatio <= 1.05 &&
    unique.semanticRatio <= 1.1;

  if (strong) {
    return "STRONG SIGNAL";
  }

  const advance =
    shared.currentRatio <= 0.92 &&
    unique.currentRatio <= 1.03 &&
    shared.semanticRatio <= 1.1 &&
    unique.semanticRatio <= 1.15;

  if (advance) {
    return "ADVANCE";
  }

  const stop =
    shared.currentRatio >= 0.95 ||
    shared.currentRatio > 1.05 ||
    unique.currentRatio > 1.05;

  if (stop) {
    return "STOP";
  }

  return "BORDERLINE";
}

function findRow(
  poolKind: PoolKind,

  scenario: Scenario,
) {
  const row = rows.find(
    (candidate) =>
      candidate.poolKind === poolKind && candidate.scenario === scenario,
  );

  if (row === undefined) {
    throw new Error("Missing benchmark row");
  }

  return row;
}

async function runWorker(
  poolKind: PoolKind,

  scenario: Scenario,

  sample: number,
): Promise<Result> {
  const child = Bun.spawn(
    [process.execPath, WORKER],

    {
      cwd: ROOT,

      env: {
        ...process.env,

        POOL_KIND: poolKind,

        SCENARIO: scenario,
      },

      stdout: "pipe",

      stderr: "pipe",
    },
  );

  const stdout = await new Response(child.stdout).text();

  const stderr = await new Response(child.stderr).text();

  const exit = await child.exited;

  if (exit !== 0) {
    throw new Error(
      [
        "Param vector pool worker failed",
        `pool=${poolKind}`,
        `scenario=${scenario}`,
        `sample=${sample}`,
        stderr,
      ].join("\n"),
    );
  }

  const line = stdout.trim().split(/\r?\n/).at(-1);

  if (!line) {
    throw new Error("Worker produced no result");
  }

  const parsed = JSON.parse(line) as Omit<Result, "sample">;

  return {
    ...parsed,
    sample,
  };
}

function rotate<T>(
  values: readonly T[],

  offset: number,
): T[] {
  const start = offset % values.length;

  return [...values.slice(start), ...values.slice(0, start)];
}

function coefficientOfVariation(values: readonly number[]): number {
  const average =
    values.reduce((total, value) => total + value, 0) / values.length;

  if (average === 0) {
    return 0;
  }

  const variance =
    values.reduce((total, value) => {
      const difference = value - average;

      return total + difference * difference;
    }, 0) / values.length;

  return Math.sqrt(variance) / average;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);

  const value = sorted[Math.floor(sorted.length / 2)];

  if (value === undefined) {
    throw new Error("Empty median");
  }

  return value;
}

function delta(
  baseline: number,

  candidate: number,
): string {
  const percent = (candidate / baseline - 1) * 100;

  const rounded = round(percent, 2);

  return rounded > 0 ? `+${rounded}%` : `${rounded}%`;
}

function round(
  value: number,

  digits: number,
): number {
  const scale = 10 ** digits;

  return Math.round(value * scale) / scale;
}
