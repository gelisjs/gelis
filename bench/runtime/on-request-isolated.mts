import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../..");

const RESULTS_DIR = resolve(HERE, "results");

const CHILD = resolve(HERE, "on-request.mts");

const cases = [
  "plain-sync",

  "on-request-sync",

  "two-on-request-sync",

  "three-on-request-sync",

  "late-on-request-sync",

  "early-return",

  "validation-only",

  "validation-on-request",

  "plain-async-handler",

  "on-request-async",

  "async-early-return",
] as const;

mkdirSync(
  RESULTS_DIR,

  {
    recursive: true,
  },
);

const runtimeRows: RuntimeResultRow[] = [];

console.log("\nGelis isolated onRequest runtime benchmark");

console.log(`Runtime:     bun ${Bun.version}`);

console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);

console.log(`Cases:       ${cases.length}`);

console.log("Isolation:   fresh process per case\n");

for (let index = 0; index < cases.length; index++) {
  const scenario = cases[index];

  if (!scenario) {
    continue;
  }

  console.log(`[${index + 1}/${cases.length}] ${scenario}`);

  await runIsolatedCase(scenario);

  const file = resolve(
    RESULTS_DIR,

    `latest-on-request-${scenario}.json`,
  );

  runtimeRows.push(readRuntimeRow(file, scenario));
}

const comparisons = createComparisons(runtimeRows);

console.log("\nIsolated runtime\n");

console.table(
  runtimeRows.map((row) => ({
    scenario: row.scenario,

    mode: row.mode,

    "ns/op": Math.round(row.nsPerOp),

    "ops/s": Math.round(row.opsPerSecond).toLocaleString("en-US"),
  })),
);

console.log("\nIsolated plan comparisons\n");

console.table(
  comparisons.map((comparison) => ({
    scenario: comparison.scenario,

    reference: comparison.reference,

    "scenario ns": Math.round(comparison.scenarioNs),

    "reference ns": Math.round(comparison.referenceNs),

    "delta ns": Math.round(comparison.deltaNs),

    "delta %": round(comparison.deltaPercent, 2),
  })),
);

const output = {
  metadata: {
    generatedAt: new Date().toISOString(),

    runtime: `bun ${Bun.version}`,

    cpu: cpus()[0]?.model ?? "unknown",

    isolation: "fresh-process-per-case",

    cases,
  },

  runtime: runtimeRows,

  comparisons,
};

writeFileSync(
  resolve(RESULTS_DIR, "latest-on-request-isolated.json"),

  `${JSON.stringify(output, null, 2)}\n`,
);

console.log(
  "\nRaw results: " + "bench/runtime/results/latest-on-request-isolated.json",
);

async function runIsolatedCase(scenario: string): Promise<void> {
  const child = Bun.spawn(
    [process.execPath, CHILD, `--cases=${scenario}`],

    {
      cwd: ROOT,

      stdout: "pipe",

      stderr: "pipe",
    },
  );

  const stdoutPromise = new Response(child.stdout).text();

  const stderrPromise = new Response(child.stderr).text();

  const exitCode = await child.exited;

  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

  if (exitCode !== 0) {
    throw new Error(
      [`Benchmark case failed: ${scenario}`, stdout, stderr].join("\n"),
    );
  }
}

function readRuntimeRow(file: string, scenario: string): RuntimeResultRow {
  const data: unknown = JSON.parse(readFileSync(file, "utf8"));

  if (
    data === null ||
    typeof data !== "object" ||
    !("runtime" in data) ||
    !Array.isArray(data.runtime)
  ) {
    throw new Error(`Missing runtime result for ${scenario}`);
  }

  const row: unknown = data.runtime[0];

  if (!isRuntimeResultRow(row)) {
    throw new Error(`Invalid runtime result for ${scenario}`);
  }

  return row;
}

function isRuntimeResultRow(value: unknown): value is RuntimeResultRow {
  return (
    value !== null &&
    typeof value === "object" &&
    "scenario" in value &&
    typeof value.scenario === "string" &&
    "mode" in value &&
    (value.mode === "sync" ||
      value.mode === "sync-throw" ||
      value.mode === "async") &&
    "iterations" in value &&
    typeof value.iterations === "number" &&
    "nsPerOp" in value &&
    typeof value.nsPerOp === "number" &&
    "opsPerSecond" in value &&
    typeof value.opsPerSecond === "number" &&
    "samples" in value &&
    Array.isArray(value.samples) &&
    value.samples.every((sample) => typeof sample === "number")
  );
}

function createComparisons(rows: RuntimeResultRow[]): RuntimeComparisonRow[] {
  const byScenario = new Map(rows.map((row) => [row.scenario, row]));

  const pairs: Array<readonly [string, string]> = [
    ["on-request-sync", "plain-sync"],

    ["two-on-request-sync", "on-request-sync"],

    ["three-on-request-sync", "two-on-request-sync"],

    ["late-on-request-sync", "on-request-sync"],

    ["validation-on-request", "validation-only"],

    ["on-request-async", "plain-async-handler"],

    ["async-early-return", "on-request-async"],
  ];

  const comparisons: RuntimeComparisonRow[] = [];

  for (const [scenarioName, referenceName] of pairs) {
    const scenario = byScenario.get(scenarioName);

    const reference = byScenario.get(referenceName);

    if (!scenario || !reference) {
      continue;
    }

    const deltaNs = scenario.nsPerOp - reference.nsPerOp;

    comparisons.push({
      scenario: scenarioName,

      reference: referenceName,

      scenarioNs: scenario.nsPerOp,

      referenceNs: reference.nsPerOp,

      deltaNs,

      deltaPercent: (scenario.nsPerOp / reference.nsPerOp - 1) * 100,
    });
  }

  return comparisons;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}
