import { spawnSync } from "node:child_process";
import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_BUN = "1.4.2";
const PRODUCTION_SOURCE = "98d8c00bfda8913a951bdf8780e136672646a90c";
const ROUTES = 5_000;
const SAMPLES = 11;
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, "cp3h-fresh-path-boundary-worker.mts");
const REPOSITORY_ROOT = resolve(HERE, "../..");

type Cell =
  | "request-url-static"
  | "request-url-dynamic"
  | "pathname-constant-static"
  | "pathname-constant-dynamic"
  | "pathname-request-static"
  | "pathname-request-dynamic"
  | "map-static-stable"
  | "map-static-request"
  | "map-trailing-stable"
  | "map-trailing-request"
  | "router-static-stable"
  | "router-dynamic-stable"
  | "router-static-request"
  | "router-dynamic-request"
  | "dispatch-prepath-static"
  | "dispatch-prepath-dynamic"
  | "dispatch-request-static"
  | "dispatch-request-dynamic";

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
  "request-url-static",
  "request-url-dynamic",
  "pathname-constant-static",
  "pathname-constant-dynamic",
  "pathname-request-static",
  "pathname-request-dynamic",
  "map-static-stable",
  "map-static-request",
  "map-trailing-stable",
  "map-trailing-request",
  "router-static-stable",
  "router-dynamic-stable",
  "router-static-request",
  "router-dynamic-request",
  "dispatch-prepath-static",
  "dispatch-prepath-dynamic",
  "dispatch-request-static",
  "dispatch-request-dynamic",
];

const probeOnly = process.argv.includes("--probe-only");
const harnessSha = git(["rev-parse", "HEAD"]);
const cpu = cpus()[0]?.model ?? "unknown";

preflight();

console.log(
  "Competitive Performance v0.1 — CP3-H fresh-path boundary decomposition",
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
    `CP3-H CORRECTNESS PROBE: PASS (${CELLS.length}/${CELLS.length})`,
  );
  process.exit(0);
}

const summaries = new Map<Cell, Summary>();

console.log("Fresh-path boundary cells");
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
  "request.url dynamic - static",
  "request-url-dynamic",
  "request-url-static",
);
printDelta(
  "pathname constant dynamic - static",
  "pathname-constant-dynamic",
  "pathname-constant-static",
);
printDelta(
  "pathname request dynamic - static",
  "pathname-request-dynamic",
  "pathname-request-static",
);
printDelta(
  "static map request - stable",
  "map-static-request",
  "map-static-stable",
);
printDelta(
  "trailing map request - stable",
  "map-trailing-request",
  "map-trailing-stable",
);
printDelta(
  "static router request - stable",
  "router-static-request",
  "router-static-stable",
);
printDelta(
  "dynamic router request - stable",
  "router-dynamic-request",
  "router-dynamic-stable",
);
printDelta(
  "prepath dispatch dynamic - static",
  "dispatch-prepath-dynamic",
  "dispatch-prepath-static",
);
printDelta(
  "request dispatch dynamic - static",
  "dispatch-request-dynamic",
  "dispatch-request-static",
);
printDelta(
  "static dispatch request - prepath",
  "dispatch-request-static",
  "dispatch-prepath-static",
);
printDelta(
  "dynamic dispatch request - prepath",
  "dispatch-request-dynamic",
  "dispatch-prepath-dynamic",
);

console.log();
console.log("CP3-H LOCAL FRESH-PATH BOUNDARY RUN: COMPLETE");

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

  const line = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (line === undefined) {
    throw new Error(`Worker emitted no result for ${cell}`);
  }

  const parsed = JSON.parse(line) as WorkerResult;
  if (parsed.cell !== cell) {
    throw new Error(
      `Worker cell mismatch: expected ${cell}, got ${parsed.cell}`,
    );
  }

  return parsed;
}

function preflight(): void {
  if (Bun.version !== EXPECTED_BUN) {
    throw new Error(`CP3-H requires Bun ${EXPECTED_BUN}, got ${Bun.version}`);
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty !== "") {
    throw new Error(`CP3-H requires a clean worktree:\n${dirty}`);
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
  if (sorted.length === 0) {
    throw new Error("Cannot calculate empty quantile");
  }

  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower]!;
  }

  const weight = index - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

function median(cell: Cell): number {
  const summary = summaries.get(cell);
  if (summary === undefined) {
    throw new Error(`Missing summary for ${cell}`);
  }
  return summary.median;
}

function printDelta(label: string, left: Cell, right: Cell): void {
  const value = median(left) - median(right);
  console.log(`| ${label} | ${value.toFixed(1)} ns |`);
}

function format(value: number): string {
  return value.toFixed(1);
}
