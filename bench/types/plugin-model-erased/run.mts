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

const GENERATED_DIR = resolve(HERE, "../generated/plugin-model-erased");

const RESULTS_DIR = resolve(HERE, "../results/plugin-model-erased");

const DEFAULT_SIZES = [100, 500, 1000, 5000] as const;

const SCENARIOS = [
  "baseline-untyped",
  "retained-token-map",
  "erased-token-tuple",
  "erased-token-map",
] as const;

type BenchmarkSize = (typeof DEFAULT_SIZES)[number];

type Scenario = (typeof SCENARIOS)[number];

type Candidate = "erased-token-tuple" | "erased-token-map";

/*
 * P8-B2.1 acceptance gates.
 *
 * Frozen before results. These are intentionally identical
 * to B2 v1; a rejected model does not earn looser criteria.
 *
 * At 5,000 plugins:
 *   instantiations <= 1.50x baseline
 *   memory         <= 1.40x baseline
 *   check time     <= 1.60x baseline
 *
 * Normalized 100->5000 instantiation growth:
 *   <= 1.25x baseline growth
 *
 * If both erased models pass and erased-token-map stays
 * within 10% of erased-token-tuple on all 5k metrics,
 * token-map wins the ergonomic tie-break.
 */
const GATES = {
  maxInstantiationsVsBaseline5000: 1.5,
  maxMemoryVsBaseline5000: 1.4,
  maxCheckVsBaseline5000: 1.6,
  maxNormalizedInstantiationGrowth: 1.25,
  ergonomicTieThreshold: 1.1,
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
  instantiationsVsBaseline: number | null;
  memoryVsBaseline: number | null;
  checkVsBaseline: number | null;
  samples: Diagnostics[];
}

interface GateResult {
  scenario: Candidate;
  instantiationsVsBaseline5000: number;
  memoryVsBaseline5000: number;
  checkVsBaseline5000: number;
  normalizedInstantiationGrowth: number;
  pass: boolean;
}

const SIZES = readSizesArgument(DEFAULT_SIZES);

const RUNS = readRunsArgument(3);

mkdirSync(RESULTS_DIR, {
  recursive: true,
});

compile("baseline-untyped", firstSize(SIZES));

const rows: Row[] = [];

for (const size of SIZES) {
  for (const scenario of SCENARIOS) {
    const samples: Diagnostics[] = [];

    for (let runIndex = 0; runIndex < RUNS; runIndex++) {
      samples.push(compile(scenario, size));
    }

    rows.push({
      scenario,
      plugins: size,
      runs: RUNS,
      ...medianDiagnostics(samples),
      instantiationsVsBaseline: null,
      memoryVsBaseline: null,
      checkVsBaseline: null,
      samples,
    });
  }
}

for (const row of rows) {
  const baseline = requiredRow(rows, "baseline-untyped", row.plugins);

  row.instantiationsVsBaseline = ratio(
    row.instantiations,
    baseline.instantiations,
  );

  row.memoryVsBaseline = ratio(row.memoryMB, baseline.memoryMB);

  row.checkVsBaseline = ratio(row.checkTime, baseline.checkTime);
}

const gateResults =
  hasSize(SIZES, 100) && hasSize(SIZES, 5000) ? evaluateGates(rows) : undefined;

const recommendation =
  gateResults === undefined ? undefined : recommend(rows, gateResults);

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
  `${JSON.stringify(
    {
      metadata,
      rows,
      gateResults,
      recommendation,
    },
    null,
    2,
  )}\n`,
);

printMetadata(metadata);
printTable(rows);

if (gateResults === undefined) {
  console.log(
    "\nAcceptance gate evaluation skipped: run both 100 and 5000 plugin sizes.",
  );
} else {
  printGateTable(gateResults);
  console.log(`\nPre-frozen recommendation: ${recommendation ?? "none"}`);
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

function evaluateGates(rows: readonly Row[]): GateResult[] {
  const baseline100 = requiredRow(rows, "baseline-untyped", 100);

  const baseline5000 = requiredRow(rows, "baseline-untyped", 5000);

  const baselineGrowth =
    baseline5000.instantiations / baseline100.instantiations;

  const candidates: readonly Candidate[] = [
    "erased-token-tuple",
    "erased-token-map",
  ];

  return candidates.map((scenario) => {
    const row100 = requiredRow(rows, scenario, 100);
    const row5000 = requiredRow(rows, scenario, 5000);

    const instantiationsVsBaseline5000 =
      row5000.instantiations / baseline5000.instantiations;

    const memoryVsBaseline5000 = row5000.memoryMB / baseline5000.memoryMB;

    const checkVsBaseline5000 = row5000.checkTime / baseline5000.checkTime;

    const candidateGrowth = row5000.instantiations / row100.instantiations;

    const normalizedInstantiationGrowth = candidateGrowth / baselineGrowth;

    const pass =
      instantiationsVsBaseline5000 <= GATES.maxInstantiationsVsBaseline5000 &&
      memoryVsBaseline5000 <= GATES.maxMemoryVsBaseline5000 &&
      checkVsBaseline5000 <= GATES.maxCheckVsBaseline5000 &&
      normalizedInstantiationGrowth <= GATES.maxNormalizedInstantiationGrowth;

    return {
      scenario,
      instantiationsVsBaseline5000,
      memoryVsBaseline5000,
      checkVsBaseline5000,
      normalizedInstantiationGrowth,
      pass,
    };
  });
}

function recommend(
  rows: readonly Row[],
  gateResults: readonly GateResult[],
): Candidate | undefined {
  const tupleGate = gateResults.find(
    (result) => result.scenario === "erased-token-tuple",
  );

  const mapGate = gateResults.find(
    (result) => result.scenario === "erased-token-map",
  );

  if (!tupleGate?.pass && !mapGate?.pass) {
    return undefined;
  }

  if (tupleGate?.pass && !mapGate?.pass) {
    return "erased-token-tuple";
  }

  if (mapGate?.pass && !tupleGate?.pass) {
    return "erased-token-map";
  }

  const tuple = requiredRow(rows, "erased-token-tuple", 5000);

  const map = requiredRow(rows, "erased-token-map", 5000);

  const mapWithinTie =
    map.instantiations <= tuple.instantiations * GATES.ergonomicTieThreshold &&
    map.memoryMB <= tuple.memoryMB * GATES.ergonomicTieThreshold &&
    map.checkTime <= tuple.checkTime * GATES.ergonomicTieThreshold;

  if (mapWithinTie) {
    return "erased-token-map";
  }

  return tuple.instantiations <= map.instantiations
    ? "erased-token-tuple"
    : "erased-token-map";
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

function ratio(value: number, baseline: number): number | null {
  return baseline === 0 ? null : value / baseline;
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

function printMetadata(metadata: {
  runtime: string;
  typescript: string;
  cpu: string;
  logicalCpus: number;
  totalMemoryMB: number;
  runsPerCase: number;
  sizes: readonly number[];
}): void {
  console.log("\nGelis P8-B2.1 erased-plugin type benchmark");
  console.log(`Runtime:      ${metadata.runtime}`);
  console.log(`TypeScript:   ${metadata.typescript}`);
  console.log(`CPU:          ${metadata.cpu}`);
  console.log(`Logical CPU:  ${metadata.logicalCpus}`);
  console.log(`Memory:       ${metadata.totalMemoryMB} MB`);
  console.log(`Runs/case:    ${metadata.runsPerCase}`);
  console.log(`Plugin sizes: ${metadata.sizes.join(", ")}`);
  console.log();
}

function printTable(rows: readonly Row[]): void {
  console.table(
    rows.map((row) => ({
      scenario: row.scenario,
      plugins: row.plugins,
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

function printGateTable(results: readonly GateResult[]): void {
  console.log("\nP8-B2.1 frozen acceptance gates");

  console.table(
    results.map((result) => ({
      scenario: result.scenario,
      "inst x base @5k": round(result.instantiationsVsBaseline5000, 3),
      "mem x base @5k": round(result.memoryVsBaseline5000, 3),
      "check x base @5k": round(result.checkVsBaseline5000, 3),
      "normalized inst growth": round(result.normalizedInstantiationGrowth, 3),
      pass: result.pass,
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

function roundNullable(value: number | null, digits: number): number | null {
  return value === null ? null : round(value, digits);
}
