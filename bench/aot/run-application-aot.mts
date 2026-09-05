import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../..");

const WORKER = resolve(HERE, "application-aot-worker.mts");

const KINDS = ["static", "trailing", "generic"] as const;

const SCENARIOS = ["normal", "aot"] as const;

const SAMPLES = 11;

type RouteKind = (typeof KINDS)[number];

type Scenario = (typeof SCENARIOS)[number];

interface Result {
  readonly routeKind: RouteKind;

  readonly scenario: Scenario;

  readonly sample: number;

  readonly readyMs: number;

  readonly firstFetchUs: number;
}

const raw: Result[] = [];

for (const routeKind of KINDS) {
  for (let sample = 0; sample < SAMPLES; sample++) {
    const order = rotate(SCENARIOS, sample);

    for (const scenario of order) {
      const result = await runWorker(routeKind, scenario, sample);

      raw.push(result);

      console.log(
        [
          routeKind,

          scenario,

          `sample ${sample + 1}/${SAMPLES}`,

          `ready ${round(result.readyMs, 3)} ms`,

          `first ${round(result.firstFetchUs, 1)} us`,
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

    const ready = group.map((result) => result.readyMs);

    const first = group.map((result) => result.firstFetchUs);

    return {
      routeKind,

      scenario,

      readyMedian: median(ready),

      readyCv: coefficientOfVariation(ready),

      firstMedian: median(first),

      firstCv: coefficientOfVariation(first),
    };
  }),
);

console.log("\nGelis P6-E2-B application-level AOT runtime");

console.log(`Runtime: bun ${Bun.version}`);

console.log(`CPU:     ${cpus()[0]?.model ?? "unknown"}`);

console.log("Routes:  5000");

console.log(`Samples: ${SAMPLES}`);

console.log("Measurement: fresh process per scenario/sample");

console.log("Snapshot compilation: excluded as build-time work\n");

console.table(
  rows.map((row) => ({
    kind: row.routeKind,

    scenario: row.scenario,

    "ready ms": round(row.readyMedian, 3),

    "ready cv %": round(row.readyCv * 100, 2),

    "first fetch us": round(row.firstMedian, 1),

    "first cv %": round(row.firstCv * 100, 2),
  })),
);

console.log("\nRuntime ready-time reduction\n");

for (const routeKind of KINDS) {
  const normal = findRow(routeKind, "normal");

  const aot = findRow(routeKind, "aot");

  const reduction = (1 - aot.readyMedian / normal.readyMedian) * 100;

  const firstDelta = (aot.firstMedian / normal.firstMedian - 1) * 100;

  console.log(
    `${routeKind}: ` +
      `${round(normal.readyMedian, 3)} → ` +
      `${round(aot.readyMedian, 3)} ms ` +
      `(${round(reduction, 1)}% lower), ` +
      `first-fetch delta ${signed(firstDelta)}%`,
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

  if (!row) {
    throw new Error("Missing benchmark row");
  }

  return row;
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
        "Application AOT worker failed",
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

    readyMs: number;

    firstFetchUs: number;
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

function signed(value: number): string {
  const rounded = round(value, 1);

  return rounded >= 0 ? `+${rounded}` : `${rounded}`;
}

function round(
  value: number,

  digits: number,
): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}
