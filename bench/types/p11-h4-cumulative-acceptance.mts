import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CONTROL_SHA = "0df4f1e20bef3e9fa7c9a554be022bc241536424";
const CANDIDATE_SHA = "1dd5f94cf0e9ad884ca44e537ee287587cd8baab";
const TYPESCRIPT_VERSION = "7.0.2";

const SIZES = [100, 500, 1000, 5000] as const;
const RUNS = 3;
const ROUTES_PER_FILE = 50;

const INSTANTIATIONS_MAX = 1.15;
const MEMORY_MAX = 1.15;
const CHECK_MAX = 1.25;
const CHECK_5000_MAX = 1.2;
const INSTANTIATIONS_GROWTH_MAX = 5.5;
const CHECK_GROWTH_MAX = 6;

type BenchmarkSize = (typeof SIZES)[number];
type MatrixAScenario = "control" | "candidate";
type MatrixBScenario = "baseline" | "feature";

interface RouteChunk {
  readonly start: number;
  readonly end: number;
}

interface TypeDiagnostics {
  readonly instantiations: number;
  readonly memoryMB: number;
  readonly checkTime: number;
  readonly totalTime: number;
}

interface CaseSummary extends TypeDiagnostics {
  readonly routes: BenchmarkSize;
}

interface ComparisonSummary {
  readonly routes: BenchmarkSize;
  readonly instantiationsRatio: number;
  readonly memoryRatio: number;
  readonly checkRatio: number;
  readonly pass: boolean;
}

const HERE = fileURLToPath(new URL(".", import.meta.url));
const HARNESS_ROOT = resolve(HERE, "../..");
const TSC = resolve(HARNESS_ROOT, "node_modules/typescript/lib/tsc.js");

const controlRoot = readRootArgument("--control-root");
const candidateRoot = readRootArgument("--candidate-root");

assertGitHead(controlRoot, CONTROL_SHA, "control");
assertGitHead(candidateRoot, CANDIDATE_SHA, "candidate");
assertTypeScriptVersion();

for (const size of SIZES) {
  generatePlainRoutes(controlRoot, size);
  generatePlainRoutes(candidateRoot, size);
  generateManagedRoutes(candidateRoot, size, false);
  generateManagedRoutes(candidateRoot, size, true);
}

compile(controlRoot, plainScenarioName(100));
compile(candidateRoot, managedScenarioName(100, true));

console.log("\nP11-H4 cumulative TypeScript scalability acceptance\n");
console.log(`Runtime:       bun ${Bun.version}`);
console.log(`TypeScript:    ${TYPESCRIPT_VERSION}`);
console.log(`CPU:           ${cpus()[0]?.model ?? "unknown"}`);
console.log(`Runs/case:     ${RUNS}`);
console.log(`Sizes:         ${SIZES.join(", ")}`);
console.log(`Control SHA:   ${CONTROL_SHA}`);
console.log(`Candidate SHA: ${CANDIDATE_SHA}`);
console.log(`Inst gate:     <= ${INSTANTIATIONS_MAX}x per size`);
console.log(`Memory gate:   <= ${MEMORY_MAX}x per size`);
console.log(`Check gate:    <= ${CHECK_MAX}x per size`);
console.log(`5k check gate: <= ${CHECK_5000_MAX}x`);
console.log(
  `Growth gates:  inst <= ${INSTANTIATIONS_GROWTH_MAX}x; check <= ${CHECK_GROWTH_MAX}x (1000→5000)`,
);

const matrixA = new Map<MatrixAScenario, Map<BenchmarkSize, CaseSummary>>([
  ["control", new Map()],
  ["candidate", new Map()],
]);
const matrixB = new Map<MatrixBScenario, Map<BenchmarkSize, CaseSummary>>([
  ["baseline", new Map()],
  ["feature", new Map()],
]);

console.log("\nMatrix A — plain-route cumulative no-regression\n");

for (const size of SIZES) {
  for (const scenario of ["control", "candidate"] as const) {
    const root = scenario === "control" ? controlRoot : candidateRoot;
    const summary = runCase(root, plainScenarioName(size));

    matrixA.get(scenario)!.set(size, { routes: size, ...summary });
    printCase(scenario, size, summary);
  }
}

const matrixAComparisons = SIZES.map((size) =>
  compareCases(
    matrixA.get("candidate")!.get(size)!,
    matrixA.get("control")!.get(size)!,
  ),
);

printComparisons("Matrix A relative summary", matrixAComparisons);

const matrixACandidateGrowth = growth(
  matrixA.get("candidate")!.get(1000)!,
  matrixA.get("candidate")!.get(5000)!,
);
printGrowth("Matrix A candidate 1000→5000 growth", matrixACandidateGrowth);

console.log("\nMatrix B — combined P11 route-policy scaling\n");

for (const size of SIZES) {
  for (const scenario of ["baseline", "feature"] as const) {
    const summary = runCase(
      candidateRoot,
      managedScenarioName(size, scenario === "feature"),
    );

    matrixB.get(scenario)!.set(size, { routes: size, ...summary });
    printCase(scenario, size, summary);
  }
}

const matrixBComparisons = SIZES.map((size) =>
  compareCases(
    matrixB.get("feature")!.get(size)!,
    matrixB.get("baseline")!.get(size)!,
  ),
);

printComparisons("Matrix B relative summary", matrixBComparisons);

const matrixBFeatureGrowth = growth(
  matrixB.get("feature")!.get(1000)!,
  matrixB.get("feature")!.get(5000)!,
);
printGrowth("Matrix B feature 1000→5000 growth", matrixBFeatureGrowth);

const failedMatrixA = matrixAComparisons.filter((row) => !row.pass);
const failedMatrixB = matrixBComparisons.filter((row) => !row.pass);

if (
  failedMatrixA.length !== 0 ||
  failedMatrixB.length !== 0 ||
  !matrixACandidateGrowth.pass ||
  !matrixBFeatureGrowth.pass
) {
  throw new Error(
    [
      "P11-H4 TypeScript scalability gate failed",
      ...failedMatrixA.map((row) => `matrix-a/${row.routes}`),
      ...failedMatrixB.map((row) => `matrix-b/${row.routes}`),
      ...(matrixACandidateGrowth.pass ? [] : ["matrix-a/growth"]),
      ...(matrixBFeatureGrowth.pass ? [] : ["matrix-b/growth"]),
    ].join(": "),
  );
}

console.log("\nStructural root-type assertions compiled successfully.");
console.log("P11-H4 ACCEPTANCE: PASS");

function runCase(root: string, scenario: string): TypeDiagnostics {
  const samples: TypeDiagnostics[] = [];

  for (let run = 0; run < RUNS; run++) {
    samples.push(compile(root, scenario));
  }

  return medianDiagnostics(samples);
}

function generatePlainRoutes(root: string, size: BenchmarkSize): void {
  const directory = caseDir(root, plainScenarioName(size));
  const imports: string[] = [];

  writeFileSync(
    resolve(directory, "app.ts"),
    [
      "import { Gelis } from '../../../../src'",
      "",
      "export const app = new Gelis()",
      "",
    ].join("\n"),
  );

  for (const [fileIndex, { start, end }] of chunks(size).entries()) {
    const name = `routes-${String(fileIndex).padStart(3, "0")}.ts`;
    imports.push(`import './${name}'`);

    const lines = ["import { app } from './app'", ""];

    for (let index = start; index < end; index++) {
      lines.push(
        `app.get('/bench/${index}/:id', ({ params }) => ({ id: params.id, route: ${index} }))`,
      );
    }

    writeFileSync(resolve(directory, name), `${lines.join("\n")}\n`);
  }

  writeRootAssertion(directory, imports);
}

function generateManagedRoutes(
  root: string,
  size: BenchmarkSize,
  feature: boolean,
): void {
  const directory = caseDir(root, managedScenarioName(size, feature));
  const imports: string[] = [];

  writeFileSync(
    resolve(directory, "app.ts"),
    [
      "import { Gelis } from '../../../../src'",
      "import type { StandardSchemaV1 } from '../../../../src'",
      "",
      "export const app = new Gelis()",
      "",
      "export const Body: StandardSchemaV1<unknown, { value: string }> = {",
      "  '~standard': {",
      "    version: 1,",
      "    vendor: 'p11-h4',",
      "    validate(value) {",
      "      if (",
      "        typeof value !== 'object' ||",
      "        value === null ||",
      "        !('value' in value) ||",
      "        typeof value.value !== 'string'",
      "      ) {",
      "        return { issues: [{ message: 'Expected string value' }] }",
      "      }",
      "",
      "      return { value: { value: value.value } }",
      "    },",
      "  },",
      "}",
      "",
    ].join("\n"),
  );

  for (const [fileIndex, { start, end }] of chunks(size).entries()) {
    const name = `routes-${String(fileIndex).padStart(3, "0")}.ts`;
    imports.push(`import './${name}'`);

    const lines = ["import { app, Body } from './app'", ""];

    for (let index = start; index < end; index++) {
      const options = feature
        ? "{ body: Body, bodyParser: 'json', bodyLimit: 1024, timeout: 1000 }"
        : "{ body: Body, bodyParser: 'json' }";

      lines.push(
        `app.post('/bench/${index}/:id', ${options}, ` +
          `({ params, body }) => ({ id: params.id, value: body.value, route: ${index} }))`,
      );
    }

    writeFileSync(resolve(directory, name), `${lines.join("\n")}\n`);
  }

  writeRootAssertion(directory, imports);
}

function writeRootAssertion(directory: string, imports: readonly string[]): void {
  writeFileSync(
    resolve(directory, "index.ts"),
    [
      imports.join("\n"),
      "import { app } from './app'",
      "import type { Gelis } from '../../../../src'",
      "",
      "type Equal<A, B> =",
      "  (<T>() => T extends A ? 1 : 2) extends",
      "  (<T>() => T extends B ? 1 : 2) ? true : false",
      "type Expect<T extends true> = T",
      "type RootStable = Expect<Equal<typeof app, Gelis>>",
      "void (null as unknown as RootStable)",
      "",
    ].join("\n"),
  );
}

function caseDir(root: string, scenario: string): string {
  const directory = resolve(root, "bench/types/generated", scenario);
  mkdirSync(directory, { recursive: true });

  writeFileSync(
    resolve(directory, "tsconfig.json"),
    `${JSON.stringify(
      {
        extends: "../../../../tsconfig.json",
        compilerOptions: {
          noEmit: true,
          incremental: false,
        },
        include: ["./**/*.ts"],
      },
      null,
      2,
    )}\n`,
  );

  return directory;
}

function chunks(size: BenchmarkSize): RouteChunk[] {
  const result: RouteChunk[] = [];

  for (let start = 0; start < size; start += ROUTES_PER_FILE) {
    result.push({
      start,
      end: Math.min(start + ROUTES_PER_FILE, size),
    });
  }

  return result;
}

function plainScenarioName(size: BenchmarkSize): string {
  return `p11-h4-plain-${size}`;
}

function managedScenarioName(size: BenchmarkSize, feature: boolean): string {
  return `p11-h4-managed-${feature ? "feature" : "baseline"}-${size}`;
}

function compile(root: string, scenario: string): TypeDiagnostics {
  const project = resolve(
    root,
    "bench/types/generated",
    scenario,
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
      cwd: root,
      encoding: "utf8",
      env: process.env,
    },
  );

  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`TypeScript compile failed: ${scenario}`);
  }

  return parseDiagnostics(result.stdout);
}

function parseDiagnostics(output: string): TypeDiagnostics {
  let instantiations: number | undefined;
  let memoryMB: number | undefined;
  let checkTime: number | undefined;
  let totalTime: number | undefined;

  for (const line of output.split(/\r?\n/)) {
    const match = /^([^:]+):\s+(.+)$/.exec(line.trim());
    if (!match) continue;

    const key = match[1];
    const raw = match[2];
    if (key === undefined || raw === undefined) continue;

    switch (key) {
      case "Instantiations":
        instantiations = parseNumber(raw);
        break;
      case "Memory used":
        memoryMB = parseMemoryMB(raw);
        break;
      case "Check time":
        checkTime = parseSeconds(raw);
        break;
      case "Total time":
        totalTime = parseSeconds(raw);
        break;
    }
  }

  if (
    instantiations === undefined ||
    memoryMB === undefined ||
    checkTime === undefined ||
    totalTime === undefined
  ) {
    throw new Error("Unable to parse required TypeScript diagnostics");
  }

  return { instantiations, memoryMB, checkTime, totalTime };
}

function medianDiagnostics(
  samples: readonly TypeDiagnostics[],
): TypeDiagnostics {
  return {
    instantiations: median(samples.map((sample) => sample.instantiations)),
    memoryMB: median(samples.map((sample) => sample.memoryMB)),
    checkTime: median(samples.map((sample) => sample.checkTime)),
    totalTime: median(samples.map((sample) => sample.totalTime)),
  };
}

function compareCases(
  candidate: CaseSummary,
  control: CaseSummary,
): ComparisonSummary {
  const instantiationsRatio = candidate.instantiations / control.instantiations;
  const memoryRatio = candidate.memoryMB / control.memoryMB;
  const checkRatio = candidate.checkTime / control.checkTime;
  const checkLimit = candidate.routes === 5000 ? CHECK_5000_MAX : CHECK_MAX;

  return {
    routes: candidate.routes,
    instantiationsRatio,
    memoryRatio,
    checkRatio,
    pass:
      instantiationsRatio <= INSTANTIATIONS_MAX &&
      memoryRatio <= MEMORY_MAX &&
      checkRatio <= checkLimit,
  };
}

function growth(from: CaseSummary, to: CaseSummary) {
  const instantiationsRatio = to.instantiations / from.instantiations;
  const checkRatio = to.checkTime / from.checkTime;

  return {
    instantiationsRatio,
    checkRatio,
    pass:
      instantiationsRatio <= INSTANTIATIONS_GROWTH_MAX &&
      checkRatio <= CHECK_GROWTH_MAX,
  };
}

function printCase(
  scenario: string,
  size: BenchmarkSize,
  summary: TypeDiagnostics,
): void {
  console.log(
    [
      scenario,
      `${size} routes`,
      `inst ${Math.round(summary.instantiations).toLocaleString("en-US")}`,
      `mem ${round(summary.memoryMB, 1)} MB`,
      `check ${round(summary.checkTime, 3)} s`,
    ].join(" | "),
  );
}

function printComparisons(
  title: string,
  comparisons: readonly ComparisonSummary[],
): void {
  console.log(`\n${title}\n`);
  console.table(
    comparisons.map((comparison) => ({
      routes: comparison.routes,
      "inst ratio": round(comparison.instantiationsRatio, 4),
      "memory ratio": round(comparison.memoryRatio, 4),
      "check ratio": round(comparison.checkRatio, 4),
      "check gate":
        comparison.routes === 5000
          ? `<= ${CHECK_5000_MAX}x`
          : `<= ${CHECK_MAX}x`,
      verdict: comparison.pass ? "PASS" : "FAIL",
    })),
  );
}

function printGrowth(
  title: string,
  value: {
    readonly instantiationsRatio: number;
    readonly checkRatio: number;
    readonly pass: boolean;
  },
): void {
  console.log(`\n${title}\n`);
  console.table([
    {
      "inst growth": round(value.instantiationsRatio, 4),
      "inst gate": `<= ${INSTANTIATIONS_GROWTH_MAX}x`,
      "check growth": round(value.checkRatio, 4),
      "check gate": `<= ${CHECK_GROWTH_MAX}x`,
      verdict: value.pass ? "PASS" : "FAIL",
    },
  ]);
}

function readRootArgument(name: string): string {
  const prefix = `${name}=`;
  const value = Bun.argv.find((argument) => argument.startsWith(prefix));

  if (value === undefined) {
    throw new Error(`Missing required argument: ${name}=<path>`);
  }

  return resolve(HARNESS_ROOT, value.slice(prefix.length));
}

function assertGitHead(root: string, expected: string, label: string): void {
  const result = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(`Unable to read ${label} git HEAD`);
  }

  const actual = result.stdout.trim();
  if (actual !== expected) {
    throw new Error(`${label} SHA mismatch: expected ${expected}, got ${actual}`);
  }
}

function assertTypeScriptVersion(): void {
  const result = spawnSync(process.execPath, [TSC, "--version"], {
    cwd: HARNESS_ROOT,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error("Unable to read TypeScript version");
  }

  const actual = result.stdout.trim().replace(/^Version\s+/, "");
  if (actual !== TYPESCRIPT_VERSION) {
    throw new Error(
      `TypeScript version mismatch: expected ${TYPESCRIPT_VERSION}, got ${actual}`,
    );
  }
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot compute median of empty TypeScript values");
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
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

  throw new Error(`Unsupported TypeScript memory value: ${value}`);
}

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}
