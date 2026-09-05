import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../..");

const WORKER = resolve(HERE, "cold-registration-worker.mts");

const KINDS = ["static", "dynamic"] as const;

const SCENARIOS = [
  "builder-only",
  "router-prebuilt",
  "builder-router",
  "full-app",
] as const;

const SAMPLES = 9;

interface Result {
  routeKind: (typeof KINDS)[number];

  scenario: (typeof SCENARIOS)[number];

  registrationMs: number;

  sample: number;
}

const raw: Result[] = [];

for (const kind of KINDS) {
  for (let sample = 0; sample < SAMPLES; sample++) {
    const order = rotate(SCENARIOS, sample);

    for (const scenario of order) {
      const result = await runWorker(kind, scenario, sample);

      raw.push(result);

      console.log(
        [
          kind,
          scenario,
          `sample ${sample + 1}/${SAMPLES}`,
          `${round(result.registrationMs, 3)} ms`,
        ].join(" | "),
      );
    }
  }
}

console.log("\nGelis P6-D1 cold registration decomposition");

console.log(`Runtime: bun ${Bun.version}`);

console.log(`CPU:     ${cpus()[0]?.model ?? "unknown"}`);

console.log(`Routes:  5000`);

console.log(`Samples: ${SAMPLES}`);

console.log("Measurement: fresh process per scenario/sample\n");

console.table(
  KINDS.flatMap((routeKind) =>
    SCENARIOS.map((scenario) => {
      const group = raw.filter(
        (result) =>
          result.routeKind === routeKind && result.scenario === scenario,
      );

      const values = group.map((result) => result.registrationMs);

      return {
        kind: routeKind,

        scenario,

        "median ms": round(median(values), 3),

        "cv %": round(coefficientOfVariation(values) * 100, 2),
      };
    }),
  ),
);

async function runWorker(
  routeKind: (typeof KINDS)[number],

  scenario: (typeof SCENARIOS)[number],

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
    throw new Error(`Cold registration worker failed\n${stderr}`);
  }

  const line = stdout.trim().split(/\r?\n/).at(-1);

  if (!line) {
    throw new Error("Worker produced no result");
  }

  const parsed = JSON.parse(line) as {
    routeKind: (typeof KINDS)[number];

    scenario: (typeof SCENARIOS)[number];

    registrationMs: number;
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
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;

  const variance =
    values.reduce((sum, value) => {
      const difference = value - average;

      return sum + difference * difference;
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

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}
