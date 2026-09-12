import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const EXPECTED_BUN = "1.4.2";
const EXPECTED_BUN_REVISION = "744846f844374847c902b5e7fd59b4342a51ef99";
const PRODUCTION_SOURCE = "8e43aad09759d60378b3fc174292850057ccfba3";
const ROUTES = 5_000;
const SAMPLES = 11;
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, "cp3n-dynamic-handoff-worker.mts");
const REPOSITORY_ROOT = resolve(HERE, "../..");

type Cell =
  | "pathname-request-dynamic"
  | "param-request-consume"
  | "normalize-string-stable"
  | "normalize-string-request-param"
  | "normalize-json-stable-param"
  | "normalize-json-request-param"
  | "request-router-static"
  | "request-router-dynamic"
  | "route-handler-stable-static"
  | "route-handler-stable-dynamic"
  | "route-handler-param-dynamic"
  | "pipeline-string-stable-static"
  | "pipeline-string-stable-dynamic"
  | "pipeline-string-param-dynamic"
  | "pipeline-json-stable-static"
  | "pipeline-json-stable-dynamic"
  | "pipeline-json-param-dynamic"
  | "app-fetch-string-stable-static"
  | "app-fetch-string-stable-dynamic"
  | "app-fetch-string-param-dynamic"
  | "app-fetch-json-stable-static"
  | "app-fetch-json-stable-dynamic"
  | "app-fetch-json-param-dynamic";

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

const CELLS: readonly Cell[] = [
  "pathname-request-dynamic",
  "param-request-consume",
  "normalize-string-stable",
  "normalize-string-request-param",
  "normalize-json-stable-param",
  "normalize-json-request-param",
  "request-router-static",
  "request-router-dynamic",
  "route-handler-stable-static",
  "route-handler-stable-dynamic",
  "route-handler-param-dynamic",
  "pipeline-string-stable-static",
  "pipeline-string-stable-dynamic",
  "pipeline-string-param-dynamic",
  "pipeline-json-stable-static",
  "pipeline-json-stable-dynamic",
  "pipeline-json-param-dynamic",
  "app-fetch-string-stable-static",
  "app-fetch-string-stable-dynamic",
  "app-fetch-string-param-dynamic",
  "app-fetch-json-stable-static",
  "app-fetch-json-stable-dynamic",
  "app-fetch-json-param-dynamic",
];

const probeOnly = process.argv.includes("--probe-only");
const harnessSha = git(["rev-parse", "HEAD"]);
const cpu = cpus()[0]?.model ?? "unknown";

preflight();

console.log(
  "Competitive Performance v0.1 — CP3-N dynamic handoff decomposition",
);
console.log(`Bun:         ${Bun.version}`);
console.log(`Revision:    ${Bun.revision}`);
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

if (probeOnly) {
  for (const cell of CELLS) {
    const result = runWorker(cell, true);
    if (!result.probeOnly || result.cell !== cell) {
      throw new Error(`Invalid probe result for ${cell}`);
    }
    console.log(`PASS ${cell}`);
  }

  console.log();
  console.log(
    `CP3-N CORRECTNESS PROBE: PASS (${CELLS.length}/${CELLS.length})`,
  );
  process.exit(0);
}

const summaries = new Map<Cell, Summary>();

console.log("Dynamic handoff and payload-representation cells");
console.log("| cell | median ns/op | p25 | p75 | min | max |");
console.log("| --- | ---: | ---: | ---: | ---: | ---: |");

for (const cell of CELLS) {
  const summary = measureCell(cell);
  summaries.set(cell, summary);
  console.log(
    `| ${cell} | ${format(summary.median)} | ${format(summary.p25)} | ${format(summary.p75)} | ${format(summary.min)} | ${format(summary.max)} |`,
  );
}

console.log();
console.log("Derived diagnostics — non-additive, engineering direction only");
console.log("| diagnostic | value |");
console.log("| --- | ---: |");
printDelta(
  "request param extraction beyond pathname",
  "param-request-consume",
  "pathname-request-dynamic",
);
printRatio(
  "normalize request-param string / stable string",
  "normalize-string-request-param",
  "normalize-string-stable",
);
printRatio(
  "normalize request-param JSON / stable-param JSON",
  "normalize-json-request-param",
  "normalize-json-stable-param",
);
printRatio(
  "request-router dynamic/static",
  "request-router-dynamic",
  "request-router-static",
);
printRatio(
  "route-handler stable dynamic/static",
  "route-handler-stable-dynamic",
  "route-handler-stable-static",
);
printRatio(
  "route-handler param/stable dynamic",
  "route-handler-param-dynamic",
  "route-handler-stable-dynamic",
);
printRatio(
  "pipeline string stable dynamic/static",
  "pipeline-string-stable-dynamic",
  "pipeline-string-stable-static",
);
printRatio(
  "pipeline string param/stable dynamic",
  "pipeline-string-param-dynamic",
  "pipeline-string-stable-dynamic",
);
printRatio(
  "pipeline JSON stable dynamic/static",
  "pipeline-json-stable-dynamic",
  "pipeline-json-stable-static",
);
printRatio(
  "pipeline JSON param/stable dynamic",
  "pipeline-json-param-dynamic",
  "pipeline-json-stable-dynamic",
);
printRatio(
  "app.fetch string stable dynamic/static",
  "app-fetch-string-stable-dynamic",
  "app-fetch-string-stable-static",
);
printRatio(
  "app.fetch string param/stable dynamic",
  "app-fetch-string-param-dynamic",
  "app-fetch-string-stable-dynamic",
);
printRatio(
  "app.fetch JSON stable dynamic/static",
  "app-fetch-json-stable-dynamic",
  "app-fetch-json-stable-static",
);
printRatio(
  "app.fetch JSON param/stable dynamic",
  "app-fetch-json-param-dynamic",
  "app-fetch-json-stable-dynamic",
);
printDelta(
  "app.fetch - pipeline string stable static",
  "app-fetch-string-stable-static",
  "pipeline-string-stable-static",
);
printDelta(
  "app.fetch - pipeline string stable dynamic",
  "app-fetch-string-stable-dynamic",
  "pipeline-string-stable-dynamic",
);
printDelta(
  "app.fetch - pipeline string param dynamic",
  "app-fetch-string-param-dynamic",
  "pipeline-string-param-dynamic",
);
printDelta(
  "app.fetch - pipeline JSON stable static",
  "app-fetch-json-stable-static",
  "pipeline-json-stable-static",
);
printDelta(
  "app.fetch - pipeline JSON stable dynamic",
  "app-fetch-json-stable-dynamic",
  "pipeline-json-stable-dynamic",
);
printDelta(
  "app.fetch - pipeline JSON param dynamic",
  "app-fetch-json-param-dynamic",
  "pipeline-json-param-dynamic",
);

console.log();
console.log("CP3-N LOCAL DYNAMIC HANDOFF DECOMPOSITION RUN: COMPLETE");

function measureCell(cell: Cell): Summary {
  const values: number[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const result = runWorker(cell, false);
    if (result.nsPerOp === null) throw new Error(`Missing timing for ${cell}`);
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

  const line = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (line === undefined) throw new Error(`Worker emitted no result for ${cell}`);

  const parsed = JSON.parse(line) as WorkerResult;
  if (parsed.cell !== cell) {
    throw new Error(`Worker cell mismatch: expected ${cell}, got ${parsed.cell}`);
  }
  return parsed;
}

function preflight(): void {
  if (Bun.version !== EXPECTED_BUN) {
    throw new Error(`CP3-N requires Bun ${EXPECTED_BUN}, got ${Bun.version}`);
  }

  if (Bun.revision !== EXPECTED_BUN_REVISION) {
    throw new Error(
      `CP3-N requires Bun revision ${EXPECTED_BUN_REVISION}, got ${Bun.revision}`,
    );
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty !== "") {
    throw new Error(`CP3-N requires a clean worktree:\n${dirty}`);
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

function median(cell: Cell): number {
  const summary = summaries.get(cell);
  if (summary === undefined) throw new Error(`Missing summary for ${cell}`);
  return summary.median;
}

function printRatio(label: string, numerator: Cell, denominator: Cell): void {
  console.log(
    `| ${label} | ${(median(numerator) / median(denominator)).toFixed(4)}x |`,
  );
}

function printDelta(label: string, left: Cell, right: Cell): void {
  console.log(`| ${label} | ${(median(left) - median(right)).toFixed(1)} ns |`);
}

function format(value: number): string {
  return value.toFixed(1);
}
