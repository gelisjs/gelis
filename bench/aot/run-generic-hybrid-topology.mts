import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../..");

const WORKER = resolve(HERE, "generic-hybrid-topology-worker.mts");

const SHAPES = ["shared", "unique", "multi"] as const;

const SCENARIOS = ["semantic", "current-flat", "hybrid"] as const;

const SAMPLES = 31;

type ShapeKind = (typeof SHAPES)[number];

type Scenario = (typeof SCENARIOS)[number];

interface Result {
  readonly shapeKind: ShapeKind;

  readonly scenario: Scenario;

  readonly sample: number;

  readonly hydrateMs: number;
}

const raw: Result[] = [];

for (const shapeKind of SHAPES) {
  for (let sample = 0; sample < SAMPLES; sample++) {
    const order = rotate(SCENARIOS, sample);

    for (const scenario of order) {
      const result = await runWorker(shapeKind, scenario, sample);

      raw.push(result);

      console.log(
        [
          shapeKind,
          scenario,
          `sample ${sample + 1}/${SAMPLES}`,
          `hydrate ${round(result.hydrateMs, 3)} ms`,
        ].join(" | "),
      );
    }
  }
}

const rows = SHAPES.flatMap((shapeKind) =>
  SCENARIOS.map((scenario) => {
    const values = raw
      .filter(
        (result) =>
          result.shapeKind === shapeKind && result.scenario === scenario,
      )
      .map((result) => result.hydrateMs);

    return {
      shapeKind,
      scenario,

      hydrate: median(values),

      cv: coefficientOfVariation(values),
    };
  }),
);

console.log("\nGelis P6-E6-E3D.4 hybrid generic topology lower bound");

console.log(`Runtime: bun ${Bun.version}`);

console.log(`CPU:     ${cpus()[0]?.model ?? "unknown"}`);

console.log("Routes:  5000 generic");

console.log(`Samples: ${SAMPLES}\n`);

console.table(
  rows.map((row) => ({
    shape: row.shapeKind,

    scenario: row.scenario,

    "hydrate ms": round(row.hydrate, 3),

    "cv %": round(row.cv * 100, 2),
  })),
);

console.log("\nHybrid deltas\n");

const ratios: {
  readonly shapeKind: ShapeKind;

  readonly currentRatio: number;

  readonly semanticRatio: number;
}[] = [];

for (const shapeKind of SHAPES) {
  const semantic = findRow(shapeKind, "semantic");

  const current = findRow(shapeKind, "current-flat");

  const hybrid = findRow(shapeKind, "hybrid");

  ratios.push({
    shapeKind,

    currentRatio: hybrid.hydrate / current.hydrate,

    semanticRatio: hybrid.hydrate / semantic.hydrate,
  });

  console.log(
    [
      shapeKind,

      `hybrid vs current ${delta(current.hydrate, hybrid.hydrate)}`,

      `hybrid vs semantic ${delta(semantic.hydrate, hybrid.hydrate)}`,
    ].join(" | "),
  );
}

console.log(
  `\nGeomean hybrid vs current ${formatRatio(
    geometricMean(ratios.map((value) => value.currentRatio)),
  )}`,
);

console.log(
  `Geomean hybrid vs semantic ${formatRatio(
    geometricMean(ratios.map((value) => value.semanticRatio)),
  )}`,
);

console.log(`\nDecision: ${classify(ratios)}`);

function classify(
  values: readonly {
    readonly currentRatio: number;

    readonly semanticRatio: number;
  }[],
): "STRONG SIGNAL" | "ADVANCE" | "BORDERLINE" | "STOP" {
  const currentGeo = geometricMean(values.map((value) => value.currentRatio));

  const semanticGeo = geometricMean(values.map((value) => value.semanticRatio));

  const strong =
    currentGeo <= 0.85 &&
    semanticGeo <= 1.05 &&
    values.every(
      (value) => value.currentRatio <= 0.9 && value.semanticRatio <= 1.1,
    );

  if (strong) {
    return "STRONG SIGNAL";
  }

  const advance =
    currentGeo <= 0.9 &&
    semanticGeo <= 1.1 &&
    values.every(
      (value) => value.currentRatio <= 0.97 && value.semanticRatio <= 1.15,
    );

  if (advance) {
    return "ADVANCE";
  }

  const stop =
    currentGeo >= 0.95 || values.some((value) => value.currentRatio > 1.05);

  if (stop) {
    return "STOP";
  }

  return "BORDERLINE";
}

function findRow(
  shapeKind: ShapeKind,

  scenario: Scenario,
) {
  const row = rows.find(
    (candidate) =>
      candidate.shapeKind === shapeKind && candidate.scenario === scenario,
  );

  if (row === undefined) {
    throw new Error("Missing hybrid benchmark row");
  }

  return row;
}

async function runWorker(
  shapeKind: ShapeKind,

  scenario: Scenario,

  sample: number,
): Promise<Result> {
  const child = Bun.spawn(
    [process.execPath, WORKER],

    {
      cwd: ROOT,

      env: {
        ...process.env,

        SHAPE_KIND: shapeKind,

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
        "Hybrid topology worker failed",
        `shape=${shapeKind}`,
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

function geometricMean(values: readonly number[]): number {
  return Math.exp(
    values.reduce((total, value) => total + Math.log(value), 0) / values.length,
  );
}

function delta(
  baseline: number,

  candidate: number,
): string {
  return formatRatio(candidate / baseline);
}

function formatRatio(ratio: number): string {
  const percent = (ratio - 1) * 100;

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
