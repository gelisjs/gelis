import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { cpus, totalmem } from "node:os";

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

const GENERATED_DIR = resolve(HERE, "../generated/request-context");

const RESULTS_DIR = resolve(HERE, "../results/request-context");

const DEFAULT_SIZES = [100, 500, 1000, 5000] as const;

const SCENARIOS = [
  "ordinary-plain",
  "application-context-plain",
  "request-context-plain",
  "ordinary-rich",
  "request-context-rich",
] as const;

type BenchmarkSize = (typeof DEFAULT_SIZES)[number];

type Scenario = (typeof SCENARIOS)[number];

interface Diagnostics {
  files: number | undefined;

  linesOfTypeScript: number | undefined;

  identifiers: number | undefined;

  symbols: number | undefined;

  types: number | undefined;

  instantiations: number;

  memoryMB: number;

  parseTime: number | undefined;

  bindTime: number | undefined;

  checkTime: number;

  totalTime: number;
}

interface Row extends Diagnostics {
  scenario: Scenario;

  routes: BenchmarkSize;

  runs: number;

  baseline: "ordinary-plain" | "ordinary-rich";

  checkVsBaseline: number | null;

  instantiationsVsBaseline: number | null;

  memoryVsBaseline: number | null;

  samples: Diagnostics[];
}

const SIZES = readSizesArgument(DEFAULT_SIZES);

const RUNS = readRunsArgument(3);

mkdirSync(RESULTS_DIR, {
  recursive: true,
});

// Warm compiler/filesystem startup.
compile("ordinary-plain", firstSize(SIZES));

const rows: Row[] = [];

for (const size of SIZES) {
  for (const scenario of SCENARIOS) {
    const samples: Diagnostics[] = [];

    for (let runIndex = 0; runIndex < RUNS; runIndex++) {
      samples.push(compile(scenario, size));
    }

    rows.push({
      scenario,

      routes: size,

      runs: RUNS,

      baseline: baselineFor(scenario),

      ...medianDiagnostics(samples),

      checkVsBaseline: null,

      instantiationsVsBaseline: null,

      memoryVsBaseline: null,

      samples,
    });
  }
}

for (const row of rows) {
  const baseline = rows.find(
    (candidate) =>
      candidate.scenario === row.baseline && candidate.routes === row.routes,
  );

  if (!baseline) {
    continue;
  }

  row.checkVsBaseline = ratio(row.checkTime, baseline.checkTime);

  row.instantiationsVsBaseline = ratio(
    row.instantiations,
    baseline.instantiations,
  );

  row.memoryVsBaseline = ratio(row.memoryMB, baseline.memoryMB);
}

const plainVsApplicationContext = SIZES.map((size) => {
  const request = requiredRow(rows, "request-context-plain", size);

  const application = requiredRow(rows, "application-context-plain", size);

  return {
    routes: size,

    instantiations: ratio(request.instantiations, application.instantiations),

    memory: ratio(request.memoryMB, application.memoryMB),

    check: ratio(request.checkTime, application.checkTime),
  };
});

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

const output = {
  metadata,

  rows,

  requestContextPlainVsApplicationContext: plainVsApplicationContext,
};

writeFileSync(
  resolve(RESULTS_DIR, "latest.json"),

  `${JSON.stringify(output, null, 2)}\n`,
);

printMetadata(metadata);

printTable(rows);

console.log("\nRequest-context plain vs application-context plain");

console.table(
  plainVsApplicationContext.map((row) => ({
    routes: row.routes,

    "inst x appctx": roundNullable(row.instantiations, 3),

    "mem x appctx": roundNullable(row.memory, 3),

    "check x appctx": roundNullable(row.check, 3),
  })),
);

function baselineFor(scenario: Scenario): "ordinary-plain" | "ordinary-rich" {
  return scenario.endsWith("-rich") ? "ordinary-rich" : "ordinary-plain";
}

function compile(scenario: Scenario, size: BenchmarkSize): Diagnostics {
  const project = resolve(
    GENERATED_DIR,
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
    },
  );

  if (result.status !== 0) {
    throw new Error(
      [
        `Type benchmark failed: ${scenario}-${size}`,

        result.stdout,

        result.stderr,
      ].join("\n"),
    );
  }

  return parseDiagnostics(result.stdout);
}

function parseDiagnostics(output: string): Diagnostics {
  return {
    files: readNumber(output, "Files"),

    linesOfTypeScript: readNumber(output, "Lines of TypeScript"),

    identifiers: readNumber(output, "Identifiers"),

    symbols: readNumber(output, "Symbols"),

    types: readNumber(output, "Types"),

    instantiations: requiredNumber(output, "Instantiations"),

    memoryMB: requiredMemoryMB(output),

    parseTime: readSeconds(output, "Parse time"),

    bindTime: readSeconds(output, "Bind time"),

    checkTime: requiredSeconds(output, "Check time"),

    totalTime: requiredSeconds(output, "Total time"),
  };
}

function readNumber(output: string, label: string): number | undefined {
  const match = output.match(
    new RegExp(`^${escapeRegExp(label)}:\\s+([0-9]+)`, "m"),
  );

  if (!match?.[1]) {
    return undefined;
  }

  return Number(match[1]);
}

function requiredNumber(output: string, label: string): number {
  const value = readNumber(output, label);

  if (value === undefined) {
    throw new Error(`Missing TypeScript diagnostic: ${label}`);
  }

  return value;
}

function requiredMemoryMB(output: string): number {
  const match = output.match(/^Memory used:\s+([0-9]+)K/m);

  if (!match?.[1]) {
    throw new Error("Missing TypeScript memory diagnostic");
  }

  return Number(match[1]) / 1024;
}

function readSeconds(output: string, label: string): number | undefined {
  const match = output.match(
    new RegExp(`^${escapeRegExp(label)}:\\s+([0-9.]+)s`, "m"),
  );

  if (!match?.[1]) {
    return undefined;
  }

  return Number(match[1]);
}

function requiredSeconds(output: string, label: string): number {
  const value = readSeconds(output, label);

  if (value === undefined) {
    throw new Error(`Missing TypeScript diagnostic: ${label}`);
  }

  return value;
}

function medianDiagnostics(samples: readonly Diagnostics[]): Diagnostics {
  return {
    files: medianOptional(samples.map((sample) => sample.files)),

    linesOfTypeScript: medianOptional(
      samples.map((sample) => sample.linesOfTypeScript),
    ),

    identifiers: medianOptional(samples.map((sample) => sample.identifiers)),

    symbols: medianOptional(samples.map((sample) => sample.symbols)),

    types: medianOptional(samples.map((sample) => sample.types)),

    instantiations: median(samples.map((sample) => sample.instantiations)),

    memoryMB: median(samples.map((sample) => sample.memoryMB)),

    parseTime: medianOptional(samples.map((sample) => sample.parseTime)),

    bindTime: medianOptional(samples.map((sample) => sample.bindTime)),

    checkTime: median(samples.map((sample) => sample.checkTime)),

    totalTime: median(samples.map((sample) => sample.totalTime)),
  };
}

function medianOptional(
  values: readonly (number | undefined)[],
): number | undefined {
  const defined = values.filter(
    (value): value is number => value !== undefined,
  );

  return defined.length === 0 ? undefined : median(defined);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    const value = sorted[middle];

    if (value === undefined) {
      throw new Error("Cannot calculate median");
    }

    return value;
  }

  const left = sorted[middle - 1];

  const right = sorted[middle];

  if (left === undefined || right === undefined) {
    throw new Error("Cannot calculate median");
  }

  return (left + right) / 2;
}

function ratio(value: number, baseline: number): number | null {
  return baseline === 0 ? null : value / baseline;
}

function requiredRow(
  rows: readonly Row[],
  scenario: Scenario,
  routes: BenchmarkSize,
): Row {
  const row = rows.find(
    (candidate) =>
      candidate.scenario === scenario && candidate.routes === routes,
  );

  if (!row) {
    throw new Error(`Missing row: ${scenario}-${routes}`);
  }

  return row;
}

function printMetadata(metadata: {
  runtime: string;

  typescript: string;

  cpu: string;

  logicalCpus: number;

  totalMemoryMB: number;

  runsPerCase: number;

  sizes: readonly number[];
}): void {
  console.log("\nGelis P8-A8 request-context production type benchmark");

  console.log(`Runtime:      ${metadata.runtime}`);

  console.log(`TypeScript:   ${metadata.typescript}`);

  console.log(`CPU:          ${metadata.cpu}`);

  console.log(`Logical CPU:  ${metadata.logicalCpus}`);

  console.log(`Memory:       ${metadata.totalMemoryMB} MB`);

  console.log(`Runs/case:    ${metadata.runsPerCase}`);

  console.log(`Route sizes:  ${metadata.sizes.join(", ")}`);

  console.log();
}

function printTable(rows: readonly Row[]): void {
  console.table(
    rows.map((row) => ({
      scenario: row.scenario,

      routes: row.routes,

      instantiations: row.instantiations,

      "inst x base": roundNullable(row.instantiationsVsBaseline, 3),

      "memory MB": round(row.memoryMB, 1),

      "mem x base": roundNullable(row.memoryVsBaseline, 3),

      "check s": round(row.checkTime, 3),

      "check x base": roundNullable(row.checkVsBaseline, 3),

      "total s": round(row.totalTime, 3),
    })),
  );
}

function readSizesArgument(
  fallback: readonly BenchmarkSize[],
): BenchmarkSize[] {
  const argument = process.argv.find((value) => value.startsWith("--sizes="));

  if (!argument) {
    return [...fallback];
  }

  const requested = argument
    .slice("--sizes=".length)
    .split(",")
    .map((value) => Number(value.trim()));

  const result: BenchmarkSize[] = [];

  for (const value of requested) {
    if (value !== 100 && value !== 500 && value !== 1000 && value !== 5000) {
      throw new Error(`Unsupported size: ${value}`);
    }

    result.push(value);
  }

  if (result.length === 0) {
    throw new Error("At least one size is required");
  }

  return result;
}

function readRunsArgument(fallback: number): number {
  const argument = process.argv.find((value) => value.startsWith("--runs="));

  if (!argument) {
    return fallback;
  }

  const value = Number(argument.slice("--runs=".length));

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid runs value: ${value}`);
  }

  return value;
}

function firstSize(sizes: readonly BenchmarkSize[]): BenchmarkSize {
  const first = sizes[0];

  if (first === undefined) {
    throw new Error("No benchmark size");
  }

  return first;
}

function readPackageVersion(path: string): string {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as {
    version?: unknown;
  };

  if (typeof parsed.version !== "string") {
    throw new Error(`Missing package version: ${path}`);
  }

  return parsed.version;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function roundNullable(value: number | null, digits: number): number | null {
  return value === null ? null : round(value, digits);
}
