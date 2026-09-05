import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../..");

const WORKER = resolve(HERE, "aot-declaration-worker.mts");

const KINDS = ["static", "trailing", "generic"] as const;

const SCENARIOS = ["builder", "aot-app", "normal-app"] as const;

const SAMPLES = 15;

type RouteKind = (typeof KINDS)[number];

type Scenario = (typeof SCENARIOS)[number];

interface Result {
  readonly routeKind: RouteKind;

  readonly scenario: Scenario;

  readonly constructMs: number;

  readonly declarationMs: number;
}

const results: Result[] = [];

for (const routeKind of KINDS) {
  for (let sample = 0; sample < SAMPLES; sample++) {
    const order = rotate(SCENARIOS, sample);

    for (const scenario of order) {
      const result = await run(routeKind, scenario);

      results.push(result);

      console.log(
        [
          routeKind,
          scenario,
          `sample ${sample + 1}/${SAMPLES}`,
          `construct ${round(result.constructMs)} ms`,
          `declare ${round(result.declarationMs)} ms`,
        ].join(" | "),
      );
    }
  }
}

const rows = KINDS.flatMap((routeKind) =>
  SCENARIOS.map((scenario) => {
    const group = results.filter(
      (result) =>
        result.routeKind === routeKind && result.scenario === scenario,
    );

    return {
      kind: routeKind,

      scenario,

      construct: median(group.map((result) => result.constructMs)),

      declare: median(group.map((result) => result.declarationMs)),
    };
  }),
);

console.log("\nGelis P6-E3-A AOT declaration decomposition");

console.log(`Runtime: bun ${Bun.version}`);

console.log(`CPU:     ${cpus()[0]?.model ?? "unknown"}`);

console.log("Routes:  5000");

console.log(`Samples: ${SAMPLES}`);

console.log("Measurement: fresh process per scenario/sample\n");

console.table(
  rows.map((row) => ({
    kind: row.kind,

    scenario: row.scenario,

    "construct ms": round(row.construct),

    "declare ms": round(row.declare),
  })),
);

console.log("\nApproximate declaration components\n");

for (const kind of KINDS) {
  const builder = findRow(kind, "builder");

  const aot = findRow(kind, "aot-app");

  const normal = findRow(kind, "normal-app");

  console.log(
    `${kind}: ` +
      `builder ${round(builder.declare)} ms, ` +
      `app-bookkeeping ~${round(aot.declare - builder.declare)} ms, ` +
      `router-placement ~${round(normal.declare - aot.declare)} ms`,
  );
}

function findRow(
  kind: RouteKind,

  scenario: Scenario,
) {
  const row = rows.find(
    (candidate) => candidate.kind === kind && candidate.scenario === scenario,
  );

  if (!row) {
    throw new Error("Missing benchmark row");
  }

  return row;
}

async function run(
  routeKind: RouteKind,

  scenario: Scenario,
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
        "AOT declaration worker failed",
        `kind=${routeKind}`,
        `scenario=${scenario}`,
        stderr,
      ].join("\n"),
    );
  }

  const line = stdout.trim().split(/\r?\n/).at(-1);

  if (!line) {
    throw new Error("Worker produced no result");
  }

  return JSON.parse(line) as Result;
}

function rotate<T>(
  values: readonly T[],

  offset: number,
): T[] {
  const start = offset % values.length;

  return [...values.slice(start), ...values.slice(0, start)];
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);

  const value = sorted[Math.floor(sorted.length / 2)];

  if (value === undefined) {
    throw new Error("Empty median");
  }

  return value;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
