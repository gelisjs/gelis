import { spawnSync } from "node:child_process";
import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_BUN = "1.4.2";
const EXPECTED_BUN_REVISION = "744846f844374847c902b5e7fd59b4342a51ef99";
const CP4Z_SOURCE = "1b4057ad9d12bc28d2ab2ca7917924368fe99444";
const KIND_ONLY_SOURCE = "408f9856f814184ca0204aa49d3812af8660f077";
const ROUTES = 5_000;
const BLOCKS = 4;
const PAIRS_PER_BLOCK = 6;
const SAMPLES = BLOCKS * PAIRS_PER_BLOCK;
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, "cp4ag-z-kind-blockwise-stability-worker.mts");
const REPOSITORY_ROOT = resolve(HERE, "../..");
const RUN_TOKEN = `${process.pid}-${Date.now()}`;
const CP4Z_WORKTREE = resolve(
  REPOSITORY_ROOT,
  "..",
  `gelis-cp4ag-cp4z-${RUN_TOKEN}`,
);
const KIND_ONLY_WORKTREE = resolve(
  REPOSITORY_ROOT,
  "..",
  `gelis-cp4ag-kind-only-${RUN_TOKEN}`,
);

type Source = "cp4z" | "kind-only";
type WorkerVariant = "production" | "candidate";
type Unit = "ns/op" | "ms" | "bytes";
type Cell =
  | "static-only-raw"
  | "mixed-static-raw"
  | "mixed-dynamic-raw"
  | "trailing-dynamic-raw"
  | "generic-dynamic-raw"
  | "all-dynamic-raw"
  | "static-registration";

interface CellSpec {
  readonly cell: Cell;
  readonly label: string;
}

interface WorkerResult {
  readonly cell: Cell;
  readonly variant: WorkerVariant;
  readonly probeOnly: boolean;
  readonly metric: number | null;
  readonly unit: Unit;
  readonly iterations: number;
  readonly warmups: number;
  readonly sink: number;
}

interface Summary {
  readonly cell: Cell;
  readonly source: Source;
  readonly unit: Unit;
  readonly median: number;
  readonly p25: number;
  readonly p75: number;
  readonly min: number;
  readonly max: number;
}

const CELLS: readonly CellSpec[] = [
  { cell: "static-only-raw", label: "static-only raw" },
  { cell: "mixed-static-raw", label: "mixed static raw" },
  { cell: "mixed-dynamic-raw", label: "mixed dynamic raw" },
  { cell: "trailing-dynamic-raw", label: "pure trailing dynamic raw" },
  { cell: "generic-dynamic-raw", label: "generic dynamic raw" },
  { cell: "all-dynamic-raw", label: "ALL dynamic raw" },
  { cell: "static-registration", label: "static registration" },
];

const SOURCES: readonly Source[] = ["cp4z", "kind-only"];
const ORDER_A: readonly Source[] = ["cp4z", "kind-only"];
const ORDER_B: readonly Source[] = ["kind-only", "cp4z"];

const probeOnly = process.argv.includes("--probe-only");
const harnessSha = git(["rev-parse", "HEAD"]);
const cpu = cpus()[0]?.model ?? "unknown";
let cp4zWorktreeCreated = false;
let kindOnlyWorktreeCreated = false;
let probeCompleted = false;
let completed = false;

preflight();

try {
  createWorktree(CP4Z_WORKTREE, CP4Z_SOURCE);
  cp4zWorktreeCreated = true;
  createWorktree(KIND_ONLY_WORKTREE, KIND_ONLY_SOURCE);
  kindOnlyWorktreeCreated = true;

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
    `CP4-AG CORRECTNESS PROBE: PASS (${CELLS.length * SOURCES.length}/${CELLS.length * SOURCES.length})`,
  );
} else if (completed) {
  console.log();
  console.log("CP4-AG LOCAL Z-KIND BLOCKWISE STABILITY RUN: COMPLETE");
}

function printHeader(): void {
  console.log(
    "Competitive Performance v0.1 — CP4-AG Z/KIND blockwise stability",
  );
  console.log(`Bun:             ${Bun.version}`);
  console.log(`Revision:        ${Bun.revision}`);
  console.log(`CPU:             ${cpu}`);
  console.log(`Harness SHA:     ${harnessSha}`);
  console.log(`CP4-Z source:    ${CP4Z_SOURCE}`);
  console.log(`KIND-only src:   ${KIND_ONLY_SOURCE}`);
  console.log(`Routes:          ${ROUTES.toLocaleString("en-US")}`);
  if (probeOnly) {
    console.log("Mode:            correctness probe only");
  } else {
    console.log(`Blocks:          ${BLOCKS}`);
    console.log(`Pairs/block:     ${PAIRS_PER_BLOCK}`);
    console.log(`Samples/source:  ${SAMPLES} fresh-worker measurements/cell`);
    console.log("Order:           3 Z→KIND + 3 KIND→Z pairs per block");
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
  const overallValues = new Map<string, number[]>();
  const blockValues = new Map<string, number[]>();
  const units = new Map<Cell, Unit>();

  for (const spec of CELLS) {
    for (const source of SOURCES) {
      overallValues.set(key(spec.cell, source), []);
      for (let block = 0; block < BLOCKS; block++) {
        blockValues.set(blockKey(spec.cell, source, block), []);
      }
    }

    for (let sample = 0; sample < SAMPLES; sample++) {
      const block = Math.floor(sample / PAIRS_PER_BLOCK);
      const inBlock = sample % PAIRS_PER_BLOCK;
      const order = inBlock % 2 === 0 ? ORDER_A : ORDER_B;

      for (const source of order) {
        const result = runWorker(spec.cell, source, false);
        if (result.metric === null) {
          throw new Error(`Missing metric for ${source} ${spec.cell}`);
        }
        const knownUnit = units.get(spec.cell);
        if (knownUnit !== undefined && knownUnit !== result.unit) {
          throw new Error(`Unit mismatch for ${spec.cell}`);
        }
        units.set(spec.cell, result.unit);
        overallValues.get(key(spec.cell, source))!.push(result.metric);
        blockValues
          .get(blockKey(spec.cell, source, block))!
          .push(result.metric);
      }
    }
  }

  const summaries = new Map<string, Summary>();
  for (const spec of CELLS) {
    const unit = units.get(spec.cell);
    if (unit === undefined) throw new Error(`Missing unit for ${spec.cell}`);

    for (const source of SOURCES) {
      const input = overallValues.get(key(spec.cell, source));
      if (input === undefined || input.length !== SAMPLES) {
        throw new Error(`Incomplete timing set for ${source} ${spec.cell}`);
      }
      summaries.set(
        key(spec.cell, source),
        summarize(spec.cell, source, unit, input),
      );
    }
  }

  console.log("Overall stability cells");
  console.log("| cell | source | median | p25 | p75 | min | max | unit |");
  console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const spec of CELLS) {
    for (const source of SOURCES) {
      const summary = getSummary(summaries, spec.cell, source);
      console.log(
        `| ${spec.cell} | ${source} | ${formatMetric(summary.median, summary.unit)} | ${formatMetric(summary.p25, summary.unit)} | ${formatMetric(summary.p75, summary.unit)} | ${formatMetric(summary.min, summary.unit)} | ${formatMetric(summary.max, summary.unit)} | ${summary.unit} |`,
      );
    }
  }

  console.log();
  console.log("Overall KIND / Z ratios");
  console.log("| comparison | KIND / Z |");
  console.log("| --- | ---: |");
  for (const spec of CELLS) {
    const cp4z = getSummary(summaries, spec.cell, "cp4z").median;
    const kindOnly = getSummary(summaries, spec.cell, "kind-only").median;
    console.log(`| ${spec.label} | ${(kindOnly / cp4z).toFixed(4)}x |`);
  }

  console.log();
  console.log("Blockwise KIND / Z ratios");
  console.log(
    "| comparison | block 1 | block 2 | block 3 | block 4 | KIND-faster blocks |",
  );
  console.log("| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const spec of CELLS) {
    const ratios: number[] = [];
    for (let block = 0; block < BLOCKS; block++) {
      const cp4zValues = blockValues.get(blockKey(spec.cell, "cp4z", block));
      const kindValues = blockValues.get(
        blockKey(spec.cell, "kind-only", block),
      );
      if (
        cp4zValues === undefined ||
        kindValues === undefined ||
        cp4zValues.length !== PAIRS_PER_BLOCK ||
        kindValues.length !== PAIRS_PER_BLOCK
      ) {
        throw new Error(`Incomplete block ${block + 1} for ${spec.cell}`);
      }
      const cp4zMedian = median(cp4zValues);
      const kindMedian = median(kindValues);
      ratios.push(kindMedian / cp4zMedian);
    }
    const fasterBlocks = ratios.filter((ratio) => ratio < 1).length;
    console.log(
      `| ${spec.label} | ${ratios[0]!.toFixed(4)}x | ${ratios[1]!.toFixed(4)}x | ${ratios[2]!.toFixed(4)}x | ${ratios[3]!.toFixed(4)}x | ${fasterBlocks}/${BLOCKS} |`,
    );
  }

  console.log();
  console.log(
    "CP4-AG STABILITY ONLY: no acceptance gates; prior CP4-Z/CP4-AE classifications remain unchanged.",
  );
}

function runWorker(
  cell: Cell,
  source: Source,
  workerProbeOnly: boolean,
): WorkerResult {
  const sourceRoot = source === "cp4z" ? CP4Z_WORKTREE : KIND_ONLY_WORKTREE;

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
    throw new Error(`CP4-AG requires Bun ${EXPECTED_BUN}, got ${Bun.version}`);
  }
  if (Bun.revision !== EXPECTED_BUN_REVISION) {
    throw new Error(
      `CP4-AG requires Bun revision ${EXPECTED_BUN_REVISION}, got ${Bun.revision}`,
    );
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty !== "") {
    throw new Error(`CP4-AG requires a clean worktree:\n${dirty}`);
  }

  const changed = git([
    "diff",
    "--name-only",
    CP4Z_SOURCE,
    KIND_ONLY_SOURCE,
    "--",
    "src",
  ]);
  if (changed !== "src/runtime/router.ts") {
    throw new Error(
      `KIND-only must differ from CP4-Z only at src/runtime/router.ts; got:\n${changed}`,
    );
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
  if (kindOnlyWorktreeCreated) removeWorktree(KIND_ONLY_WORKTREE);
  if (cp4zWorktreeCreated) removeWorktree(CP4Z_WORKTREE);
}

function removeWorktree(path: string): void {
  spawnSync(
    "git",
    ["-C", REPOSITORY_ROOT, "worktree", "remove", "--force", path],
    { encoding: "utf8" },
  );
}

function git(args: string[]): string {
  const result = spawnSync("git", ["-C", REPOSITORY_ROOT, ...args], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

function key(cell: Cell, source: Source): string {
  return `${cell}:${source}`;
}

function blockKey(cell: Cell, source: Source, block: number): string {
  return `${cell}:${source}:block-${block}`;
}

function summarize(
  cell: Cell,
  source: Source,
  unit: Unit,
  input: readonly number[],
): Summary {
  const sorted = [...input].sort((a, b) => a - b);
  return {
    cell,
    source,
    unit,
    median: percentile(sorted, 0.5),
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
    min: sorted[0]!,
    max: sorted.at(-1)!,
  };
}

function median(input: readonly number[]): number {
  const sorted = [...input].sort((a, b) => a - b);
  return percentile(sorted, 0.5);
}

function percentile(sorted: readonly number[], p: number): number {
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  const weight = position - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

function getSummary(
  summaries: ReadonlyMap<string, Summary>,
  cell: Cell,
  source: Source,
): Summary {
  const summary = summaries.get(key(cell, source));
  if (summary === undefined) {
    throw new Error(`Missing summary for ${source} ${cell}`);
  }
  return summary;
}

function formatMetric(value: number, unit: Unit): string {
  return unit === "ms" ? value.toFixed(3) : value.toFixed(1);
}
