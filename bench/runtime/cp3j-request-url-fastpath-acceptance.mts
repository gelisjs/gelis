import { spawnSync } from "node:child_process";
import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_BUN = "1.4.2";
const CANDIDATE_SOURCE = "2a10e42308631fe53faba9a789b227d0a1cb241c";
const ROUTES = 5_000;
const SAMPLES = 11;
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, "cp3j-request-url-fastpath-worker.mts");
const REPOSITORY_ROOT = resolve(HERE, "../..");

type Cell =
  | "pathname-baseline-static"
  | "pathname-candidate-static"
  | "pathname-baseline-dynamic"
  | "pathname-candidate-dynamic"
  | "dispatch-baseline-static"
  | "dispatch-candidate-static"
  | "dispatch-baseline-dynamic"
  | "dispatch-candidate-dynamic"
  | "pipeline-baseline-static-json"
  | "pipeline-candidate-static-json"
  | "pipeline-baseline-dynamic-json"
  | "pipeline-candidate-dynamic-json";

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
  "pathname-baseline-static",
  "pathname-candidate-static",
  "pathname-baseline-dynamic",
  "pathname-candidate-dynamic",
  "dispatch-baseline-static",
  "dispatch-candidate-static",
  "dispatch-baseline-dynamic",
  "dispatch-candidate-dynamic",
  "pipeline-baseline-static-json",
  "pipeline-candidate-static-json",
  "pipeline-baseline-dynamic-json",
  "pipeline-candidate-dynamic-json",
];

const probeOnly = process.argv.includes("--probe-only");
const harnessSha = git(["rev-parse", "HEAD"]);
const cpu = cpus()[0]?.model ?? "unknown";

preflight();

console.log(
  "Competitive Performance v0.1 — CP3-J request URL fast path acceptance",
);
console.log(`Bun:         ${Bun.version}`);
console.log(`Revision:    ${Bun.revision}`);
console.log(`CPU:         ${cpu}`);
console.log(`Harness SHA: ${harnessSha}`);
console.log(`Candidate:   ${CANDIDATE_SOURCE}`);
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
    `CP3-J CORRECTNESS PROBE: PASS (${CELLS.length}/${CELLS.length})`,
  );
  process.exit(0);
}

const summaries = new Map<Cell, Summary>();

console.log("Request URL fast path cells");
console.log("| cell | median ns/op | p25 | p75 | min | max |");
console.log("| --- | ---: | ---: | ---: | ---: | ---: |");

for (const cell of CELLS) {
  const summary = measureCell(cell);
  summaries.set(cell, summary);
  console.log(
    `| ${cell} | ${format(summary.median)} | ${format(summary.p25)} | ${format(summary.p75)} | ${format(summary.min)} | ${format(summary.max)} |`,
  );
}

const pathnameStaticRatio = ratio(
  "pathname-candidate-static",
  "pathname-baseline-static",
);
const pathnameDynamicRatio = ratio(
  "pathname-candidate-dynamic",
  "pathname-baseline-dynamic",
);
const dispatchStaticRatio = ratio(
  "dispatch-candidate-static",
  "dispatch-baseline-static",
);
const dispatchDynamicRatio = ratio(
  "dispatch-candidate-dynamic",
  "dispatch-baseline-dynamic",
);
const dispatchGeomean = Math.sqrt(dispatchStaticRatio * dispatchDynamicRatio);
const pipelineStaticRatio = ratio(
  "pipeline-candidate-static-json",
  "pipeline-baseline-static-json",
);
const pipelineDynamicRatio = ratio(
  "pipeline-candidate-dynamic-json",
  "pipeline-baseline-dynamic-json",
);
const pipelineGeomean = Math.sqrt(pipelineStaticRatio * pipelineDynamicRatio);

console.log();
console.log("Frozen acceptance diagnostics");
console.log("| diagnostic | value | gate | result |");
console.log("| --- | ---: | ---: | --- | ");
printGate(
  "pathname candidate/baseline static",
  pathnameStaticRatio,
  0.9,
  "<=",
);
printGate(
  "pathname candidate/baseline dynamic",
  pathnameDynamicRatio,
  0.9,
  "<=",
);
printGate(
  "dispatch candidate/baseline static",
  dispatchStaticRatio,
  1.01,
  "<=",
);
printGate(
  "dispatch candidate/baseline dynamic",
  dispatchDynamicRatio,
  1.01,
  "<=",
);
printGate(
  "dispatch candidate/baseline geomean",
  dispatchGeomean,
  0.97,
  "<=",
);
printGate(
  "pipeline candidate/baseline static JSON",
  pipelineStaticRatio,
  1.01,
  "<=",
);
printGate(
  "pipeline candidate/baseline dynamic JSON",
  pipelineDynamicRatio,
  1.01,
  "<=",
);
printGate(
  "pipeline candidate/baseline geomean",
  pipelineGeomean,
  0.99,
  "<=",
);

const accepted =
  pathnameStaticRatio <= 0.9 &&
  pathnameDynamicRatio <= 0.9 &&
  dispatchStaticRatio <= 1.01 &&
  dispatchDynamicRatio <= 1.01 &&
  dispatchGeomean <= 0.97 &&
  pipelineStaticRatio <= 1.01 &&
  pipelineDynamicRatio <= 1.01 &&
  pipelineGeomean <= 0.99;

console.log();
console.log("CP3-J LOCAL REQUEST URL FAST PATH RUN: COMPLETE");
console.log(`CP3-J ACCEPTANCE: ${accepted ? "PASS" : "FAIL"}`);

if (!accepted) {
  process.exitCode = 1;
}

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
      "--cell",
      cell,
      "--probe-only",
      workerProbeOnly ? "true" : "false",
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
    throw new Error(`CP3-J requires Bun ${EXPECTED_BUN}, got ${Bun.version}`);
  }

  const dirty = git(["status", "--porcelain"]);

  if (dirty !== "") {
    throw new Error(`CP3-J requires a clean worktree:\n${dirty}`);
  }

  const sourceDiff = spawnSync(
    "git",
    [
      "-C",
      REPOSITORY_ROOT,
      "diff",
      "--quiet",
      CANDIDATE_SOURCE,
      "HEAD",
      "--",
      "src",
      "test/runtime/url.test.ts",
    ],
    { encoding: "utf8" },
  );

  if (sourceDiff.status !== 0) {
    throw new Error(
      `candidate source differs from frozen CP3-J source ${CANDIDATE_SOURCE}`,
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

function ratio(numerator: Cell, denominator: Cell): number {
  return median(numerator) / median(denominator);
}

function printGate(
  label: string,
  value: number,
  gate: number,
  operator: "<=",
): void {
  const passed = operator === "<=" && value <= gate;
  console.log(
    `| ${label} | ${value.toFixed(4)}x | ${operator}${gate.toFixed(4)}x | ${passed ? "PASS" : "FAIL"} |`,
  );
}

function format(value: number): string {
  return value.toFixed(1);
}
