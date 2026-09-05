import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../..");

const WORKER = resolve(HERE, "router-hydration-worker.mts");

const KINDS = ["static", "dynamic"] as const;

const SCENARIOS = [
  "route-record-build",
  "router-register",
  "table-hydrate",
] as const;

const SAMPLES = 11;

type RouteKind = (typeof KINDS)[number];

type Scenario = (typeof SCENARIOS)[number];

interface Result {
  readonly routeKind: RouteKind;

  readonly scenario: Scenario;

  readonly sample: number;

  readonly milliseconds: number;
}

const raw: Result[] = [];

for (const routeKind of KINDS) {
  for (let sample = 0; sample < SAMPLES; sample++) {
    const order = rotate(
      SCENARIOS,

      sample,
    );

    for (const scenario of order) {
      const result = await runWorker(
        routeKind,

        scenario,

        sample,
      );

      raw.push(result);

      console.log(
        [
          routeKind,

          scenario,

          `sample ${sample + 1}/${SAMPLES}`,

          `${round(result.milliseconds, 3)} ms`,
        ].join(" | "),
      );
    }
  }
}

const rows = KINDS.flatMap((routeKind) =>
  SCENARIOS.map((scenario) => {
    const values = raw
      .filter(
        (result) =>
          result.routeKind === routeKind && result.scenario === scenario,
      )
      .map((result) => result.milliseconds);

    return {
      routeKind,

      scenario,

      medianMs: median(values),

      cv: coefficientOfVariation(values),
    };
  }),
);

console.log("\nGelis P6-D2 router hydration lower bound");

console.log(`Runtime: bun ${Bun.version}`);

console.log(`CPU:     ${cpus()[0]?.model ?? "unknown"}`);

console.log(`Routes:  5000`);

console.log(`Samples: ${SAMPLES}`);

console.log("Measurement: fresh process per scenario/sample\n");

console.table(
  rows.map((row) => ({
    kind: row.routeKind,

    scenario: row.scenario,

    "median ms": round(row.medianMs, 3),

    "cv %": round(row.cv * 100, 2),
  })),
);

console.log("\nPotential router hydration gain\n");

for (const routeKind of KINDS) {
  const current = rows.find(
    (row) => row.routeKind === routeKind && row.scenario === "router-register",
  );

  const hydrated = rows.find(
    (row) => row.routeKind === routeKind && row.scenario === "table-hydrate",
  );

  if (!current || !hydrated) {
    throw new Error("Missing result row");
  }

  const reduction = (1 - hydrated.medianMs / current.medianMs) * 100;

  console.log(
    `${routeKind}: ` +
      `${round(current.medianMs, 3)} → ` +
      `${round(hydrated.medianMs, 3)} ms ` +
      `(${round(reduction, 1)}% lower)`,
  );
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
        "Router hydration worker failed",
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

  const parsed = JSON.parse(line) as {
    routeKind: RouteKind;

    scenario: Scenario;

    milliseconds: number;
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

function round(
  value: number,

  digits: number,
): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}
