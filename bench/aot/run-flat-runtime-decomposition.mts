import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../..");

const WORKER = resolve(HERE, "flat-runtime-decomposition-worker.mts");

const KINDS = ["static", "trailing", "generic"] as const;

const SCENARIOS = ["semantic", "flat"] as const;

const SAMPLES = 31;

type RouteKind = (typeof KINDS)[number];

type Scenario = (typeof SCENARIOS)[number];

interface Result {
  readonly routeKind: RouteKind;

  readonly scenario: Scenario;

  readonly sample: number;

  readonly bindMs: number;

  readonly hydrateMs: number;

  readonly installMs: number;

  readonly runtimeMs: number;
}

const raw: Result[] = [];

for (const routeKind of KINDS) {
  for (let sample = 0; sample < SAMPLES; sample++) {
    const order = sample % 2 === 0 ? SCENARIOS : [SCENARIOS[1], SCENARIOS[0]];

    for (const scenario of order) {
      const result = await runWorker(routeKind, scenario, sample);

      raw.push(result);

      console.log(
        [
          routeKind,

          scenario,

          `sample ${sample + 1}/${SAMPLES}`,

          `bind ${round(result.bindMs, 3)} ms`,

          `hydrate ${round(result.hydrateMs, 3)} ms`,

          `install ${round(result.installMs, 3)} ms`,

          `total ${round(result.runtimeMs, 3)} ms`,
        ].join(" | "),
      );
    }
  }
}

const rows = KINDS.flatMap((routeKind) =>
  SCENARIOS.map((scenario) => {
    const group = raw.filter(
      (result) =>
        result.routeKind === routeKind && result.scenario === scenario,
    );

    return {
      routeKind,

      scenario,

      bind: median(group.map((result) => result.bindMs)),

      hydrate: median(group.map((result) => result.hydrateMs)),

      install: median(group.map((result) => result.installMs)),

      total: median(group.map((result) => result.runtimeMs)),
    };
  }),
);

console.log("\nGelis P6-E6-E3C flat runtime decomposition");

console.log(`Runtime: bun ${Bun.version}`);

console.log(`CPU:     ${cpus()[0]?.model ?? "unknown"}`);

console.log("Routes:  5000");

console.log(`Samples: ${SAMPLES}\n`);

console.table(
  rows.map((row) => ({
    kind: row.routeKind,

    scenario: row.scenario,

    "bind ms": round(row.bind, 3),

    "hydrate ms": round(row.hydrate, 3),

    "install ms": round(row.install, 3),

    "total ms": round(row.total, 3),
  })),
);

console.log("\nFlat vs semantic decomposition\n");

for (const routeKind of KINDS) {
  const semantic = findRow(routeKind, "semantic");

  const flat = findRow(routeKind, "flat");

  console.log(
    [
      routeKind,

      `bind ${delta(semantic.bind, flat.bind)}`,

      `hydrate ${delta(semantic.hydrate, flat.hydrate)}`,

      `install ${delta(semantic.install, flat.install)}`,

      `total ${delta(semantic.total, flat.total)}`,
    ].join(" | "),
  );
}

function findRow(
  routeKind: RouteKind,

  scenario: Scenario,
) {
  const row = rows.find(
    (candidate) =>
      candidate.routeKind === routeKind && candidate.scenario === scenario,
  );

  if (row === undefined) {
    throw new Error("Missing benchmark row");
  }

  return row;
}

function delta(
  baseline: number,

  candidate: number,
): string {
  const percent = (candidate / baseline - 1) * 100;

  const rounded = round(percent, 2);

  return rounded > 0 ? `+${rounded}%` : `${rounded}%`;
}

async function runWorker(
  routeKind: RouteKind,

  scenario: Scenario,

  sample: number,
): Promise<Result> {
  const child = Bun.spawn(
    [process.execPath, WORKER],

    {
      cwd: ROOT,

      env: {
        ...process.env,

        ROUTE_KIND: routeKind,

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
        "Flat runtime decomposition worker failed",

        `kind=${routeKind}`,

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

  return {
    ...JSON.parse(line),

    sample,
  } as Result;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);

  const value = sorted[Math.floor(sorted.length / 2)];

  if (value === undefined) {
    throw new Error("Empty median");
  }

  return value;
}

function round(
  value: number,

  digits: number,
): number {
  const scale = 10 ** digits;

  return Math.round(value * scale) / scale;
}
