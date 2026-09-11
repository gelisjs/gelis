import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const EXPECTED_BUN = "1.4.2";
const PRODUCTION_SOURCE = "1dd5f94cf0e9ad884ca44e537ee287587cd8baab";
const ROUTES = 5_000;
const SAMPLES = 11;

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, "hotpath-worker.mts");
const REPOSITORY_ROOT = resolve(HERE, "../../..");

type Scenario =
  | "static-raw"
  | "dynamic-raw"
  | "static-json"
  | "dynamic-json";

type Stage =
  | "url-router"
  | "url-router-handler"
  | "url-router-handler-normalize"
  | "app-fetch";

type PrimitiveCell =
  | "pathname"
  | "router-static"
  | "router-dynamic"
  | "handler-static-json"
  | "handler-dynamic-json"
  | "json-stringify-static"
  | "json-stringify-dynamic"
  | "response-json-static"
  | "response-json-dynamic"
  | "response-preserialized-static"
  | "response-preserialized-dynamic"
  | "normalize-static-json"
  | "normalize-dynamic-json"
  | "response-raw-static"
  | "response-raw-dynamic"
  | "normalize-existing-response";

type Cell = PrimitiveCell | `${Scenario}::${Stage}`;

interface WorkerResult {
  readonly cell: Cell;
  readonly probeOnly: boolean;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number | null;
  readonly sink: number;
}

interface Summary {
  readonly cell: Cell;
  readonly median: number;
  readonly p25: number;
  readonly p75: number;
  readonly min: number;
  readonly max: number;
}

const PRIMITIVE_CELLS: readonly PrimitiveCell[] = [
  "pathname",
  "router-static",
  "router-dynamic",
  "handler-static-json",
  "handler-dynamic-json",
  "json-stringify-static",
  "json-stringify-dynamic",
  "response-json-static",
  "response-json-dynamic",
  "response-preserialized-static",
  "response-preserialized-dynamic",
  "normalize-static-json",
  "normalize-dynamic-json",
  "response-raw-static",
  "response-raw-dynamic",
  "normalize-existing-response",
];

const SCENARIOS: readonly Scenario[] = [
  "static-raw",
  "dynamic-raw",
  "static-json",
  "dynamic-json",
];

const STAGES: readonly Stage[] = [
  "url-router",
  "url-router-handler",
  "url-router-handler-normalize",
  "app-fetch",
];

const probeOnly = process.argv.includes("--probe-only");
const harnessSha = git(["rev-parse", "HEAD"]);
const cpu = cpus()[0]?.model ?? "unknown";

preflight();

console.log("Competitive Performance v0.1 — CP3-A hot-path decomposition");
console.log(`Bun:         ${Bun.version}`);
console.log(`CPU:         ${cpu}`);
console.log(`Harness SHA: ${harnessSha}`);
console.log(`Gelis src:   ${PRODUCTION_SOURCE}`);
console.log(`Routes:      ${ROUTES.toLocaleString("en-US")}`);
console.log(
  probeOnly
    ? "Mode:        correctness probe only"
    : `Samples:     ${SAMPLES} fresh worker processes/cell`,
);
console.log();

const cells: Cell[] = [
  ...PRIMITIVE_CELLS,
  ...SCENARIOS.flatMap((scenario) =>
    STAGES.map((stage) => `${scenario}::${stage}` as Cell),
  ),
];

if (probeOnly) {
  for (const cell of cells) {
    const result = runWorker(cell, true);
    if (!result.probeOnly || result.cell !== cell) {
      throw new Error(`Invalid probe result for ${cell}`);
    }
    console.log(`PASS ${cell}`);
  }
  console.log();
  console.log(`CP3-A CORRECTNESS PROBE: PASS (${cells.length}/${cells.length})`);
  process.exit(0);
}

const summaries = new Map<Cell, Summary>();

console.log("Isolated production primitives");
console.log("| cell | median ns/op | p25 | p75 | min | max |");
console.log("| --- | ---: | ---: | ---: | ---: | ---: |");

for (const cell of PRIMITIVE_CELLS) {
  const summary = measureCell(cell);
  summaries.set(cell, summary);
  printSummary(summary);
}

console.log();
console.log("Integrated staged plain pipeline");
console.log("| scenario | stage | median ns/op | p25 | p75 | min | max |");
console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: |");

for (const scenario of SCENARIOS) {
  for (const stage of STAGES) {
    const cell = `${scenario}::${stage}` as Cell;
    const summary = measureCell(cell);
    summaries.set(cell, summary);
    console.log(
      `| ${scenario} | ${stage} | ${format(summary.median)} | ${format(summary.p25)} | ${format(summary.p75)} | ${format(summary.min)} | ${format(summary.max)} |`,
    );
  }
}

console.log();
console.log("Derived diagnostics — non-additive, for engineering direction only");
console.log("| diagnostic | value |");
console.log("| --- | ---: |");

printDiagnostic(
  "router dynamic / static",
  ratio("router-dynamic", "router-static"),
  "x",
);
printDiagnostic(
  "normalize static / Response.json static",
  ratio("normalize-static-json", "response-json-static"),
  "x",
);
printDiagnostic(
  "normalize dynamic / Response.json dynamic",
  ratio("normalize-dynamic-json", "response-json-dynamic"),
  "x",
);
printDiagnostic(
  "Response.json static / JSON.stringify static",
  ratio("response-json-static", "json-stringify-static"),
  "x",
);
printDiagnostic(
  "Response.json dynamic / JSON.stringify dynamic",
  ratio("response-json-dynamic", "json-stringify-dynamic"),
  "x",
);
printDiagnostic(
  "Response.json static / pre-serialized Response static",
  ratio("response-json-static", "response-preserialized-static"),
  "x",
);
printDiagnostic(
  "Response.json dynamic / pre-serialized Response dynamic",
  ratio("response-json-dynamic", "response-preserialized-dynamic"),
  "x",
);

for (const scenario of SCENARIOS) {
  const route = median(`${scenario}::url-router` as Cell);
  const handler = median(`${scenario}::url-router-handler` as Cell);
  const normalized = median(
    `${scenario}::url-router-handler-normalize` as Cell,
  );
  const appFetch = median(`${scenario}::app-fetch` as Cell);

  printDiagnostic(`${scenario}: handler - url-router`, handler - route, "ns");
  printDiagnostic(
    `${scenario}: normalize - handler`,
    normalized - handler,
    "ns",
  );
  printDiagnostic(
    `${scenario}: app.fetch - manual normalized`,
    appFetch - normalized,
    "ns",
  );
  printDiagnostic(
    `${scenario}: manual normalized / app.fetch`,
    normalized / appFetch,
    "x",
  );
}

console.log();
console.log("CP3-A LOCAL DECOMPOSITION RUN: COMPLETE");

function measureCell(cell: Cell): Summary {
  const values: number[] = [];
  for (let sample = 0; sample < SAMPLES; sample++) {
    const result = runWorker(cell, false);
    if (result.nsPerOp === null) {
      throw new Error(`Missing timing for ${cell}`);
    }
    values.push(result.nsPerOp);
  }

  values.sort((left, right) => left - right);

  return {
    cell,
    median: quantile(values, 0.5),
    p25: quantile(values, 0.25),
    p75: quantile(values, 0.75),
    min: values[0]!,
    max: values.at(-1)!,
  };
}

function runWorker(cell: Cell, workerProbeOnly: boolean): WorkerResult {
  const result = spawnSync(
    process.execPath,
    [
      WORKER,
      `--cell=${cell}`,
      `--probe-only=${workerProbeOnly ? "true" : "false"}`,
    ],
    {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      env: process.env,
      maxBuffer: 1024 * 1024,
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `Worker failed for ${cell}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }

  const line = result.stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .at(-1);
  if (line === undefined) throw new Error(`Worker emitted no result for ${cell}`);

  const parsed = JSON.parse(line) as WorkerResult;
  if (parsed.cell !== cell) {
    throw new Error(`Worker cell mismatch: expected ${cell}, got ${parsed.cell}`);
  }
  return parsed;
}

function preflight(): void {
  if (Bun.version !== EXPECTED_BUN) {
    throw new Error(`CP3-A requires Bun ${EXPECTED_BUN}, got ${Bun.version}`);
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty !== "") {
    throw new Error(`CP3-A requires a clean worktree:\n${dirty}`);
  }

  const sourceDiff = spawnSync(
    "git",
    [
      "-C",
      REPOSITORY_ROOT,
      "diff",
      "--quiet",
      PRODUCTION_SOURCE,
      "HEAD",
      "--",
      "src",
    ],
    { encoding: "utf8" },
  );
  if (sourceDiff.status !== 0) {
    throw new Error(
      `src/** differs from frozen production source ${PRODUCTION_SOURCE}`,
    );
  }
}

function git(args: readonly string[]): string {
  const result = spawnSync("git", ["-C", REPOSITORY_ROOT, ...args], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function quantile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) throw new Error("Cannot calculate empty quantile");
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  const weight = index - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

function printSummary(summary: Summary): void {
  console.log(
    `| ${summary.cell} | ${format(summary.median)} | ${format(summary.p25)} | ${format(summary.p75)} | ${format(summary.min)} | ${format(summary.max)} |`,
  );
}

function ratio(numerator: Cell, denominator: Cell): number {
  return median(numerator) / median(denominator);
}

function median(cell: Cell): number {
  const value = summaries.get(cell);
  if (value === undefined) throw new Error(`Missing summary for ${cell}`);
  return value.median;
}

function printDiagnostic(label: string, value: number, unit: "x" | "ns"): void {
  const rendered =
    unit === "x" ? `${value.toFixed(4)}x` : `${value.toFixed(1)} ns`;
  console.log(`| ${label} | ${rendered} |`);
}

function format(value: number): string {
  return value.toFixed(1);
}
