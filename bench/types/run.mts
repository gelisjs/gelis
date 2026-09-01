import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { cpus, totalmem } from "node:os";

import { resolve } from "node:path";

import { spawnSync } from "node:child_process";

import { fileURLToPath } from "node:url";

import "./generate.mts";

const HERE = fileURLToPath(new URL(".", import.meta.url));

const ROOT = resolve(HERE, "../..");

const TSC = resolve(ROOT, "node_modules/typescript/lib/tsc.js");

const TYPESCRIPT_PACKAGE = resolve(
  ROOT,
  "node_modules/typescript/package.json",
);

const RESULTS_DIR = resolve(HERE, "results");

const DEFAULT_SIZES = [100, 500, 1000, 5000] as const;

const SCENARIOS = [
  "baseline",
  "routes",
  "contract",
  "rich-contract",
  "client-sparse",
  "client-module",
  "client",
] as const;

type BenchmarkSize = (typeof DEFAULT_SIZES)[number];

type TypeScenario = (typeof SCENARIOS)[number];

interface TypeDiagnostics {
  files?: number;
  linesOfTypeScript?: number;
  identifiers?: number;
  symbols?: number;
  types?: number;
  instantiations: number;
  memoryMB: number;
  parseTime?: number;
  bindTime?: number;
  checkTime: number;
  totalTime: number;
}

interface TypeBenchmarkRow extends TypeDiagnostics {
  scenario: TypeScenario;
  routes: BenchmarkSize;
  runs: number;
  checkVsBaseline: number | null;
  checkVsRichContract: number | null;
  samples: TypeDiagnostics[];
}

interface TypeBenchmarkMetadata {
  generatedAt: string;
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  runtime: string;
  typescript: string;
  cpu: string;
  logicalCpus: number;
  totalMemoryMB: number;
  runsPerCase: number;
  sizes: BenchmarkSize[];
}

const DIAGNOSTIC_KEYS = [
  "files",
  "linesOfTypeScript",
  "identifiers",
  "symbols",
  "types",
  "instantiations",
  "memoryMB",
  "parseTime",
  "bindTime",
  "checkTime",
  "totalTime",
] as const satisfies readonly (keyof TypeDiagnostics)[];

const SIZES = readSizesArgument(DEFAULT_SIZES);

const RUNS = readRunsArgument(3);

mkdirSync(RESULTS_DIR, {
  recursive: true,
});

// Warm filesystem/compiler startup.
// This result is intentionally discarded.
compile("baseline", firstSize(SIZES));

const rows: TypeBenchmarkRow[] = [];

for (const size of SIZES) {
  for (const scenario of SCENARIOS) {
    const samples: TypeDiagnostics[] = [];

    for (let run = 0; run < RUNS; run++) {
      samples.push(compile(scenario, size));
    }

    rows.push({
      scenario,
      routes: size,
      runs: RUNS,
      checkVsBaseline: null,
      checkVsRichContract: null,

      ...medianDiagnostics(samples),

      samples,
    });
  }
}

for (const row of rows) {
  const baseline = rows.find(
    (candidate) =>
      candidate.scenario === "baseline" && candidate.routes === row.routes,
  );

  const richContract = rows.find(
    (candidate) =>
      candidate.scenario === "rich-contract" && candidate.routes === row.routes,
  );

  row.checkVsBaseline = baseline?.checkTime
    ? row.checkTime / baseline.checkTime
    : null;

  const isClientScenario = row.scenario.startsWith("client");

  row.checkVsRichContract =
    isClientScenario && richContract?.checkTime
      ? row.checkTime / richContract.checkTime
      : null;
}

const metadata = {
  generatedAt: new Date().toISOString(),

  platform: process.platform,

  arch: process.arch,

  runtime: globalThis.Bun
    ? `bun ${globalThis.Bun.version}`
    : `node ${process.version}`,

  typescript: readPackageVersion(TYPESCRIPT_PACKAGE),

  cpu: cpus()[0]?.model ?? "unknown",

  logicalCpus: cpus().length,

  totalMemoryMB: Math.round(totalmem() / 1024 / 1024),

  runsPerCase: RUNS,

  sizes: SIZES,
};

writeFileSync(
  resolve(RESULTS_DIR, "latest.json"),

  `${JSON.stringify(
    {
      metadata,
      rows,
    },
    null,
    2,
  )}\n`,
);

writeFileSync(
  resolve(RESULTS_DIR, "latest.csv"),

  toCsv(rows),
);

printMetadata(metadata);
printTable(rows);

function compile(scenario: TypeScenario, size: BenchmarkSize): TypeDiagnostics {
  const project = resolve(
    HERE,
    "generated",
    `${scenario}-${size}`,
    "tsconfig.json",
  );

  const result = spawnSync(
    process.execPath,

    [
      TSC,

      "--project",
      project,

      "--noEmit",

      "--pretty",
      "false",

      "--extendedDiagnostics",
    ],

    {
      cwd: ROOT,
      encoding: "utf8",
      env: process.env,
    },
  );

  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");

    process.stderr.write(result.stderr ?? "");

    process.exit(result.status ?? 1);
  }

  return parseDiagnostics(result.stdout);
}

function parseDiagnostics(output: string): TypeDiagnostics {
  const metrics: Partial<TypeDiagnostics> = {};

  for (const line of output.split(/\r?\n/)) {
    const match = /^([^:]+):\s+(.+)$/.exec(line.trim());

    if (!match) {
      continue;
    }

    const [, key, raw] = match;

    if (key === undefined || raw === undefined) {
      continue;
    }

    switch (key) {
      case "Files":
        metrics.files = parseNumber(raw);
        break;

      case "Lines of TypeScript":
        metrics.linesOfTypeScript = parseNumber(raw);
        break;

      case "Identifiers":
        metrics.identifiers = parseNumber(raw);
        break;

      case "Symbols":
        metrics.symbols = parseNumber(raw);
        break;

      case "Types":
        metrics.types = parseNumber(raw);
        break;

      case "Instantiations":
        metrics.instantiations = parseNumber(raw);
        break;

      case "Memory used":
        metrics.memoryMB = parseMemoryMB(raw);
        break;

      case "Parse time":
        metrics.parseTime = parseSeconds(raw);
        break;

      case "Bind time":
        metrics.bindTime = parseSeconds(raw);
        break;

      case "Check time":
        metrics.checkTime = parseSeconds(raw);
        break;

      case "Total time":
        metrics.totalTime = parseSeconds(raw);
        break;
    }
  }

  return completeDiagnostics(metrics);
}

function medianDiagnostics(samples: TypeDiagnostics[]): TypeDiagnostics {
  const result: Partial<TypeDiagnostics> = {};

  for (const key of DIAGNOSTIC_KEYS) {
    const values = samples
      .map((sample) => sample[key])
      .filter((value) => typeof value === "number");

    if (values.length > 0) {
      result[key] = median(values);
    }
  }

  return completeDiagnostics(result);
}

function completeDiagnostics(
  metrics: Partial<TypeDiagnostics>,
): TypeDiagnostics {
  const diagnostics: TypeDiagnostics = {
    instantiations: requiredMetric(metrics, "instantiations"),
    memoryMB: requiredMetric(metrics, "memoryMB"),
    checkTime: requiredMetric(metrics, "checkTime"),
    totalTime: requiredMetric(metrics, "totalTime"),
  };

  if (metrics.files !== undefined) {
    diagnostics.files = metrics.files;
  }

  if (metrics.linesOfTypeScript !== undefined) {
    diagnostics.linesOfTypeScript = metrics.linesOfTypeScript;
  }

  if (metrics.identifiers !== undefined) {
    diagnostics.identifiers = metrics.identifiers;
  }

  if (metrics.symbols !== undefined) {
    diagnostics.symbols = metrics.symbols;
  }

  if (metrics.types !== undefined) {
    diagnostics.types = metrics.types;
  }

  if (metrics.parseTime !== undefined) {
    diagnostics.parseTime = metrics.parseTime;
  }

  if (metrics.bindTime !== undefined) {
    diagnostics.bindTime = metrics.bindTime;
  }

  return diagnostics;
}

function requiredMetric(
  metrics: Partial<TypeDiagnostics>,
  key: keyof TypeDiagnostics,
): number {
  const value = metrics[key];

  if (typeof value !== "number") {
    throw new Error(`Could not parse TypeScript metric: ${key}`);
  }

  return value;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    const value = sorted[middle];

    if (value === undefined) {
      throw new Error("Cannot compute median of an empty sample set");
    }

    return value;
  }

  const left = sorted[middle - 1];
  const right = sorted[middle];

  if (left === undefined || right === undefined) {
    throw new Error("Cannot compute median of an empty sample set");
  }

  return (left + right) / 2;
}

function parseNumber(value: string): number {
  return Number(value.replaceAll(",", "").trim());
}

function parseSeconds(value: string): number {
  return Number(value.replace(/s$/, "").trim());
}

function parseMemoryMB(value: string): number {
  const trimmed = value.trim();

  if (trimmed.endsWith("K")) {
    return Number(trimmed.slice(0, -1)) / 1024;
  }

  if (trimmed.endsWith("M")) {
    return Number(trimmed.slice(0, -1));
  }

  return Number(trimmed) / 1024 / 1024;
}

function readRunsArgument(fallback: number): number {
  const argument = process.argv.find((value) => value.startsWith("--runs="));

  if (!argument) {
    return fallback;
  }

  const value = Number.parseInt(argument.slice("--runs=".length), 10);

  if (!Number.isInteger(value) || value < 1) {
    throw new Error("--runs must be a positive integer");
  }

  return value;
}

function readSizesArgument(
  fallback: readonly BenchmarkSize[],
): BenchmarkSize[] {
  const argument = process.argv.find((value) => value.startsWith("--sizes="));

  if (!argument) {
    return [...fallback];
  }

  const values = argument
    .slice("--sizes=".length)
    .split(",")
    .map((value) => Number.parseInt(value, 10));

  for (const value of values) {
    if (!fallback.includes(value as BenchmarkSize)) {
      throw new Error(
        `Unsupported benchmark size: ${value}. ` +
          `Use one of: ${fallback.join(", ")}`,
      );
    }
  }

  return values as BenchmarkSize[];
}

function firstSize(values: readonly BenchmarkSize[]): BenchmarkSize {
  const value = values[0];

  if (value === undefined) {
    throw new Error("At least one benchmark size is required");
  }

  return value;
}

function printMetadata(metadata: TypeBenchmarkMetadata): void {
  console.log("\nGelis type-system benchmark");

  console.log(`Runtime:     ${metadata.runtime}`);

  console.log(`TypeScript:  ${metadata.typescript}`);

  console.log(`CPU:         ${metadata.cpu}`);

  console.log(`Logical CPU: ${metadata.logicalCpus}`);

  console.log(`Memory:      ${metadata.totalMemoryMB} MB`);

  console.log(`Runs/case:   ${metadata.runsPerCase}\n`);
}

function printTable(rows: TypeBenchmarkRow[]): void {
  console.table(
    rows.map((row) => ({
      scenario: row.scenario,

      routes: row.routes,

      instantiations: Math.round(row.instantiations),

      "memory MB": round(row.memoryMB, 1),

      "check s": round(row.checkTime, 2),

      "total s": round(row.totalTime, 2),

      "check/base":
        row.checkVsBaseline === null
          ? "-"
          : `${round(row.checkVsBaseline, 2)}x`,

      "check/rich":
        row.checkVsRichContract === null
          ? "-"
          : `${round(row.checkVsRichContract, 2)}x`,
    })),
  );

  console.log(
    "\nRaw results: " + "bench/types/results/latest.json " + "and latest.csv",
  );
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function toCsv(rows: TypeBenchmarkRow[]): string {
  const columns = [
    "scenario",
    "routes",
    "runs",
    "files",
    "linesOfTypeScript",
    "identifiers",
    "symbols",
    "types",
    "instantiations",
    "memoryMB",
    "parseTime",
    "bindTime",
    "checkTime",
    "totalTime",
    "checkVsBaseline",
    "checkVsRichContract",
  ] as const satisfies readonly (keyof TypeBenchmarkRow)[];

  const lines = [columns.join(",")];

  for (const row of rows) {
    lines.push(columns.map((column) => row[column] ?? "").join(","));
  }

  return `${lines.join("\n")}\n`;
}

function readPackageVersion(packagePath: string): string {
  const parsed: unknown = JSON.parse(readFileSync(packagePath, "utf8"));

  if (
    parsed !== null &&
    typeof parsed === "object" &&
    "version" in parsed &&
    typeof parsed.version === "string"
  ) {
    return parsed.version;
  }

  throw new Error(`Unable to read package version from ${packagePath}`);
}
