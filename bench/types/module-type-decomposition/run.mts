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

const GENERATED_DIR = resolve(HERE, "../generated/module-type-decomposition");

const SIZES = [100, 5_000] as const;

const FEATURES = [
  "legacy",
  "dependency-scope",
  "static-request-scope",
  "scoped-request-scope",
  "scoped-request-lifecycle",
] as const;

type BenchmarkSize = (typeof SIZES)[number];

type Feature = (typeof FEATURES)[number];

type Side = "control" | "module";

interface Diagnostics {
  instantiations: number;

  memoryMB: number;

  checkTime: number;

  totalTime: number;
}

interface PairRow {
  readonly feature: Feature;

  readonly units: BenchmarkSize;

  readonly control: Diagnostics;

  readonly module: Diagnostics;

  readonly instRatio: number;

  readonly memoryRatio: number;

  readonly checkRatio: number;
}

const RUNS = 3;

/*
 * Diagnostic only.
 *
 * This benchmark does not replace or loosen the frozen C8
 * acceptance gate. It isolates the five public module
 * composition shapes used by that failed integrated gate.
 */
compile("legacy", "control", 100);

const rows: PairRow[] = [];

for (const feature of FEATURES) {
  for (const size of SIZES) {
    const control = medianDiagnostics(collect(feature, "control", size));

    const module = medianDiagnostics(collect(feature, "module", size));

    rows.push({
      feature,
      units: size,

      control,
      module,

      instRatio: module.instantiations / control.instantiations,

      memoryRatio: module.memoryMB / control.memoryMB,

      checkRatio: module.checkTime / control.checkTime,
    });
  }
}

console.log("\nGelis P8-C8 module type decomposition diagnostic");

console.log(`Runtime:     bun ${Bun.version}`);

console.log(`TypeScript:  ${readPackageVersion(TYPESCRIPT_PACKAGE)}`);

console.log(`Runs/case:   ${RUNS}`);

console.log();

console.table(
  rows.map((row) => ({
    feature: row.feature,

    units: row.units,

    "control inst": row.control.instantiations,

    "module inst": row.module.instantiations,

    "inst x": round(row.instRatio, 3),

    "control MB": round(row.control.memoryMB, 1),

    "module MB": round(row.module.memoryMB, 1),

    "mem x": round(row.memoryRatio, 3),

    "control check s": round(row.control.checkTime, 3),

    "module check s": round(row.module.checkTime, 3),

    "check x": round(row.checkRatio, 3),
  })),
);

const fiveK = rows
  .filter((row) => row.units === 5_000)
  .sort((left, right) => right.instRatio - left.instRatio);

console.log("\n5k ranking by instantiation ratio");

console.table(
  fiveK.map((row, index) => ({
    rank: index + 1,

    feature: row.feature,

    "inst x": round(row.instRatio, 3),

    "mem x": round(row.memoryRatio, 3),

    "check x": round(row.checkRatio, 3),

    "extra inst": row.module.instantiations - row.control.instantiations,

    "extra MB": round(row.module.memoryMB - row.control.memoryMB, 1),
  })),
);

console.log("\nDiagnostic only: do not accept/reject C8 from this runner.");

function collect(
  feature: Feature,
  side: Side,
  size: BenchmarkSize,
): Diagnostics[] {
  const samples: Diagnostics[] = [];

  for (let runIndex = 0; runIndex < RUNS; runIndex++) {
    samples.push(compile(feature, side, size));
  }

  return samples;
}

function compile(
  feature: Feature,
  side: Side,
  size: BenchmarkSize,
): Diagnostics {
  const project = resolve(
    GENERATED_DIR,
    `${feature}-${side}-${size}`,
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
      [
        `TypeScript diagnostic failed for ${feature}-${side}-${size}`,
        output,
      ].join("\n"),
    );
  }

  return {
    instantiations: parseIntegerMetric(output, "Instantiations"),

    memoryMB: parseMemoryMB(output),

    checkTime: parseSecondsMetric(output, "Check time"),

    totalTime: parseSecondsMetric(output, "Total time"),
  };
}

function medianDiagnostics(samples: readonly Diagnostics[]): Diagnostics {
  return {
    instantiations: median(samples.map((sample) => sample.instantiations)),

    memoryMB: median(samples.map((sample) => sample.memoryMB)),

    checkTime: median(samples.map((sample) => sample.checkTime)),

    totalTime: median(samples.map((sample) => sample.totalTime)),
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
  if (values.length === 0) {
    throw new Error("Cannot compute median of empty values");
  }

  const sorted = [...values].sort((left, right) => left - right);

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle]!;
  }

  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function readPackageVersion(path: string): string {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as {
    version?: unknown;
  };

  if (typeof parsed.version !== "string") {
    return "unknown";
  }

  return parsed.version;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
