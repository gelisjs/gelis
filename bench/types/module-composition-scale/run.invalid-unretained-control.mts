import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { cpus, totalmem } from "node:os";

import { resolve } from "node:path";

import { spawnSync } from "node:child_process";

import { fileURLToPath } from "node:url";

import "./generate.invalid-unretained-control.mts";

const HERE = fileURLToPath(new URL(".", import.meta.url));

const ROOT = resolve(HERE, "../../..");

const TSC = resolve(ROOT, "node_modules/typescript/lib/tsc.js");

const TYPESCRIPT_PACKAGE = resolve(
  ROOT,
  "node_modules/typescript/package.json",
);

const GENERATED_DIR = resolve(HERE, "../generated/module-composition-scale");

const RESULTS_DIR = resolve(HERE, "../results/module-composition-scale");

const SIZES = [100, 500, 1_000, 5_000] as const;

const SCENARIOS = ["direct-composition-control", "module-composition"] as const;

type BenchmarkSize = (typeof SIZES)[number];

type Scenario = (typeof SCENARIOS)[number];

/*
 * P8-C8 production module type scalability gate.
 *
 * Frozen before results.
 *
 * Both sides use the real Gelis public API.
 *
 * direct-composition-control:
 *   equivalent ordinary routes, application scopes,
 *   request scopes, and request-local lifecycle are
 *   registered directly on Gelis.
 *
 * module-composition:
 *   the equivalent mixed workload is declared through
 *   defineModule, capability requirements, module
 *   lifecycle, module.requestScope, and app.mount().
 *
 * At 5,000 composition units:
 *   instantiations <= 1.50x direct control
 *   memory         <= 1.40x direct control
 *   check time     <= 1.60x direct control
 *
 * Normalized 100 -> 5,000 instantiation growth:
 *   <= 1.25x direct-control growth
 *
 * Stable Gelis root type is a mandatory compile
 * invariant in every generated case.
 */
const GATES = {
  maxInstantiationsVsBaseline5000: 1.5,

  maxMemoryVsBaseline5000: 1.4,

  maxCheckVsBaseline5000: 1.6,

  maxNormalizedInstantiationGrowth: 1.25,
} as const;

interface Diagnostics {
  instantiations: number;

  memoryMB: number;

  checkTime: number;

  totalTime: number;
}

interface Row extends Diagnostics {
  scenario: Scenario;

  units: BenchmarkSize;

  runs: number;

  instantiationsVsBaseline: number;

  memoryVsBaseline: number;

  checkVsBaseline: number;

  samples: Diagnostics[];
}

const RUNS = 3;

mkdirSync(RESULTS_DIR, {
  recursive: true,
});

/*
 * Warm compiler/process path once.
 */
compile("direct-composition-control", 100);

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
    (entry) => entry.scenario === "direct-composition-control",
  )?.diagnostics;

  if (baseline === undefined) {
    throw new Error(`Missing direct composition baseline for ${size}`);
  }

  for (const entry of pending) {
    rows.push({
      scenario: entry.scenario,

      units: size,

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

const gateResult = evaluateGate(rows);

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
      gateResult,
    },

    null,
    2,
  )}\n`,
);

console.log("\nGelis P8-C8 module type scalability gate");

console.log(`Runtime:       ${metadata.runtime}`);

console.log(`TypeScript:    ${metadata.typescript}`);

console.log(`CPU:           ${metadata.cpu}`);

console.log(`Logical CPU:   ${metadata.logicalCpus}`);

console.log(`Memory:        ${metadata.totalMemoryMB} MB`);

console.log(`Runs/case:     ${RUNS}`);

console.log();

console.table(
  rows.map((row) => ({
    scenario: row.scenario,

    units: row.units,

    instantiations: row.instantiations,

    "inst x base": round(row.instantiationsVsBaseline, 3),

    "memory MB": round(row.memoryMB, 1),

    "mem x base": round(row.memoryVsBaseline, 3),

    "check s": round(row.checkTime, 3),

    "check x base": round(row.checkVsBaseline, 3),

    "total s": round(row.totalTime, 3),
  })),
);

console.log("\nP8-C8 frozen module type gate");

console.table([
  {
    metric: "instantiations @5k",

    observed: round(gateResult.instantiationsVsBaseline5000, 3),

    max: GATES.maxInstantiationsVsBaseline5000,

    pass: gateResult.instantiationsPass,
  },

  {
    metric: "memory @5k",

    observed: round(gateResult.memoryVsBaseline5000, 3),

    max: GATES.maxMemoryVsBaseline5000,

    pass: gateResult.memoryPass,
  },

  {
    metric: "check time @5k",

    observed: round(gateResult.checkVsBaseline5000, 3),

    max: GATES.maxCheckVsBaseline5000,

    pass: gateResult.checkPass,
  },

  {
    metric: "normalized inst growth 100->5k",

    observed: round(gateResult.normalizedInstantiationGrowth, 3),

    max: GATES.maxNormalizedInstantiationGrowth,

    pass: gateResult.growthPass,
  },
]);

console.log(
  `\nPre-frozen recommendation: ${
    gateResult.pass ? "accept-c8-types" : "reject-c8-types"
  }`,
);

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
      [`TypeScript benchmark failed for ${scenario}-${size}`, output].join(
        "\n",
      ),
    );
  }

  return parseDiagnostics(output);
}

function parseDiagnostics(output: string): Diagnostics {
  return {
    instantiations: parseIntegerMetric(output, "Instantiations"),

    memoryMB: parseMemoryMB(output),

    checkTime: parseSecondsMetric(output, "Check time"),

    totalTime: parseSecondsMetric(output, "Total time"),
  };
}

function parseIntegerMetric(output: string, name: string): number {
  const match = output.match(new RegExp(`${escapeRegExp(name)}:\\s*([\\d,]+)`));

  if (match === null) {
    throw new Error(`Missing TypeScript diagnostic: ${name}`);
  }

  return Number(match[1]!.replaceAll(",", ""));
}

function parseMemoryMB(output: string): number {
  const match = output.match(/Memory used:\s*([\d,]+)K/);

  if (match === null) {
    throw new Error("Missing TypeScript diagnostic: Memory used");
  }

  return Number(match[1]!.replaceAll(",", "")) / 1024;
}

function parseSecondsMetric(output: string, name: string): number {
  const match = output.match(
    new RegExp(`${escapeRegExp(name)}:\\s*([\\d.]+)s`),
  );

  if (match === null) {
    throw new Error(`Missing TypeScript diagnostic: ${name}`);
  }

  return Number(match[1]);
}

function medianDiagnostics(samples: readonly Diagnostics[]): Diagnostics {
  return {
    instantiations: median(samples.map((sample) => sample.instantiations)),

    memoryMB: median(samples.map((sample) => sample.memoryMB)),

    checkTime: median(samples.map((sample) => sample.checkTime)),

    totalTime: median(samples.map((sample) => sample.totalTime)),
  };
}

function evaluateGate(allRows: readonly Row[]): {
  readonly instantiationsVsBaseline5000: number;

  readonly memoryVsBaseline5000: number;

  readonly checkVsBaseline5000: number;

  readonly normalizedInstantiationGrowth: number;

  readonly instantiationsPass: boolean;

  readonly memoryPass: boolean;

  readonly checkPass: boolean;

  readonly growthPass: boolean;

  readonly pass: boolean;
} {
  const baseline100 = requiredRow(allRows, "direct-composition-control", 100);

  const baseline5000 = requiredRow(
    allRows,
    "direct-composition-control",
    5_000,
  );

  const candidate100 = requiredRow(allRows, "module-composition", 100);

  const candidate5000 = requiredRow(allRows, "module-composition", 5_000);

  const baselineGrowth =
    baseline5000.instantiations / baseline100.instantiations;

  const candidateGrowth =
    candidate5000.instantiations / candidate100.instantiations;

  const normalizedInstantiationGrowth = candidateGrowth / baselineGrowth;

  const instantiationsVsBaseline5000 =
    candidate5000.instantiations / baseline5000.instantiations;

  const memoryVsBaseline5000 = candidate5000.memoryMB / baseline5000.memoryMB;

  const checkVsBaseline5000 = candidate5000.checkTime / baseline5000.checkTime;

  const instantiationsPass =
    instantiationsVsBaseline5000 <= GATES.maxInstantiationsVsBaseline5000;

  const memoryPass = memoryVsBaseline5000 <= GATES.maxMemoryVsBaseline5000;

  const checkPass = checkVsBaseline5000 <= GATES.maxCheckVsBaseline5000;

  const growthPass =
    normalizedInstantiationGrowth <= GATES.maxNormalizedInstantiationGrowth;

  return {
    instantiationsVsBaseline5000,

    memoryVsBaseline5000,

    checkVsBaseline5000,

    normalizedInstantiationGrowth,

    instantiationsPass,

    memoryPass,

    checkPass,

    growthPass,

    pass: instantiationsPass && memoryPass && checkPass && growthPass,
  };
}

function requiredRow(
  allRows: readonly Row[],
  scenario: Scenario,
  units: BenchmarkSize,
): Row {
  const row = allRows.find(
    (candidate) => candidate.scenario === scenario && candidate.units === units,
  );

  if (row === undefined) {
    throw new Error(`Missing benchmark row: ${scenario}-${units}`);
  }

  return row;
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
