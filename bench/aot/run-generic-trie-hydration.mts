import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../..");

const WORKER = resolve(HERE, "generic-trie-hydration-worker.mts");

const SCENARIOS = ["router-register", "trie-hydrate"] as const;

const SAMPLES = 11;

type Scenario = (typeof SCENARIOS)[number];

interface Result {
  readonly scenario: Scenario;

  readonly sample: number;

  readonly milliseconds: number;
}

const raw: Result[] = [];

for (let sample = 0; sample < SAMPLES; sample++) {
  const order = rotate(SCENARIOS, sample);

  for (const scenario of order) {
    const result = await runWorker(scenario, sample);

    raw.push(result);

    console.log(
      [
        scenario,

        `sample ${sample + 1}/${SAMPLES}`,

        `${round(result.milliseconds, 3)} ms`,
      ].join(" | "),
    );
  }
}

const rows = SCENARIOS.map((scenario) => {
  const values = raw
    .filter((result) => result.scenario === scenario)
    .map((result) => result.milliseconds);

  return {
    scenario,

    medianMs: median(values),

    cv: coefficientOfVariation(values),
  };
});

console.log("\nGelis P6-D3 generic trie hydration");

console.log(`Runtime: bun ${Bun.version}`);

console.log(`CPU:     ${cpus()[0]?.model ?? "unknown"}`);

console.log("Routes:  5000 generic dynamic");

console.log(`Samples: ${SAMPLES}`);

console.log("Measurement: fresh process per scenario/sample\n");

console.table(
  rows.map((row) => ({
    scenario: row.scenario,

    "median ms": round(row.medianMs, 3),

    "cv %": round(row.cv * 100, 2),
  })),
);

const current = rows.find((row) => row.scenario === "router-register");

const hydrated = rows.find((row) => row.scenario === "trie-hydrate");

if (!current || !hydrated) {
  throw new Error("Missing result row");
}

const reduction = (1 - hydrated.medianMs / current.medianMs) * 100;

console.log("\nPotential generic trie hydration gain");

console.log(
  `${round(current.medianMs, 3)} → ` +
    `${round(hydrated.medianMs, 3)} ms ` +
    `(${round(reduction, 1)}% lower)`,
);

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
        "Generic trie worker failed",
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

function round(
  value: number,

  digits: number,
): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}
