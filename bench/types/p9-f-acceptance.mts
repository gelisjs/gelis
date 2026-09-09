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
type P9Scenario = "p9-method-mix" | "p9-rich";
type ControlScenario = "routes" | "rich-contract";
type Scenario = P9Scenario | ControlScenario;

interface RouteChunk {
  readonly start: number;
  readonly end: number;
}

interface GeneratedModule {
  readonly moduleName: string;
  readonly fileName: string;
}

interface RouteLocation {
  readonly moduleName: string;
  readonly routeName: string;
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
  readonly scenario: P9Scenario;
  readonly control: ControlScenario;
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
  generateP9MethodMix(size);
  generateP9Rich(size);
}

// Warm compiler/filesystem startup. Discard this measurement.
compile("routes", 100);

console.log("\nP9-F-C TypeScript scalability acceptance\n");
console.log(`Runtime:       bun ${Bun.version}`);
console.log(`CPU:           ${cpus()[0]?.model ?? "unknown"}`);
console.log(`Runs/case:     ${RUNS}`);
console.log(`Sizes:         ${SIZES.join(", ")}`);
console.log("Controls:      routes, rich-contract");
console.log("P9 scenarios:  p9-method-mix, p9-rich");
console.log(`Inst gate:     <= ${INSTANTIATIONS_MAX}x per size`);
console.log(`Memory gate:   <= ${MEMORY_MAX}x per size`);
console.log(`Check gate:    <= ${CHECK_MAX}x per size`);
console.log(`5k check gate: <= ${CHECK_5000_MAX}x`);
console.log(
  `Growth gates:  inst <= ${INSTANTIATIONS_GROWTH_MAX}x; check <= ${CHECK_GROWTH_MAX}x (1000→5000)`,
);

const cases: CaseSummary[] = [];

for (const size of SIZES) {
  for (const scenario of [
    "routes",
    "p9-method-mix",
    "rich-contract",
    "p9-rich",
  ] as const) {
    const samples: TypeDiagnostics[] = [];

    for (let run = 0; run < RUNS; run++) {
      samples.push(compile(scenario, size));
    }

    const summary = medianDiagnostics(samples);

    cases.push({
      scenario,
      routes: size,
      ...summary,
    });

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

const comparisons: ComparisonSummary[] = [];

for (const size of SIZES) {
  comparisons.push(compare("p9-method-mix", "routes", size));
  comparisons.push(compare("p9-rich", "rich-contract", size));
}

console.log("\nP9-F-C relative TypeScript summary\n");

console.table(
  comparisons.map((comparison) => ({
    scenario: comparison.scenario,
    control: comparison.control,
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

const growth = (["p9-method-mix", "p9-rich"] as const).map((scenario) => {
  const at1000 = findCase(scenario, 1000);
  const at5000 = findCase(scenario, 5000);

  const instantiationsRatio =
    at5000.instantiations / at1000.instantiations;
  const checkRatio = at5000.checkTime / at1000.checkTime;
  const pass =
    instantiationsRatio <= INSTANTIATIONS_GROWTH_MAX &&
    checkRatio <= CHECK_GROWTH_MAX;

  return {
    scenario,
    instantiationsRatio,
    checkRatio,
    pass,
  };
});

console.log("\nP9-F-C 1000→5000 growth summary\n");

console.table(
  growth.map((row) => ({
    scenario: row.scenario,
    "inst growth": round(row.instantiationsRatio, 4),
    "inst gate": `<= ${INSTANTIATIONS_GROWTH_MAX}x`,
    "check growth": round(row.checkRatio, 4),
    "check gate": `<= ${CHECK_GROWTH_MAX}x`,
    verdict: row.pass ? "PASS" : "FAIL",
  })),
);

const failedComparisons = comparisons.filter((row) => !row.pass);
const failedGrowth = growth.filter((row) => !row.pass);

if (failedComparisons.length !== 0 || failedGrowth.length !== 0) {
  throw new Error(
    [
      "P9-F-C TypeScript scalability gate failed",
      ...failedComparisons.map((row) => `${row.scenario}/${row.routes}`),
      ...failedGrowth.map((row) => `${row.scenario}/growth`),
    ].join(": "),
  );
}

console.log("\nStructural root-type assertions compiled successfully.");
console.log("Verdict: PASS");

function generateP9MethodMix(size: BenchmarkSize): void {
  const directory = caseDir("p9-method-mix", size);
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
      const path = `/bench/${index}/:id`;
      const handler =
        `({ params }) => ` + `({ id: params.id, route: ${index} })`;

      switch (index % 7) {
        case 0:
          lines.push(`app.get('${path}', ${handler})`);
          break;
        case 1:
          lines.push(`app.post('${path}', ${handler})`);
          break;
        case 2:
          lines.push(`app.query('${path}', ${handler})`);
          break;
        case 3:
          lines.push(`app.head('${path}', ${handler})`);
          break;
        case 4:
          lines.push(`app.options('${path}', ${handler})`);
          break;
        case 5:
          lines.push(`app.route('PURGE', '${path}', ${handler})`);
          break;
        default:
          lines.push(`app.all('${path}', ${handler})`);
          break;
      }
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

function generateP9Rich(size: BenchmarkSize): void {
  const directory = caseDir("p9-rich", size);

  writeFileSync(
    new URL("schemas.ts", directory),
    [
      "import type { StandardSchemaV1 } from '../../../../src'",
      "",
      "export declare const QuerySchema:",
      "  StandardSchemaV1<",
      "    { page: string; mode?: 'ok' | 'conflict' },",
      "    { page: number; mode: 'ok' | 'conflict' }",
      "  >",
      "",
      "export declare const BodySchema:",
      "  StandardSchemaV1<",
      "    { name: string },",
      "    { name: string; normalized: true }",
      "  >",
      "",
      "export declare const SuccessSchema:",
      "  StandardSchemaV1<{ id: string; name: string; page: number }>",
      "",
      "export declare const ConflictSchema:",
      "  StandardSchemaV1<{ code: 'CONFLICT' }>",
      "",
      "export declare const InvalidSchema:",
      "  StandardSchemaV1<{ code: 'INVALID' }>",
      "",
    ].join("\n"),
  );

  const modules: GeneratedModule[] = [];
  const routeLocations: RouteLocation[] = [];

  for (const [moduleIndex, { start, end }] of chunks(size).entries()) {
    const moduleName = `module${moduleIndex}`;
    const fileName = `module-${String(moduleIndex).padStart(3, "0")}.ts`;

    modules.push({
      moduleName,
      fileName,
    });

    const lines = [
      "import { defineModule } from '../../../../src'",
      "import {",
      "  QuerySchema,",
      "  BodySchema,",
      "  SuccessSchema,",
      "  ConflictSchema,",
      "  InvalidSchema,",
      "} from './schemas'",
      "",
      `export const ${moduleName} = defineModule('/m${moduleIndex}', (route) => ({`,
    ];

    for (let index = start; index < end; index++) {
      const local = index - start;
      const routeName = `r${local}`;
      const method = index % 2 === 0 ? "post" : "query";

      lines.push(
        `  ${routeName}: route.${method}(`,
        `    '/r${local}/:id',`,
        "    {",
        "      query: QuerySchema,",
        "      body: BodySchema,",
        "      bodyParser: 'json',",
        "      bodyContentTypes: ['application/json'],",
        "      responses: {",
        "        200: SuccessSchema,",
        "        409: ConflictSchema,",
        "        422: InvalidSchema,",
        "      },",
        "    },",
        "    ({ params, query, body, reply }) => {",
        "      if (query.mode === 'conflict') {",
        "        return reply.status(409, { code: 'CONFLICT' })",
        "      }",
        "      if (query.page < 0) {",
        "        return reply.status(422, { code: 'INVALID' })",
        "      }",
        "      return reply.status(200, {",
        "        id: params.id,",
        "        name: body.name,",
        "        page: query.page,",
        "      })",
        "    },",
        "  ),",
      );

      routeLocations.push({
        moduleName,
        routeName,
      });
    }

    lines.push("}))");
    writeFileSync(new URL(fileName, directory), `${lines.join("\n")}\n`);
  }

  const index = [
    "import { Gelis, defineContract } from '../../../../src'",
    "import type { ApiContractOf } from '../../../../src'",
  ];

  for (const { moduleName, fileName } of modules) {
    index.push(
      `import { ${moduleName} } from './${fileName.replace(/\.ts$/, "")}'`,
    );
  }

  index.push(
    "",
    "const app = new Gelis()",
    "type Equal<A, B> =",
    "  (<T>() => T extends A ? 1 : 2) extends",
    "  (<T>() => T extends B ? 1 : 2) ? true : false",
    "type Expect<T extends true> = T",
    "type RootStable = Expect<Equal<typeof app, Gelis>>",
    "void (null as unknown as RootStable)",
    "",
    "const api = defineContract({",
  );

  for (const { moduleName } of modules) {
    index.push(`  ${moduleName},`);
  }

  index.push("})", "", "type Api = ApiContractOf<typeof api>", "");

  for (const { moduleName, routeName } of routeLocations) {
    const probe = `Probe_${moduleName}_${routeName}`;

    index.push(
      `type ${probe} = [`,
      `  Api['${moduleName}']['${routeName}']['path'],`,
      `  Api['${moduleName}']['${routeName}']['request']['params'],`,
      `  Api['${moduleName}']['${routeName}']['request']['query'],`,
      `  Api['${moduleName}']['${routeName}']['request']['body'],`,
      `  Api['${moduleName}']['${routeName}']['responses'],`,
      `]`,
      `void (null as unknown as ${probe})`,
      "",
    );
  }

  writeFileSync(new URL("index.ts", directory), `${index.join("\n")}\n`);
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

    if (!match) {
      continue;
    }

    const key = match[1];
    const raw = match[2];

    if (key === undefined || raw === undefined) {
      continue;
    }

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

  return {
    instantiations,
    memoryMB,
    checkTime,
    totalTime,
  };
}

function medianDiagnostics(samples: readonly TypeDiagnostics[]): TypeDiagnostics {
  return {
    instantiations: median(samples.map((sample) => sample.instantiations)),
    memoryMB: median(samples.map((sample) => sample.memoryMB)),
    checkTime: median(samples.map((sample) => sample.checkTime)),
    totalTime: median(samples.map((sample) => sample.totalTime)),
  };
}

function compare(
  scenario: P9Scenario,
  control: ControlScenario,
  size: BenchmarkSize,
): ComparisonSummary {
  const candidate = findCase(scenario, size);
  const baseline = findCase(control, size);

  const instantiationsRatio =
    candidate.instantiations / baseline.instantiations;
  const memoryRatio = candidate.memoryMB / baseline.memoryMB;
  const checkRatio = candidate.checkTime / baseline.checkTime;
  const checkLimit = size === 5000 ? CHECK_5000_MAX : CHECK_MAX;

  return {
    scenario,
    control,
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

  return Number(trimmed) / 1024 / 1024;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
