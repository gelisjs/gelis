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

const GENERATED_DIR = resolve(HERE, "../generated/module-dependency-model");

const RESULTS_DIR = resolve(HERE, "../results/module-dependency-model");

const SIZES = [100, 500, 1_000, 5_000] as const;

const SCENARIOS = [
  "explicit-factory-control",
  "requirement-map",
  "setup-token-require",
] as const;

type BenchmarkSize = (typeof SIZES)[number];

type Scenario = (typeof SCENARIOS)[number];

/*
 * P8-C2 module dependency type-model gate.
 *
 * Frozen before results.
 *
 * explicit-factory-control:
 *   diagnostic lower bound only. Dependency types
 *   are written explicitly in callback parameters.
 *   It does not encode capability-token resolution
 *   metadata and therefore is not eligible as the
 *   final Gelis module API.
 *
 * requirement-map:
 *   module declares a typed capability map and the
 *   callback receives a mapped resolved object.
 *
 * setup-token-require:
 *   module setup is deferred to mount time and
 *   capability-local require(setup) returns T.
 *
 * Workload:
 *   100 / 500 / 1,000 / 5,000 modules
 *   up to four prior capability dependencies/module
 *   stable App root
 *   one retained unique contract/module
 *
 * At 5,000 modules, each architecture-complete
 * candidate must satisfy vs explicit control:
 *   instantiations <= 1.50x
 *   memory         <= 1.40x
 *   check time     <= 1.60x
 *
 * Normalized 100 -> 5,000 instantiation growth:
 *   <= 1.25x explicit-control growth.
 *
 * Selection rule:
 *   - explicit control is diagnostic only.
 *   - reject any candidate failing a frozen gate.
 *   - if only one candidate passes, select it.
 *   - if both pass, choose lower normalized
 *     instantiation growth.
 *   - if normalized growth differs by <= 5%,
 *     prefer setup-token-require because it avoids
 *     persisted mapped requirement shape and matches
 *     the frozen P8-B capability model.
 */
const GATES = {
  maxInstantiationsVsControl5000: 1.5,

  maxMemoryVsControl5000: 1.4,

  maxCheckVsControl5000: 1.6,

  maxNormalizedInstantiationGrowth: 1.25,

  tieNormalizedGrowthPercent: 5,
} as const;

interface Diagnostics {
  instantiations: number;

  memoryMB: number;

  checkTime: number;

  totalTime: number;
}

interface Row extends Diagnostics {
  scenario: Scenario;

  modules: BenchmarkSize;

  runs: number;

  instantiationsVsControl: number;

  memoryVsControl: number;

  checkVsControl: number;

  samples: Diagnostics[];
}

interface CandidateGate {
  readonly scenario: "requirement-map" | "setup-token-require";

  readonly instantiationsVsControl5000: number;

  readonly memoryVsControl5000: number;

  readonly checkVsControl5000: number;

  readonly normalizedInstantiationGrowth: number;

  readonly instantiationsPass: boolean;

  readonly memoryPass: boolean;

  readonly checkPass: boolean;

  readonly growthPass: boolean;

  readonly pass: boolean;
}

const RUNS = 3;

mkdirSync(RESULTS_DIR, {
  recursive: true,
});

compile("explicit-factory-control", 100);

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

  const control = pending.find(
    (entry) => entry.scenario === "explicit-factory-control",
  )?.diagnostics;

  if (control === undefined) {
    throw new Error(`Missing explicit control for ${size}`);
  }

  for (const entry of pending) {
    rows.push({
      scenario: entry.scenario,

      modules: size,

      runs: RUNS,

      ...entry.diagnostics,

      instantiationsVsControl:
        entry.diagnostics.instantiations / control.instantiations,

      memoryVsControl: entry.diagnostics.memoryMB / control.memoryMB,

      checkVsControl: entry.diagnostics.checkTime / control.checkTime,

      samples: entry.samples,
    });
  }
}

const requirementMapGate = evaluateCandidate(rows, "requirement-map");

const setupTokenGate = evaluateCandidate(rows, "setup-token-require");

const recommendation = recommend(requirementMapGate, setupTokenGate);

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
      candidateGates: [requirementMapGate, setupTokenGate],
      recommendation,
    },

    null,
    2,
  )}\n`,
);

console.log("\nGelis P8-C2 module dependency type-model gate");

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

    modules: row.modules,

    instantiations: row.instantiations,

    "inst x control": round(row.instantiationsVsControl, 3),

    "memory MB": round(row.memoryMB, 1),

    "mem x control": round(row.memoryVsControl, 3),

    "check s": round(row.checkTime, 3),

    "check x control": round(row.checkVsControl, 3),

    "total s": round(row.totalTime, 3),
  })),
);

console.log("\nP8-C2 frozen candidate gates");

console.table(
  [requirementMapGate, setupTokenGate].map((gate) => ({
    scenario: gate.scenario,

    "inst @5k": round(gate.instantiationsVsControl5000, 3),

    "mem @5k": round(gate.memoryVsControl5000, 3),

    "check @5k": round(gate.checkVsControl5000, 3),

    "normalized growth": round(gate.normalizedInstantiationGrowth, 3),

    pass: gate.pass,
  })),
);

console.log(`\nPre-frozen recommendation: ${recommendation}`);

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

function evaluateCandidate(
  allRows: readonly Row[],
  scenario: CandidateGate["scenario"],
): CandidateGate {
  const control100 = requiredRow(allRows, "explicit-factory-control", 100);

  const control5000 = requiredRow(allRows, "explicit-factory-control", 5_000);

  const candidate100 = requiredRow(allRows, scenario, 100);

  const candidate5000 = requiredRow(allRows, scenario, 5_000);

  const controlGrowth = control5000.instantiations / control100.instantiations;

  const candidateGrowth =
    candidate5000.instantiations / candidate100.instantiations;

  const normalizedInstantiationGrowth = candidateGrowth / controlGrowth;

  const instantiationsVsControl5000 =
    candidate5000.instantiations / control5000.instantiations;

  const memoryVsControl5000 = candidate5000.memoryMB / control5000.memoryMB;

  const checkVsControl5000 = candidate5000.checkTime / control5000.checkTime;

  const instantiationsPass =
    instantiationsVsControl5000 <= GATES.maxInstantiationsVsControl5000;

  const memoryPass = memoryVsControl5000 <= GATES.maxMemoryVsControl5000;

  const checkPass = checkVsControl5000 <= GATES.maxCheckVsControl5000;

  const growthPass =
    normalizedInstantiationGrowth <= GATES.maxNormalizedInstantiationGrowth;

  return {
    scenario,

    instantiationsVsControl5000,

    memoryVsControl5000,

    checkVsControl5000,

    normalizedInstantiationGrowth,

    instantiationsPass,

    memoryPass,

    checkPass,

    growthPass,

    pass: instantiationsPass && memoryPass && checkPass && growthPass,
  };
}

function recommend(
  requirementMap: CandidateGate,
  setupToken: CandidateGate,
): string {
  if (requirementMap.pass && !setupToken.pass) {
    return "requirement-map";
  }

  if (setupToken.pass && !requirementMap.pass) {
    return "setup-token-require";
  }

  if (!requirementMap.pass && !setupToken.pass) {
    return "reject-both";
  }

  const lower = Math.min(
    requirementMap.normalizedInstantiationGrowth,

    setupToken.normalizedInstantiationGrowth,
  );

  const higher = Math.max(
    requirementMap.normalizedInstantiationGrowth,

    setupToken.normalizedInstantiationGrowth,
  );

  const differencePercent = ((higher - lower) / lower) * 100;

  if (differencePercent <= GATES.tieNormalizedGrowthPercent) {
    return "setup-token-require";
  }

  return requirementMap.normalizedInstantiationGrowth <
    setupToken.normalizedInstantiationGrowth
    ? "requirement-map"
    : "setup-token-require";
}

function requiredRow(
  allRows: readonly Row[],
  scenario: Scenario,
  modules: BenchmarkSize,
): Row {
  const row = allRows.find(
    (candidate) =>
      candidate.scenario === scenario && candidate.modules === modules,
  );

  if (row === undefined) {
    throw new Error(`Missing benchmark row: ${scenario}-${modules}`);
  }

  return row;
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

  return typeof parsed.version === "string" ? parsed.version : "unknown";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
