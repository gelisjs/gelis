import { readFileSync } from "node:fs";

import { resolve } from "node:path";

import { spawnSync } from "node:child_process";

import { fileURLToPath } from "node:url";

import "./generate.mts";

const HERE = fileURLToPath(new URL(".", import.meta.url));

const ROOT = resolve(HERE, "../../..");

const TSC = resolve(ROOT, "node_modules/typescript/lib/tsc.js");

const TYPESCRIPT_PACKAGE = resolve(
  ROOT,
  "node_modules/typescript/package.json",
);

const GENERATED_DIR = resolve(HERE, "../generated/module-prefix-cost");

const SIZES = [100, 5_000] as const;

const SCENARIOS = [
  "direct-route-control",
  "module-unique-prefix",
  "module-shared-prefix",
] as const;

type BenchmarkSize = (typeof SIZES)[number];

type Scenario = (typeof SCENARIOS)[number];

interface Diagnostics {
  instantiations: number;

  memoryMB: number;

  checkTime: number;
}

const RUNS = 3;

/*
 * Diagnostic only.
 *
 * unique-prefix and shared-prefix produce the same
 * effective full route paths:
 *
 *   unique: prefix "/m/42" + local "/"
 *   shared: prefix "/m"    + local "/42"
 *
 * This isolates the cost of creating a distinct
 * ModuleRouteBuilder<Prefix> / RouteBuilder<Prefix>
 * instantiation for every module.
 *
 * It does not replace or alter the frozen C8 gate.
 */
compile("direct-route-control", 100);

const rows: Array<{
  scenario: Scenario;

  units: BenchmarkSize;

  diagnostics: Diagnostics;
}> = [];

for (const size of SIZES) {
  for (const scenario of SCENARIOS) {
    rows.push({
      scenario,
      units: size,

      diagnostics: medianDiagnostics(collect(scenario, size)),
    });
  }
}

console.log("\nGelis P8-C8 module prefix-cost diagnostic");

console.log(`Runtime:     bun ${Bun.version}`);

console.log(`TypeScript:  ${readPackageVersion(TYPESCRIPT_PACKAGE)}`);

console.log(`Runs/case:   ${RUNS}`);

console.log();

for (const size of SIZES) {
  const direct = required("direct-route-control", size);

  const unique = required("module-unique-prefix", size);

  const shared = required("module-shared-prefix", size);

  console.log(`${size.toLocaleString()} units`);

  console.table(
    [
      ["direct-route-control", direct],
      ["module-unique-prefix", unique],
      ["module-shared-prefix", shared],
    ].map(([scenario, diagnostics]) => {
      const row = diagnostics as Diagnostics;

      return {
        scenario,

        instantiations: row.instantiations,

        "inst x direct": round(row.instantiations / direct.instantiations, 3),

        "memory MB": round(row.memoryMB, 1),

        "mem x direct": round(row.memoryMB / direct.memoryMB, 3),

        "check s": round(row.checkTime, 3),

        "check x direct": round(row.checkTime / direct.checkTime, 3),
      };
    }),
  );

  console.log("shared vs unique");

  console.table([
    {
      metric: "instantiations",

      ratio: round(shared.instantiations / unique.instantiations, 3),

      delta: shared.instantiations - unique.instantiations,
    },

    {
      metric: "memory",

      ratio: round(shared.memoryMB / unique.memoryMB, 3),

      delta: round(shared.memoryMB - unique.memoryMB, 1),
    },

    {
      metric: "check time",

      ratio: round(shared.checkTime / unique.checkTime, 3),

      delta: round(shared.checkTime - unique.checkTime, 3),
    },
  ]);

  console.log();
}

console.log("Diagnostic only: do not accept/reject C8 from this runner.");

function required(scenario: Scenario, size: BenchmarkSize): Diagnostics {
  const row = rows.find(
    (candidate) => candidate.scenario === scenario && candidate.units === size,
  );

  if (row === undefined) {
    throw new Error(`Missing row: ${scenario}-${size}`);
  }

  return row.diagnostics;
}

function collect(scenario: Scenario, size: BenchmarkSize): Diagnostics[] {
  const samples: Diagnostics[] = [];

  for (let index = 0; index < RUNS; index++) {
    samples.push(compile(scenario, size));
  }

  return samples;
}

function compile(scenario: Scenario, size: BenchmarkSize): Diagnostics {
  const project = resolve(
    GENERATED_DIR,
    `${scenario}-${size}`,
    "tsconfig.json",
  );

  const result = spawnSync(
    process.execPath,

    [TSC, "-p", project, "--extendedDiagnostics", "--pretty", "false"],

    {
      cwd: ROOT,

      encoding: "utf8",

      maxBuffer: 1024 * 1024 * 16,
    },
  );

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

  if (result.status !== 0) {
    throw new Error(
      [`TypeScript diagnostic failed for ${scenario}-${size}`, output].join(
        "\n",
      ),
    );
  }

  return {
    instantiations: parseIntegerMetric(output, "Instantiations"),

    memoryMB: parseMemoryMB(output),

    checkTime: parseSecondsMetric(output, "Check time"),
  };
}

function medianDiagnostics(samples: readonly Diagnostics[]): Diagnostics {
  return {
    instantiations: median(samples.map((sample) => sample.instantiations)),

    memoryMB: median(samples.map((sample) => sample.memoryMB)),

    checkTime: median(samples.map((sample) => sample.checkTime)),
  };
}

function parseIntegerMetric(output: string, name: string): number {
  const match = output.match(new RegExp(`${escapeRegExp(name)}:\\s*([\\d,]+)`));

  if (match === null) {
    throw new Error(`Missing diagnostic: ${name}`);
  }

  return Number(match[1]!.replaceAll(",", ""));
}

function parseMemoryMB(output: string): number {
  const match = output.match(/Memory used:\s*([\d,]+)K/);

  if (match === null) {
    throw new Error("Missing diagnostic: Memory used");
  }

  return Number(match[1]!.replaceAll(",", "")) / 1024;
}

function parseSecondsMetric(output: string, name: string): number {
  const match = output.match(
    new RegExp(`${escapeRegExp(name)}:\\s*([\\d.]+)s`),
  );

  if (match === null) {
    throw new Error(`Missing diagnostic: ${name}`);
  }

  return Number(match[1]);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);

  return sorted[Math.floor(sorted.length / 2)]!;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function readPackageVersion(path: string): string {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as {
    version?: unknown;
  };

  return typeof parsed.version === "string" ? parsed.version : "unknown";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
