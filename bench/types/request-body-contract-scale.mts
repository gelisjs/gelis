import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";

import { cpus, totalmem } from "node:os";

import { relative, resolve } from "node:path";

import { execFileSync, spawnSync } from "node:child_process";

const CONTROL_SHA = "ede6b4fa2a934f6584d89dfa8598a85ea16a6167";

const DEFAULT_SIZES = [100, 500, 1_000, 5_000] as const;

const DEFAULT_RUNS = 3;

const SHORTHAND_GATES = {
  instantiations: 1.1,
  memory: 1.2,
  check: 1.25,
  normalizedInstantiationGrowth: 1.1,
} as const;

const EXPLICIT_GATES = {
  instantiations: 1.15,
  memory: 1.2,
  check: 1.3,
  normalizedInstantiationGrowth: 1.1,
} as const;

type BenchmarkSize = (typeof DEFAULT_SIZES)[number];

type CaseName =
  | "control-shorthand"
  | "candidate-shorthand"
  | "candidate-explicit";

interface TypeDiagnostics {
  readonly instantiations: number;
  readonly memoryMB: number;
  readonly checkTime: number;
  readonly totalTime: number;
}

interface Row extends TypeDiagnostics {
  readonly case: CaseName;
  readonly routes: BenchmarkSize;
  readonly runs: number;
  readonly samples: readonly TypeDiagnostics[];
}

const args = process.argv.slice(2);

const controlRoot = readRoot(args, "--control-root=");

const candidateRoot = readRoot(args, "--candidate-root=", ".");

const runs = readPositiveInteger(args, "--runs=", DEFAULT_RUNS);

const sizes = readSizes(args);

const controlHead = gitHead(controlRoot);

const candidateHead = gitHead(candidateRoot);

if (controlHead !== CONTROL_SHA) {
  throw new Error(`Control is at ${controlHead}; expected ${CONTROL_SHA}`);
}

const tsc = resolve(
  candidateRoot,
  "node_modules",
  "typescript",
  "lib",
  "tsc.js",
);

const tempRoot = mkdtempSync(resolve(candidateRoot, ".gelis-p9e2-types-"));

try {
  console.log("\nP9-E2 request-body type cost benchmark\n");

  console.log(`Runtime:        bun ${Bun.version}`);

  console.log(`CPU:            ${cpus()[0]?.model ?? "unknown"}`);

  console.log(`Logical CPU:    ${cpus().length}`);

  console.log(`Memory:         ${Math.round(totalmem() / 1024 / 1024)} MB`);

  console.log(`Control SHA:    ${controlHead}`);

  console.log(`Candidate HEAD: ${candidateHead}`);

  console.log(
    `Candidate dirty:${gitStatus(candidateRoot) === "" ? " no" : " yes"}`,
  );

  console.log(`Runs/case:      ${runs}`);

  console.log(`Sizes:          ${sizes.join(", ")}\n`);

  /*
   * Warm compiler/filesystem once.
   */
  compileCase("control-shorthand", controlRoot, firstSize(sizes));

  const rows: Row[] = [];

  for (const size of sizes) {
    for (const benchmarkCase of [
      "control-shorthand",
      "candidate-shorthand",
      "candidate-explicit",
    ] as const) {
      const root =
        benchmarkCase === "control-shorthand" ? controlRoot : candidateRoot;

      const samples: TypeDiagnostics[] = [];

      for (let run = 0; run < runs; run++) {
        samples.push(compileCase(benchmarkCase, root, size));
      }

      rows.push({
        case: benchmarkCase,
        routes: size,
        runs,
        samples,
        ...medianDiagnostics(samples),
      });
    }
  }

  const table = rows.map((row) => {
    const control = findRow(rows, "control-shorthand", row.routes);

    const candidateShorthand = findRow(rows, "candidate-shorthand", row.routes);

    return {
      case: row.case,
      routes: row.routes,
      instantiations: Math.round(row.instantiations),
      "memory MB": round(row.memoryMB, 1),
      "check s": round(row.checkTime, 3),
      "total s": round(row.totalTime, 3),
      "inst/control": formatRatio(row.instantiations / control.instantiations),
      "mem/control": formatRatio(row.memoryMB / control.memoryMB),
      "check/control": formatRatio(row.checkTime / control.checkTime),
      "inst/candidate-short":
        row.case === "candidate-explicit"
          ? formatRatio(row.instantiations / candidateShorthand.instantiations)
          : "-",
      "check/candidate-short":
        row.case === "candidate-explicit"
          ? formatRatio(row.checkTime / candidateShorthand.checkTime)
          : "-",
    };
  });

  console.table(table);

  console.log("\nKey comparisons at 5k routes\n");

  const maxSize = sizes[sizes.length - 1]!;

  const control = findRow(rows, "control-shorthand", maxSize);

  const candidateShort = findRow(rows, "candidate-shorthand", maxSize);

  const candidateExplicit = findRow(rows, "candidate-explicit", maxSize);

  const minSize = sizes[0]!;

  const controlSmall = findRow(rows, "control-shorthand", minSize);

  const candidateShortSmall = findRow(rows, "candidate-shorthand", minSize);

  const candidateExplicitSmall = findRow(rows, "candidate-explicit", minSize);

  const shorthandInstantiationRatio =
    candidateShort.instantiations / control.instantiations;

  const shorthandMemoryRatio = candidateShort.memoryMB / control.memoryMB;

  const shorthandCheckRatio = candidateShort.checkTime / control.checkTime;

  const explicitInstantiationRatio =
    candidateExplicit.instantiations / candidateShort.instantiations;

  const explicitMemoryRatio =
    candidateExplicit.memoryMB / candidateShort.memoryMB;

  const explicitCheckRatio =
    candidateExplicit.checkTime / candidateShort.checkTime;

  const shorthandGrowthRatio =
    candidateShort.instantiations /
    candidateShortSmall.instantiations /
    (control.instantiations / controlSmall.instantiations);

  const explicitGrowthRatio =
    candidateExplicit.instantiations /
    candidateExplicitSmall.instantiations /
    (candidateShort.instantiations / candidateShortSmall.instantiations);

  const shorthandPass =
    shorthandInstantiationRatio <= SHORTHAND_GATES.instantiations &&
    shorthandMemoryRatio <= SHORTHAND_GATES.memory &&
    shorthandCheckRatio <= SHORTHAND_GATES.check &&
    shorthandGrowthRatio <= SHORTHAND_GATES.normalizedInstantiationGrowth;

  const explicitPass =
    explicitInstantiationRatio <= EXPLICIT_GATES.instantiations &&
    explicitMemoryRatio <= EXPLICIT_GATES.memory &&
    explicitCheckRatio <= EXPLICIT_GATES.check &&
    explicitGrowthRatio <= EXPLICIT_GATES.normalizedInstantiationGrowth;

  console.table([
    {
      comparison: "candidate shorthand / control shorthand",
      "instantiations x": round(shorthandInstantiationRatio, 3),
      "memory x": round(shorthandMemoryRatio, 3),
      "check x": round(shorthandCheckRatio, 3),
      "normalized growth x": round(shorthandGrowthRatio, 3),
      verdict: shorthandPass ? "PASS" : "FAIL",
    },
    {
      comparison: "candidate explicit / candidate shorthand",
      "instantiations x": round(explicitInstantiationRatio, 3),
      "memory x": round(explicitMemoryRatio, 3),
      "check x": round(explicitCheckRatio, 3),
      "normalized growth x": round(explicitGrowthRatio, 3),
      verdict: explicitPass ? "PASS" : "FAIL",
    },
    {
      comparison: "candidate explicit / control shorthand",
      "instantiations x": round(
        candidateExplicit.instantiations / control.instantiations,
        3,
      ),
      "memory x": round(candidateExplicit.memoryMB / control.memoryMB, 3),
      "check x": round(candidateExplicit.checkTime / control.checkTime, 3),
      "normalized growth x": "-",
      verdict: "diagnostic",
    },
  ]);

  console.log("\nFrozen gates");

  console.table([
    {
      comparison: "candidate shorthand / control shorthand",
      instantiations: `<= ${SHORTHAND_GATES.instantiations}x`,
      memory: `<= ${SHORTHAND_GATES.memory}x`,
      check: `<= ${SHORTHAND_GATES.check}x`,
      "normalized growth": `<= ${SHORTHAND_GATES.normalizedInstantiationGrowth}x`,
    },
    {
      comparison: "candidate explicit / candidate shorthand",
      instantiations: `<= ${EXPLICIT_GATES.instantiations}x`,
      memory: `<= ${EXPLICIT_GATES.memory}x`,
      check: `<= ${EXPLICIT_GATES.check}x`,
      "normalized growth": `<= ${EXPLICIT_GATES.normalizedInstantiationGrowth}x`,
    },
  ]);

  if (!shorthandPass || !explicitPass) {
    throw new Error("P9-E2 request-body type cost gate failed");
  }

  console.log("\nVerdict: PASS");

  function compileCase(
    benchmarkCase: CaseName,
    frameworkRoot: string,
    size: BenchmarkSize,
  ): TypeDiagnostics {
    const caseDirectory = resolve(tempRoot, benchmarkCase, String(size));

    const sourcePath = resolve(caseDirectory, "case.ts");

    const configPath = resolve(caseDirectory, "tsconfig.json");

    mkdirSync(caseDirectory, {
      recursive: true,
    });

    const frameworkImport = relativeImport(
      caseDirectory,
      resolve(frameworkRoot, "src", "index.ts"),
    );

    writeFileSync(
      sourcePath,
      generateSource(benchmarkCase, frameworkImport, size),
      "utf8",
    );

    writeFileSync(
      configPath,
      JSON.stringify(
        {
          compilerOptions: {
            target: "ESNext",
            module: "ESNext",
            moduleResolution: "Bundler",
            strict: true,
            skipLibCheck: true,
            types: [],
            noEmit: true,
          },
          files: ["./case.ts"],
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = spawnSync(
      process.execPath,
      [
        tsc,
        "--project",
        configPath,
        "--noEmit",
        "--pretty",
        "false",
        "--extendedDiagnostics",
      ],
      {
        cwd: candidateRoot,
        encoding: "utf8",
        env: process.env,
      },
    );

    if (result.status !== 0) {
      process.stderr.write(result.stdout ?? "");

      process.stderr.write(result.stderr ?? "");

      throw new Error(`Type benchmark failed for ${benchmarkCase} ${size}`);
    }

    return parseDiagnostics(result.stdout);
  }
} finally {
  rmSync(tempRoot, {
    recursive: true,
    force: true,
  });
}

function generateSource(
  benchmarkCase: CaseName,
  frameworkImport: string,
  routes: number,
): string {
  const lines: string[] = [
    `import { Gelis } from ${JSON.stringify(frameworkImport)};`,
    `import type { StandardSchemaV1 } from ${JSON.stringify(frameworkImport)};`,
    "",
    "declare const Body: StandardSchemaV1<",
    "  { value: string },",
    "  { value: string; normalized: true }",
    ">;",
    "",
    "const app = new Gelis();",
    "",
  ];

  for (let index = 0; index < routes; index++) {
    if (benchmarkCase === "candidate-explicit") {
      lines.push(
        `const route${index} = app.post("/r/${index}", { body: Body, bodyParser: "json" }, ({ body }) => body.value);`,
      );
    } else {
      lines.push(
        `const route${index} = app.post("/r/${index}", { body: Body }, ({ body }) => body.value);`,
      );
    }
  }

  lines.push("");

  /*
   * Retain every inferred RouteRef without constructing
   * one giant array/union at 5k routes.
   */
  for (let index = 0; index < routes; index++) {
    lines.push(`void route${index};`);
  }

  lines.push("");

  return lines.join("\n");
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

    const value = match[2];

    if (key === undefined || value === undefined) {
      continue;
    }

    switch (key) {
      case "Instantiations":
        instantiations = parseNumber(value);
        break;

      case "Memory used":
        memoryMB = parseMemoryMB(value);
        break;

      case "Check time":
        checkTime = parseSeconds(value);
        break;

      case "Total time":
        totalTime = parseSeconds(value);
        break;
    }
  }

  if (
    instantiations === undefined ||
    memoryMB === undefined ||
    checkTime === undefined ||
    totalTime === undefined
  ) {
    throw new Error("Could not parse TypeScript extended diagnostics");
  }

  return {
    instantiations,
    memoryMB,
    checkTime,
    totalTime,
  };
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

function findRow(
  rows: readonly Row[],
  benchmarkCase: CaseName,
  routes: BenchmarkSize,
): Row {
  const row = rows.find(
    (candidate) =>
      candidate.case === benchmarkCase && candidate.routes === routes,
  );

  if (row === undefined) {
    throw new Error(`Missing row ${benchmarkCase} ${routes}`);
  }

  return row;
}

function readRoot(
  values: readonly string[],
  prefix: string,
  fallback?: string,
): string {
  const argument = values.find((value) => value.startsWith(prefix));

  const value = argument?.slice(prefix.length) ?? fallback;

  if (!value) {
    throw new Error(`Expected ${prefix}<path>`);
  }

  return resolve(value);
}

function readPositiveInteger(
  values: readonly string[],
  prefix: string,
  fallback: number,
): number {
  const argument = values.find((value) => value.startsWith(prefix));

  if (!argument) {
    return fallback;
  }

  const value = Number.parseInt(argument.slice(prefix.length), 10);

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${prefix} must be a positive integer`);
  }

  return value;
}

function readSizes(values: readonly string[]): BenchmarkSize[] {
  const argument = values.find((value) => value.startsWith("--sizes="));

  if (!argument) {
    return [...DEFAULT_SIZES];
  }

  const parsed = argument
    .slice("--sizes=".length)
    .split(",")
    .map((value) => Number.parseInt(value, 10));

  for (const value of parsed) {
    if (!DEFAULT_SIZES.includes(value as BenchmarkSize)) {
      throw new Error(
        `Unsupported size ${value}; expected one of ${DEFAULT_SIZES.join(", ")}`,
      );
    }
  }

  return parsed as BenchmarkSize[];
}

function firstSize(values: readonly BenchmarkSize[]): BenchmarkSize {
  const value = values[0];

  if (value === undefined) {
    throw new Error("At least one size is required");
  }

  return value;
}

function gitHead(root: string): string {
  return execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
}

function gitStatus(root: string): string {
  return execFileSync("git", ["-C", root, "status", "--porcelain"], {
    encoding: "utf8",
  }).trim();
}

function relativeImport(fromDirectory: string, targetFile: string): string {
  let path = relative(fromDirectory, targetFile).replaceAll("\\", "/");

  if (path.endsWith(".ts")) {
    path = path.slice(0, -3);
  }

  if (!path.startsWith(".")) {
    path = `./${path}`;
  }

  return path;
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

function formatRatio(value: number): string {
  return `${round(value, 3)}x`;
}
