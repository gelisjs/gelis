import { spawnSync } from "node:child_process";
import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_BUN = "1.4.2";
const EXPECTED_BUN_REVISION = "744846f844374847c902b5e7fd59b4342a51ef99";
const SOURCE = "5d9698d6b8d368ddcff358fc2645435b93c0c062";
const ROUTES = 5_000;
const BLOCKS = 5;
const PAIRS_PER_BLOCK = 8;
const PAIRS = BLOCKS * PAIRS_PER_BLOCK;
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = resolve(HERE, "cp4aq0-benchmark-stability-calibration-worker.mts");
const REPOSITORY_ROOT = resolve(HERE, "../..");
const RUN_TOKEN = `${process.pid}-${Date.now()}`;
const WORKTREE_A = resolve(REPOSITORY_ROOT, "..", `gelis-cp4aq0-a-${RUN_TOKEN}`);
const WORKTREE_B = resolve(REPOSITORY_ROOT, "..", `gelis-cp4aq0-b-${RUN_TOKEN}`);

type Source = "a" | "b";
type Order = "a-b" | "b-a";
type Unit = "ns/op" | "ms" | "bytes";
type Cell =
  | "static-only-raw"
  | "mixed-static-raw"
  | "mixed-dynamic-raw"
  | "mixed-dynamic-json"
  | "mixed-same-length-dynamic-raw"
  | "trailing-dynamic-raw"
  | "trailing-dynamic-json"
  | "generic-dynamic-raw"
  | "collision-dynamic-raw"
  | "all-dynamic-raw"
  | "static-registration"
  | "static-memory";

interface CellSpec {
  readonly cell: Cell;
  readonly label: string;
}

interface WorkerResult {
  readonly cell: Cell;
  readonly variant: "candidate";
  readonly probeOnly: boolean;
  readonly metric: number | null;
  readonly unit: Unit;
  readonly iterations: number;
  readonly warmups: number;
  readonly sink: number;
}

interface MetricSummary {
  readonly median: number;
  readonly p25: number;
  readonly p75: number;
  readonly min: number;
  readonly max: number;
}

interface RatioSummary extends MetricSummary {
  readonly p05: number;
  readonly p95: number;
}

interface PairResult {
  readonly block: number;
  readonly order: Order;
  readonly a: number;
  readonly b: number;
  readonly ratio: number;
}

const CELLS: readonly CellSpec[] = [
  { cell: "static-only-raw", label: "static-only raw" },
  { cell: "mixed-static-raw", label: "mixed static raw" },
  { cell: "mixed-dynamic-raw", label: "mixed dynamic raw" },
  { cell: "mixed-dynamic-json", label: "mixed dynamic JSON" },
  {
    cell: "mixed-same-length-dynamic-raw",
    label: "mixed same-length dynamic raw",
  },
  { cell: "trailing-dynamic-raw", label: "pure trailing dynamic raw" },
  { cell: "trailing-dynamic-json", label: "pure trailing dynamic JSON" },
  { cell: "generic-dynamic-raw", label: "generic dynamic raw" },
  { cell: "collision-dynamic-raw", label: "forced collision raw" },
  { cell: "all-dynamic-raw", label: "ALL dynamic raw" },
  { cell: "static-registration", label: "static registration" },
  { cell: "static-memory", label: "static retained heap delta" },
];

const SOURCES: readonly Source[] = ["a", "b"];
const probeOnly = process.argv.includes("--probe-only");
const harnessSha = git(["rev-parse", "HEAD"]);
const cpu = cpus()[0]?.model ?? "unknown";
let worktreeACreated = false;
let worktreeBCreated = false;
let probeCompleted = false;
let completed = false;

preflight();

try {
  createWorktree(WORKTREE_A, SOURCE);
  worktreeACreated = true;
  createWorktree(WORKTREE_B, SOURCE);
  worktreeBCreated = true;

  printHeader();

  if (probeOnly) {
    runProbe();
    probeCompleted = true;
  } else {
    runTiming();
    completed = true;
  }
} finally {
  cleanupWorktrees();
}

if (probeCompleted) {
  console.log();
  console.log(
    `CP4-AQ0 CORRECTNESS PROBE: PASS (${CELLS.length * SOURCES.length}/${CELLS.length * SOURCES.length})`,
  );
} else if (completed) {
  console.log();
  console.log("CP4-AQ0 LOCAL BENCHMARK STABILITY CALIBRATION RUN: COMPLETE");
}

function printHeader(): void {
  console.log(
    "Competitive Performance v0.1 — CP4-AQ0 benchmark stability calibration",
  );
  console.log(`Bun:             ${Bun.version}`);
  console.log(`Revision:        ${Bun.revision}`);
  console.log(`CPU:             ${cpu}`);
  console.log(`Harness SHA:     ${harnessSha}`);
  console.log(`Source A:        ${SOURCE}`);
  console.log(`Source B:        ${SOURCE}`);
  console.log(`Routes:          ${ROUTES.toLocaleString("en-US")}`);
  if (probeOnly) {
    console.log("Mode:            correctness probe only");
  } else {
    console.log(`Blocks:          ${BLOCKS}`);
    console.log(`Pairs/block:     ${PAIRS_PER_BLOCK}`);
    console.log(`Pairs/cell:      ${PAIRS} mirrored fresh-worker pairs`);
    console.log(`Samples/source:  ${PAIRS} fresh-worker measurements/cell`);
    console.log("Order:           4 A→B + 4 B→A pairs per block");
  }
  console.log();
}

function runProbe(): void {
  for (const spec of CELLS) {
    for (const source of SOURCES) {
      const result = runWorker(spec.cell, source, true);
      if (!result.probeOnly || result.cell !== spec.cell) {
        throw new Error(`Invalid probe result for ${source} ${spec.cell}`);
      }
      console.log(`PASS ${source}-${spec.cell}`);
    }
  }
}

function runTiming(): void {
  const results = new Map<Cell, PairResult[]>();
  const units = new Map<Cell, Unit>();

  for (const spec of CELLS) {
    const pairs: PairResult[] = [];

    for (let block = 0; block < BLOCKS; block++) {
      for (let pair = 0; pair < PAIRS_PER_BLOCK; pair++) {
        const order: Order = pair % 2 === 0 ? "a-b" : "b-a";
        const first: Source = order === "a-b" ? "a" : "b";
        const second: Source = order === "a-b" ? "b" : "a";
        const firstResult = runWorker(spec.cell, first, false);
        const secondResult = runWorker(spec.cell, second, false);

        if (firstResult.metric === null || secondResult.metric === null) {
          throw new Error(`Missing metric for ${spec.cell}`);
        }
        if (firstResult.unit !== secondResult.unit) {
          throw new Error(`Pair unit mismatch for ${spec.cell}`);
        }

        const knownUnit = units.get(spec.cell);
        if (knownUnit !== undefined && knownUnit !== firstResult.unit) {
          throw new Error(`Unit drift for ${spec.cell}`);
        }
        units.set(spec.cell, firstResult.unit);

        const a = first === "a" ? firstResult.metric : secondResult.metric;
        const b = first === "b" ? firstResult.metric : secondResult.metric;
        pairs.push({ block, order, a, b, ratio: b / a });
      }
    }

    if (pairs.length !== PAIRS) {
      throw new Error(`Incomplete pair set for ${spec.cell}`);
    }
    results.set(spec.cell, pairs);
  }

  printAbsoluteMetrics(results, units);
  printPairedNoise(results);
  printOrderConditioning(results);
  printBlockwiseRatios(results);
  printGlobalDiagnostics(results);

  console.log();
  console.log(
    "CP4-AQ0 STABILITY CALIBRATION ONLY: A and B are byte-identical source SHA; no Gelis performance acceptance or reclassification is inferred.",
  );
}

function printAbsoluteMetrics(
  results: ReadonlyMap<Cell, PairResult[]>,
  units: ReadonlyMap<Cell, Unit>,
): void {
  console.log("Same-source absolute metrics");
  console.log("| cell | source | median | p25 | p75 | min | max | unit |");
  console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |");

  for (const spec of CELLS) {
    const pairs = getPairs(results, spec.cell);
    const unit = units.get(spec.cell);
    if (unit === undefined) throw new Error(`Missing unit for ${spec.cell}`);

    for (const source of SOURCES) {
      const values = pairs.map((pair) => (source === "a" ? pair.a : pair.b));
      const summary = summarize(values);
      console.log(
        `| ${spec.cell} | ${source} | ${formatMetric(summary.median, unit)} | ${formatMetric(summary.p25, unit)} | ${formatMetric(summary.p75, unit)} | ${formatMetric(summary.min, unit)} | ${formatMetric(summary.max, unit)} | ${unit} |`,
      );
    }
  }
}

function printPairedNoise(results: ReadonlyMap<Cell, PairResult[]>): void {
  console.log();
  console.log("Paired same-source B / A noise distribution");
  console.log(
    "| comparison | median | p05 | p25 | p75 | p95 | min | max | outside ±1% | outside ±2% |",
  );
  console.log(
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  );

  for (const spec of CELLS) {
    const ratios = getPairs(results, spec.cell).map((pair) => pair.ratio);
    const summary = summarizeRatios(ratios);
    const outside1 = ratios.filter((ratio) => Math.abs(ratio - 1) > 0.01).length;
    const outside2 = ratios.filter((ratio) => Math.abs(ratio - 1) > 0.02).length;
    console.log(
      `| ${spec.label} | ${summary.median.toFixed(4)}x | ${summary.p05.toFixed(4)}x | ${summary.p25.toFixed(4)}x | ${summary.p75.toFixed(4)}x | ${summary.p95.toFixed(4)}x | ${summary.min.toFixed(4)}x | ${summary.max.toFixed(4)}x | ${outside1}/${PAIRS} | ${outside2}/${PAIRS} |`,
    );
  }
}

function printOrderConditioning(results: ReadonlyMap<Cell, PairResult[]>): void {
  console.log();
  console.log("Order-conditioned paired B / A medians");
  console.log("| comparison | A→B | B→A | absolute median spread |");
  console.log("| --- | ---: | ---: | ---: |");

  for (const spec of CELLS) {
    const pairs = getPairs(results, spec.cell);
    const ab = median(
      pairs.filter((pair) => pair.order === "a-b").map((pair) => pair.ratio),
    );
    const ba = median(
      pairs.filter((pair) => pair.order === "b-a").map((pair) => pair.ratio),
    );
    console.log(
      `| ${spec.label} | ${ab.toFixed(4)}x | ${ba.toFixed(4)}x | ${(Math.abs(ab - ba) * 100).toFixed(2)}% |`,
    );
  }
}

function printBlockwiseRatios(results: ReadonlyMap<Cell, PairResult[]>): void {
  console.log();
  console.log("Blockwise paired B / A median ratios");
  console.log(
    "| comparison | block 1 | block 2 | block 3 | block 4 | block 5 | max block deviation from 1.0 |",
  );
  console.log("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");

  for (const spec of CELLS) {
    const pairs = getPairs(results, spec.cell);
    const blockRatios: number[] = [];
    for (let block = 0; block < BLOCKS; block++) {
      const blockValues = pairs
        .filter((pair) => pair.block === block)
        .map((pair) => pair.ratio);
      if (blockValues.length !== PAIRS_PER_BLOCK) {
        throw new Error(`Incomplete block ${block + 1} for ${spec.cell}`);
      }
      blockRatios.push(median(blockValues));
    }
    const maxDeviation = Math.max(
      ...blockRatios.map((ratio) => Math.abs(ratio - 1)),
    );
    console.log(
      `| ${spec.label} | ${blockRatios[0]!.toFixed(4)}x | ${blockRatios[1]!.toFixed(4)}x | ${blockRatios[2]!.toFixed(4)}x | ${blockRatios[3]!.toFixed(4)}x | ${blockRatios[4]!.toFixed(4)}x | ${(maxDeviation * 100).toFixed(2)}% |`,
    );
  }
}

function printGlobalDiagnostics(results: ReadonlyMap<Cell, PairResult[]>): void {
  let worstP05Deflation = 0;
  let worstP95Inflation = 0;
  let worstCell = "";
  let worstRadius = 0;

  for (const spec of CELLS) {
    const summary = summarizeRatios(
      getPairs(results, spec.cell).map((pair) => pair.ratio),
    );
    const deflation = Math.max(0, 1 - summary.p05);
    const inflation = Math.max(0, summary.p95 - 1);
    const radius = Math.max(deflation, inflation);
    worstP05Deflation = Math.max(worstP05Deflation, deflation);
    worstP95Inflation = Math.max(worstP95Inflation, inflation);
    if (radius > worstRadius) {
      worstRadius = radius;
      worstCell = spec.label;
    }
  }

  console.log();
  console.log("Global calibration diagnostics — descriptive only");
  console.log("| diagnostic | value |");
  console.log("| --- | ---: |");
  console.log(
    `| worst paired p05 deflation below 1.0 | ${(worstP05Deflation * 100).toFixed(2)}% |`,
  );
  console.log(
    `| worst paired p95 inflation above 1.0 | ${(worstP95Inflation * 100).toFixed(2)}% |`,
  );
  console.log(
    `| worst two-sided p05-p95 radius | ${(worstRadius * 100).toFixed(2)}% (${worstCell}) |`,
  );
}

function runWorker(
  cell: Cell,
  source: Source,
  workerProbeOnly: boolean,
): WorkerResult {
  const sourceRoot = source === "a" ? WORKTREE_A : WORKTREE_B;
  const result = spawnSync(
    process.execPath,
    [
      WORKER,
      `--cell=${cell}`,
      "--variant=candidate",
      `--source-root=${sourceRoot}`,
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
      `Worker failed for ${source} ${cell}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }

  const line = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (line === undefined) {
    throw new Error(`Worker emitted no result for ${source} ${cell}`);
  }

  const parsed = JSON.parse(line) as WorkerResult;
  if (parsed.cell !== cell || parsed.variant !== "candidate") {
    throw new Error(`Worker identity mismatch for ${source} ${cell}`);
  }
  return parsed;
}

function preflight(): void {
  if (Bun.version !== EXPECTED_BUN) {
    throw new Error(`CP4-AQ0 requires Bun ${EXPECTED_BUN}, got ${Bun.version}`);
  }
  if (Bun.revision !== EXPECTED_BUN_REVISION) {
    throw new Error(
      `CP4-AQ0 requires Bun revision ${EXPECTED_BUN_REVISION}, got ${Bun.revision}`,
    );
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty !== "") {
    throw new Error(`CP4-AQ0 requires a clean worktree:\n${dirty}`);
  }

  const sourceDiff = spawnSync(
    "git",
    ["-C", REPOSITORY_ROOT, "diff", "--quiet", SOURCE, "HEAD", "--", "src"],
    { encoding: "utf8" },
  );
  if (sourceDiff.status !== 0) {
    throw new Error(`src/** differs from frozen source ${SOURCE}`);
  }
}

function createWorktree(path: string, source: string): void {
  const result = spawnSync(
    "git",
    ["-C", REPOSITORY_ROOT, "worktree", "add", "--detach", path, source],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(
      `Unable to create worktree for ${source}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
}

function cleanupWorktrees(): void {
  if (worktreeBCreated) removeWorktree(WORKTREE_B);
  if (worktreeACreated) removeWorktree(WORKTREE_A);
}

function removeWorktree(path: string): void {
  spawnSync(
    "git",
    ["-C", REPOSITORY_ROOT, "worktree", "remove", "--force", path],
    { encoding: "utf8" },
  );
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

function getPairs(
  results: ReadonlyMap<Cell, PairResult[]>,
  cell: Cell,
): PairResult[] {
  const pairs = results.get(cell);
  if (pairs === undefined) throw new Error(`Missing pair set for ${cell}`);
  return pairs;
}

function summarize(values: readonly number[]): MetricSummary {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    median: quantile(sorted, 0.5),
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
    min: sorted[0]!,
    max: sorted.at(-1)!,
  };
}

function summarizeRatios(values: readonly number[]): RatioSummary {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    median: quantile(sorted, 0.5),
    p05: quantile(sorted, 0.05),
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
    p95: quantile(sorted, 0.95),
    min: sorted[0]!,
    max: sorted.at(-1)!,
  };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return quantile(sorted, 0.5);
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

function formatMetric(value: number, unit: Unit): string {
  return unit === "ms" ? value.toFixed(3) : value.toFixed(1);
}
