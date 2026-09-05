import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../..");

const WORKER = resolve(HERE, "generic-flat-hydration-lower-bound-worker.mts");

const SCENARIOS = [
  "semantic",
  "production",
  "unchecked",
  "shared-param",
] as const;

const SAMPLES = 31;

type Scenario = (typeof SCENARIOS)[number];

interface Result {
  readonly scenario: Scenario;

  readonly sample: number;

  readonly hydrateMs: number;
}

const raw: Result[] = [];

for (let sample = 0; sample < SAMPLES; sample++) {
  const order = rotate(
    SCENARIOS,

    sample,
  );

  for (const scenario of order) {
    const result = await runWorker(
      scenario,

      sample,
    );

    raw.push(result);

    console.log(
      [
        scenario,

        `sample ${sample + 1}/${SAMPLES}`,

        `hydrate ${round(result.hydrateMs, 3)} ms`,
      ].join(" | "),
    );
  }
}

const rows = SCENARIOS.map((scenario) => {
  const values = raw
    .filter((result) => result.scenario === scenario)
    .map((result) => result.hydrateMs);

  return {
    scenario,

    hydrate: median(values),

    cv: coefficientOfVariation(values),
  };
});

console.log("\nGelis P6-E6-E3D.1 generic flat hydration lower bounds");

console.log(`Runtime: bun ${Bun.version}`);

console.log(`CPU:     ${cpus()[0]?.model ?? "unknown"}`);

console.log("Routes:  5000 generic");

console.log(`Samples: ${SAMPLES}\n`);

console.table(
  rows.map((row) => ({
    scenario: row.scenario,

    "hydrate ms": round(row.hydrate, 3),

    "cv %": round(row.cv * 100, 2),
  })),
);

const semantic = findRow("semantic").hydrate;

const production = findRow("production").hydrate;

const unchecked = findRow("unchecked").hydrate;

const shared = findRow("shared-param").hydrate;

console.log("\nDeltas\n");

console.log(`production vs semantic ${delta(semantic, production)}`);

console.log(`unchecked vs production ${delta(production, unchecked)}`);

console.log(`unchecked vs semantic ${delta(semantic, unchecked)}`);

console.log(`shared-param vs unchecked ${delta(unchecked, shared)}`);

console.log(`shared-param vs semantic ${delta(semantic, shared)}`);

function findRow(scenario: Scenario) {
  const row = rows.find((candidate) => candidate.scenario === scenario);

  if (row === undefined) {
    throw new Error("Missing benchmark row");
  }

  return row;
}

async function runWorker(
  scenario: Scenario,

  sample: number,
): Promise<Result> {
  const child = Bun.spawn(
    [process.execPath, WORKER],

    {
      cwd: ROOT,

      env: {
        ...process.env,

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
        "Generic flat hydration lower-bound worker failed",

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

  const parsed = JSON.parse(line) as {
    scenario: Scenario;

    hydrateMs: number;
  };

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
    values.reduce(
      (total, value) => total + value,

      0,
    ) / values.length;

  if (average === 0) {
    return 0;
  }

  const variance =
    values.reduce(
      (total, value) => {
        const difference = value - average;

        return total + difference * difference;
      },

      0,
    ) / values.length;

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
  const value = (candidate / baseline - 1) * 100;

  const rounded = round(value, 2);

  return rounded > 0 ? `+${rounded}%` : `${rounded}%`;
}

function round(
  value: number,

  digits: number,
): number {
  const scale = 10 ** digits;

  return Math.round(value * scale) / scale;
}
