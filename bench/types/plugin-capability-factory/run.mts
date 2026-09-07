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
const GENERATED_DIR = resolve(HERE, "../generated/plugin-capability-factory");
const RESULTS_DIR = resolve(HERE, "../results/plugin-capability-factory");

const DEFAULT_SIZES = [100, 500, 1000, 5000] as const;
const SCENARIOS = [
  "factory-untyped",
  "factory-typed",
  "cast-typed-control",
] as const;

type BenchmarkSize = (typeof DEFAULT_SIZES)[number];
type Scenario = (typeof SCENARIOS)[number];

/*
 * P8-B3-A confirmation gate.
 *
 * Frozen before results.
 * The real defineCapability<T>() spelling must still satisfy
 * the same type-scalability thresholds used to accept B2.4.
 *
 * At 5,000 capabilities/plugins:
 *   instantiations <= 1.50x factory-untyped
 *   memory         <= 1.40x factory-untyped
 *   check time     <= 1.60x factory-untyped
 *
 * Normalized 100->5000 instantiation growth:
 *   <= 1.25x factory-untyped growth
 *
 * cast-typed-control is diagnostic only and represents the
 * already-accepted B2.4 preconstructed-token shape.
 */
const GATES = {
  maxInstantiationsVsBaseline5000: 1.5,
  maxMemoryVsBaseline5000: 1.4,
  maxCheckVsBaseline5000: 1.6,
  maxNormalizedInstantiationGrowth: 1.25,
} as const;

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
  plugins: BenchmarkSize;
  runs: number;
  instantiationsVsBaseline: number;
  memoryVsBaseline: number;
  checkVsBaseline: number;
  samples: Diagnostics[];
}

const SIZES = readSizesArgument(DEFAULT_SIZES);
const RUNS = readRunsArgument(3);

mkdirSync(RESULTS_DIR, { recursive: true });

compile("factory-untyped", firstSize(SIZES));

const rows: Row[] = [];

for (const size of SIZES) {
  const pending: Array<{
    scenario: Scenario;
    diagnostics: Diagnostics;
    samples: Diagnostics[];
  }> = [];

  for (const scenario of SCENARIOS) {
    const samples: Diagnostics[] = [];

    for (let runIndex = 0; runIndex < RUNS; runIndex++) {
      samples.push(compile(scenario, size));
    }

    pending.push({
      scenario,
      diagnostics: medianDiagnostics(samples),
      samples,
    });
  }

  const baseline = pending.find(
    (entry) => entry.scenario === "factory-untyped",
  )?.diagnostics;

  if (!baseline) {
    throw new Error(`Missing factory-untyped baseline for ${size}`);
  }

  for (const entry of pending) {
    rows.push({
      scenario: entry.scenario,
      plugins: size,
      runs: RUNS,
      ...entry.diagnostics,
      instantiationsVsBaseline:
        entry.diagnostics.instantiations / baseline.instantiations,
      memoryVsBaseline: entry.diagnostics.memoryMB / baseline.memoryMB,
      checkVsBaseline: entry.diagnostics.checkTime / baseline.checkTime,
      samples: entry.samples,
    });
  }
}

const gateResult =
  hasSize(SIZES, 100) && hasSize(SIZES, 5000) ? evaluateGate(rows) : undefined;

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
  gates: GATES,
};

writeFileSync(
  resolve(RESULTS_DIR, "latest.json"),
  `${JSON.stringify({ metadata, rows, gateResult }, null, 2)}\n`,
);

printMetadata(metadata);

console.table(
  rows.map((row) => ({
    scenario: row.scenario,
    plugins: row.plugins,
    instantiations: row.instantiations,
    "inst x base": round(row.instantiationsVsBaseline, 3),
    "memory MB": round(row.memoryMB, 1),
    "mem x base": round(row.memoryVsBaseline, 3),
    "check s": round(row.checkTime, 3),
    "check x base": round(row.checkVsBaseline, 3),
    "total s": round(row.totalTime, 3),
  })),
);

if (gateResult === undefined) {
  console.log(
    "\nAcceptance gate evaluation skipped: run both 100 and 5000 sizes.",
  );
} else {
  console.log("\nP8-B3-A frozen capability-factory gate");

  console.table([
    {
      scenario: "factory-typed",
      "inst x base @5k": round(gateResult.instantiationsVsBaseline5000, 3),
      "mem x base @5k": round(gateResult.memoryVsBaseline5000, 3),
      "check x base @5k": round(gateResult.checkVsBaseline5000, 3),
      "normalized inst growth": round(
        gateResult.normalizedInstantiationGrowth,
        3,
      ),
      pass: gateResult.pass,
    },
  ]);
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
  console.log("\nGelis P8-B3-A capability-factory benchmark");
  console.log(`Runtime:      ${metadata.runtime}`);
  console.log(`TypeScript:   ${metadata.typescript}`);
  console.log(`CPU:          ${metadata.cpu}`);
  console.log(`Logical CPU:  ${metadata.logicalCpus}`);
  console.log(`Memory:       ${metadata.totalMemoryMB} MB`);
  console.log(`Runs/case:    ${metadata.runsPerCase}`);
  console.log(`Plugin sizes: ${metadata.sizes.join(", ")}`);
  console.log();
}

function evaluateGate(rows: readonly Row[]) {
  const baseline100 = requiredRow(rows, "factory-untyped", 100);
  const baseline5000 = requiredRow(rows, "factory-untyped", 5000);
  const candidate100 = requiredRow(rows, "factory-typed", 100);
  const candidate5000 = requiredRow(rows, "factory-typed", 5000);

  const instantiationsVsBaseline5000 =
    candidate5000.instantiations / baseline5000.instantiations;

  const memoryVsBaseline5000 = candidate5000.memoryMB / baseline5000.memoryMB;

  const checkVsBaseline5000 = candidate5000.checkTime / baseline5000.checkTime;

  const baselineGrowth =
    baseline5000.instantiations / baseline100.instantiations;

  const candidateGrowth =
    candidate5000.instantiations / candidate100.instantiations;

  const normalizedInstantiationGrowth = candidateGrowth / baselineGrowth;

  return {
    instantiationsVsBaseline5000,
    memoryVsBaseline5000,
    checkVsBaseline5000,
    normalizedInstantiationGrowth,
    pass:
      instantiationsVsBaseline5000 <= GATES.maxInstantiationsVsBaseline5000 &&
      memoryVsBaseline5000 <= GATES.maxMemoryVsBaseline5000 &&
      checkVsBaseline5000 <= GATES.maxCheckVsBaseline5000 &&
      normalizedInstantiationGrowth <= GATES.maxNormalizedInstantiationGrowth,
  };
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
    { cwd: ROOT, encoding: "utf8" },
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

  return match?.[1] === undefined ? undefined : Number(match[1]);
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

  return match?.[1] === undefined ? undefined : Number(match[1]);
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

function requiredRow(
  rows: readonly Row[],
  scenario: Scenario,
  plugins: BenchmarkSize,
): Row {
  const row = rows.find(
    (candidate) =>
      candidate.scenario === scenario && candidate.plugins === plugins,
  );

  if (!row) {
    throw new Error(`Missing row: ${scenario}-${plugins}`);
  }

  return row;
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

function hasSize(
  sizes: readonly BenchmarkSize[],
  size: BenchmarkSize,
): boolean {
  return sizes.includes(size);
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
