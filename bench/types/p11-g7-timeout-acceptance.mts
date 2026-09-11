import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import "./generate.mts";

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
type Scenario = "routes" | "p11-timeout-route";

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
  readonly scenario: Scenario;
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
const ROOT = resolve(HERE, "../..");
const TSC = resolve(ROOT, "node_modules/typescript/lib/tsc.js");

for (const size of SIZES) {
  generateTimeoutRoutes(size);
}

compile("routes", 100);

console.log("\nP11-G7 route-timeout TypeScript scalability acceptance\n");
console.log(`Runtime:       bun ${Bun.version}`);
console.log(`CPU:           ${cpus()[0]?.model ?? "unknown"}`);
console.log(`Runs/case:     ${RUNS}`);
console.log(`Sizes:         ${SIZES.join(", ")}`);
console.log("Control:       routes");
console.log("Candidate:     p11-timeout-route");
console.log(`Inst gate:     <= ${INSTANTIATIONS_MAX}x per size`);
console.log(`Memory gate:   <= ${MEMORY_MAX}x per size`);
console.log(`Check gate:    <= ${CHECK_MAX}x per size`);
console.log(`5k check gate: <= ${CHECK_5000_MAX}x`);
console.log(
  `Growth gates:  inst <= ${INSTANTIATIONS_GROWTH_MAX}x; check <= ${CHECK_GROWTH_MAX}x (1000→5000)`,
);

const cases: CaseSummary[] = [];

for (const size of SIZES) {
  for (const scenario of ["routes", "p11-timeout-route"] as const) {
    const samples: TypeDiagnostics[] = [];

    for (let run = 0; run < RUNS; run++) {
      samples.push(compile(scenario, size));
    }

    const summary = medianDiagnostics(samples);
    cases.push({ scenario, routes: size, ...summary });

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
}

const comparisons = SIZES.map(compare);

console.log("\nP11-G7 relative TypeScript summary\n");
console.table(
  comparisons.map((comparison) => ({
    routes: comparison.routes,
    "inst ratio": round(comparison.instantiationsRatio, 4),
    "memory ratio": round(comparison.memoryRatio, 4),
    "check ratio": round(comparison.checkRatio, 4),
    "check gate":
      comparison.routes === 5000 ? `<= ${CHECK_5000_MAX}x` : `<= ${CHECK_MAX}x`,
    verdict: comparison.pass ? "PASS" : "FAIL",
  })),
);

const at1000 = findCase("p11-timeout-route", 1000);
const at5000 = findCase("p11-timeout-route", 5000);
const instantiationsGrowth = at5000.instantiations / at1000.instantiations;
const checkGrowth = at5000.checkTime / at1000.checkTime;
const growthPass =
  instantiationsGrowth <= INSTANTIATIONS_GROWTH_MAX &&
  checkGrowth <= CHECK_GROWTH_MAX;

console.log("\nP11-G7 1000→5000 growth summary\n");
console.table([
  {
    scenario: "p11-timeout-route",
    "inst growth": round(instantiationsGrowth, 4),
    "inst gate": `<= ${INSTANTIATIONS_GROWTH_MAX}x`,
    "check growth": round(checkGrowth, 4),
    "check gate": `<= ${CHECK_GROWTH_MAX}x`,
    verdict: growthPass ? "PASS" : "FAIL",
  },
]);

const failed = comparisons.filter((comparison) => !comparison.pass);

if (failed.length !== 0 || !growthPass) {
  throw new Error(
    [
      "P11-G7 TypeScript scalability gate failed",
      ...failed.map((row) => `p11-timeout-route/${row.routes}`),
      ...(growthPass ? [] : ["p11-timeout-route/growth"]),
    ].join(": "),
  );
}

console.log("\nStructural root-type assertion compiled successfully.");
console.log("Verdict: PASS");

function generateTimeoutRoutes(size: BenchmarkSize): void {
  const directory = caseDir("p11-timeout-route", size);
  const imports: string[] = [];

  writeFileSync(
    new URL("app.ts", directory),
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
        `app.get('/bench/${index}/:id', { timeout: 1000 }, ` +
          `({ params }) => ({ id: params.id, route: ${index} }))`,
      );
    }

    writeFileSync(new URL(name, directory), `${lines.join("\n")}\n`);
  }

  writeFileSync(
    new URL("index.ts", directory),
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

function caseDir(name: string, size: BenchmarkSize): URL {
  const directory = new URL(`./generated/${name}-${size}/`, import.meta.url);
  mkdirSync(directory, { recursive: true });

  writeFileSync(
    new URL("tsconfig.json", directory),
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

function compile(scenario: Scenario, size: BenchmarkSize): TypeDiagnostics {
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
    throw new Error(`TypeScript compile failed: ${scenario}/${size}`);
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

function compare(size: BenchmarkSize): ComparisonSummary {
  const candidate = findCase("p11-timeout-route", size);
  const control = findCase("routes", size);
  const instantiationsRatio = candidate.instantiations / control.instantiations;
  const memoryRatio = candidate.memoryMB / control.memoryMB;
  const checkRatio = candidate.checkTime / control.checkTime;
  const checkLimit = size === 5000 ? CHECK_5000_MAX : CHECK_MAX;

  return {
    routes: size,
    instantiationsRatio,
    memoryRatio,
    checkRatio,
    pass:
      instantiationsRatio <= INSTANTIATIONS_MAX &&
      memoryRatio <= MEMORY_MAX &&
      checkRatio <= checkLimit,
  };
}

function findCase(scenario: Scenario, size: BenchmarkSize): CaseSummary {
  const result = cases.find(
    (row) => row.scenario === scenario && row.routes === size,
  );
  if (result === undefined) {
    throw new Error(`Missing TypeScript case: ${scenario}/${size}`);
  }
  return result;
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
