import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { cpus, totalmem } from "node:os";

import { resolve } from "node:path";

import { spawnSync } from "node:child_process";

import { fileURLToPath } from "node:url";

import "./generate.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));

const ROOT = resolve(HERE, "../..");

const TSC = resolve(ROOT, "node_modules/typescript/lib/tsc.js");

const TYPESCRIPT_PACKAGE = resolve(
  ROOT,
  "node_modules/typescript/package.json",
);

const RESULTS_DIR = resolve(HERE, "results");

const DEFAULT_SIZES = [100, 500, 1000, 5000];

const SCENARIOS = ["baseline", "routes", "contract", "rich-contract", "client"];

const SIZES = readSizesArgument(DEFAULT_SIZES);

const RUNS = readRunsArgument(3);

mkdirSync(RESULTS_DIR, {
  recursive: true,
});

// Warm filesystem/compiler startup.
// This result is intentionally discarded.
compile("baseline", SIZES[0]);

const rows = [];

for (const size of SIZES) {
  for (const scenario of SCENARIOS) {
    const samples = [];

    for (let run = 0; run < RUNS; run++) {
      samples.push(compile(scenario, size));
    }

    rows.push({
      scenario,
      routes: size,
      runs: RUNS,

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

  row.checkVsBaseline = baseline?.checkTime
    ? row.checkTime / baseline.checkTime
    : null;
}

const metadata = {
  generatedAt: new Date().toISOString(),

  platform: process.platform,

  arch: process.arch,

  runtime: globalThis.Bun
    ? `bun ${globalThis.Bun.version}`
    : `node ${process.version}`,

  typescript: JSON.parse(readFileSync(TYPESCRIPT_PACKAGE, "utf8")).version,

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

function compile(scenario, size) {
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

function parseDiagnostics(output) {
  const metrics = {};

  for (const line of output.split(/\r?\n/)) {
    const match = /^([^:]+):\s+(.+)$/.exec(line.trim());

    if (!match) {
      continue;
    }

    const [, key, raw] = match;

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

  for (const key of ["instantiations", "memoryMB", "checkTime", "totalTime"]) {
    if (metrics[key] === undefined) {
      throw new Error(`Could not parse ` + `TypeScript metric: ${key}`);
    }
  }

  return metrics;
}

function medianDiagnostics(samples) {
  const keys = new Set(samples.flatMap((sample) => Object.keys(sample)));

  const result = {};

  for (const key of keys) {
    const values = samples
      .map((sample) => sample[key])
      .filter((value) => typeof value === "number");

    if (values.length > 0) {
      result[key] = median(values);
    }
  }

  return result;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function parseNumber(value) {
  return Number(value.replaceAll(",", "").trim());
}

function parseSeconds(value) {
  return Number(value.replace(/s$/, "").trim());
}

function parseMemoryMB(value) {
  const trimmed = value.trim();

  if (trimmed.endsWith("K")) {
    return Number(trimmed.slice(0, -1)) / 1024;
  }

  if (trimmed.endsWith("M")) {
    return Number(trimmed.slice(0, -1));
  }

  return Number(trimmed) / 1024 / 1024;
}

function readRunsArgument(fallback) {
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

function readSizesArgument(fallback) {
  const argument = process.argv.find((value) => value.startsWith("--sizes="));

  if (!argument) {
    return fallback;
  }

  const values = argument
    .slice("--sizes=".length)
    .split(",")
    .map((value) => Number.parseInt(value, 10));

  for (const value of values) {
    if (!fallback.includes(value)) {
      throw new Error(
        `Unsupported benchmark size: ${value}. ` +
          `Use one of: ${fallback.join(", ")}`,
      );
    }
  }

  return values;
}

function printMetadata(metadata) {
  console.log("\nGelis type-system benchmark");

  console.log(`Runtime:     ${metadata.runtime}`);

  console.log(`TypeScript:  ${metadata.typescript}`);

  console.log(`CPU:         ${metadata.cpu}`);

  console.log(`Logical CPU: ${metadata.logicalCpus}`);

  console.log(`Memory:      ${metadata.totalMemoryMB} MB`);

  console.log(`Runs/case:   ${metadata.runsPerCase}\n`);
}

function printTable(rows) {
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
    })),
  );

  console.log(
    "\nRaw results: " + "bench/types/results/latest.json " + "and latest.csv",
  );
}

function round(value, digits) {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function toCsv(rows) {
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
  ];

  const lines = [columns.join(",")];

  for (const row of rows) {
    lines.push(columns.map((column) => row[column] ?? "").join(","));
  }

  return `${lines.join("\n")}\n`;
}
