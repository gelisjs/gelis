import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../..");

const WORKER = resolve(HERE, "application-decomposition-worker.mts");

const KINDS = ["static", "trailing", "generic"] as const;

const SCENARIOS = ["normal", "aot"] as const;

const SAMPLES = 15;

type RouteKind = (typeof KINDS)[number];

type Scenario = (typeof SCENARIOS)[number];

interface Result {
  readonly routeKind: RouteKind;

  readonly scenario: Scenario;

  readonly constructMs: number;

  readonly declarationMs: number;

  readonly hydrationMs: number;

  readonly readyMs: number;
}

const results: Result[] = [];

for (const routeKind of KINDS) {
  for (let sample = 0; sample < SAMPLES; sample++) {
    const order = sample % 2 === 0 ? SCENARIOS : [...SCENARIOS].reverse();

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
          `hydrate ${round(result.hydrationMs)} ms`,
          `ready ${round(result.readyMs)} ms`,
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

      hydrate: median(group.map((result) => result.hydrationMs)),

      ready: median(group.map((result) => result.readyMs)),
    };
  }),
);

console.log("\nGelis P6-E2-D application startup decomposition");

console.log(`Runtime: bun ${Bun.version}`);

console.log(`CPU:     ${cpus()[0]?.model ?? "unknown"}`);

console.log(`Routes:  5000`);

console.log(`Samples: ${SAMPLES}`);

console.log("Snapshot compilation excluded as build-time work\n");

console.table(
  rows.map((row) => ({
    kind: row.kind,

    scenario: row.scenario,

    "construct ms": round(row.construct),

    "declare ms": round(row.declare),

    "hydrate ms": round(row.hydrate),

    "ready ms": round(row.ready),
  })),
);

console.log("\nApproximate declaration saving vs hydration cost\n");

for (const kind of KINDS) {
  const normal = findRow(kind, "normal");

  const aot = findRow(kind, "aot");

  const declarationSaving = normal.declare - aot.declare;

  const netRoutingSaving = declarationSaving - aot.hydrate;

  console.log(
    `${kind}: ` +
      `declaration saving ${round(declarationSaving)} ms, ` +
      `hydration ${round(aot.hydrate)} ms, ` +
      `net ${round(netRoutingSaving)} ms`,
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
  const child = Bun.spawn([process.execPath, WORKER], {
    cwd: ROOT,

    env: {
      ...process.env,

      ROUTE_KIND: routeKind,

      SCENARIO: scenario,
    },

    stdout: "pipe",

    stderr: "pipe",
  });

  const stdout = await new Response(child.stdout).text();

  const stderr = await new Response(child.stderr).text();

  const exit = await child.exited;

  if (exit !== 0) {
    throw new Error(
      [
        "Application decomposition worker failed",
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
