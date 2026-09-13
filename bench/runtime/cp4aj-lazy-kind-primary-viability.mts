import { spawnSync } from "node:child_process";
import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_BUN = "1.4.2";
const EXPECTED_BUN_REVISION = "744846f844374847c902b5e7fd59b4342a51ef99";
const CONTROL_SOURCE = "a7751059eef1d3074e6e0a1c2d227b49889affe4";
const CANDIDATE_SOURCE = "6149054010ce78f9285b8bb01f9ccb6947de144a";
const ROUTES = 5_000;
const BLOCKS = 4;
const PAIRS_PER_BLOCK = 6;
const SAMPLES = BLOCKS * PAIRS_PER_BLOCK;
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, "cp4aj-lazy-kind-primary-viability-worker.mts");
const REPOSITORY_ROOT = resolve(HERE, "../..");
const RUN_TOKEN = `${process.pid}-${Date.now()}`;
const CONTROL_WORKTREE = resolve(
  REPOSITORY_ROOT,
  "..",
  `gelis-cp4aj-control-${RUN_TOKEN}`,
);
const CANDIDATE_WORKTREE = resolve(
  REPOSITORY_ROOT,
  "..",
  `gelis-cp4aj-candidate-${RUN_TOKEN}`,
);

type Source = "control" | "candidate";
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

const SOURCES: readonly Source[] = ["control", "candidate"];
const ORDER_A: readonly Source[] = ["control", "candidate"];
const ORDER_B: readonly Source[] = ["candidate", "control"];

const probeOnly = process.argv.includes("--probe-only");
const harnessSha = git(["rev-parse", "HEAD"]);
const cpu = cpus()[0]?.model ?? "unknown";
let controlWorktreeCreated = false;
let candidateWorktreeCreated = false;
let probeCompleted = false;
let completed = false;

preflight();

try {
  createWorktree(CONTROL_WORKTREE, CONTROL_SOURCE);
  controlWorktreeCreated = true;
  createWorktree(CANDIDATE_WORKTREE, CANDIDATE_SOURCE);
  candidateWorktreeCreated = true;

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
    `CP4-AJ CORRECTNESS PROBE: PASS (${CELLS.length * SOURCES.length}/${CELLS.length * SOURCES.length})`,
  );
} else if (completed) {
  console.log();
  console.log("CP4-AJ LOCAL LAZY-KIND COMPOSITION VIABILITY RUN: COMPLETE");
}

function printHeader(): void {
  console.log(
    "Competitive Performance v0.1 — CP4-AJ AI-control/candidate lazy + KIND-primary viability",
  );
  console.log(`Bun:             ${Bun.version}`);
  console.log(`Revision:        ${Bun.revision}`);
  console.log(`CPU:             ${cpu}`);
  console.log(`Harness SHA:     ${harnessSha}`);
  console.log(`CP4-AI source:    ${CONTROL_SOURCE}`);
  console.log(`Candidate src:   ${CANDIDATE_SOURCE}`);
  console.log(`Routes:          ${ROUTES.toLocaleString("en-US")}`);
  if (probeOnly) {
    console.log("Mode:            correctness probe only");
  } else {
    console.log(`Blocks:          ${BLOCKS}`);
    console.log(`Pairs/block:     ${PAIRS_PER_BLOCK}`);
    console.log(`Samples/source:  ${SAMPLES} fresh-worker measurements/cell`);
    console.log(
      "Order:           3 control→candidate + 3 candidate→control pairs per block",
    );
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
  console.log("Overall candidate / AI control ratios");
  console.log("| comparison | candidate / AI control |");
  console.log("| --- | ---: |");
  for (const spec of CELLS) {
    const control = getSummary(summaries, spec.cell, "control").median;
    const candidate = getSummary(summaries, spec.cell, "candidate").median;
    console.log(`| ${spec.label} | ${(candidate / control).toFixed(4)}x |`);
  }

  console.log();
  console.log("Blockwise candidate / AI control ratios");
  console.log(
    "| comparison | block 1 | block 2 | block 3 | block 4 | candidate-faster blocks |",
  );
  console.log("| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const spec of CELLS) {
    const ratios: number[] = [];
    for (let block = 0; block < BLOCKS; block++) {
      const controlValues = blockValues.get(
        blockKey(spec.cell, "control", block),
      );
      const candidateValues = blockValues.get(
        blockKey(spec.cell, "candidate", block),
      );
      if (
        controlValues === undefined ||
        candidateValues === undefined ||
        controlValues.length !== PAIRS_PER_BLOCK ||
        candidateValues.length !== PAIRS_PER_BLOCK
      ) {
        throw new Error(`Incomplete block ${block + 1} for ${spec.cell}`);
      }
      const controlMedian = median(controlValues);
      const candidateMedian = median(candidateValues);
      ratios.push(candidateMedian / controlMedian);
    }
    const fasterBlocks = ratios.filter((ratio) => ratio < 1).length;
    console.log(
      `| ${spec.label} | ${ratios[0]!.toFixed(4)}x | ${ratios[1]!.toFixed(4)}x | ${ratios[2]!.toFixed(4)}x | ${ratios[3]!.toFixed(4)}x | ${fasterBlocks}/${BLOCKS} |`,
    );
  }

  console.log();
  console.log("Frozen CP4-AJ lazy + KIND-primary composition viability gates");
  console.log("| gate | candidate / AI control | limit | result |");
  console.log("| --- | ---: | ---: | --- |");

  const limits = new Map<Cell, number>([
    ["static-only-raw", 1.02],
    ["mixed-static-raw", 0.975],
    ["mixed-dynamic-raw", 1.02],
    ["trailing-dynamic-raw", 1.02],
    ["generic-dynamic-raw", 1.02],
    ["all-dynamic-raw", 1.02],
    ["static-registration", 1.02],
  ]);

  let passed = true;
  for (const spec of CELLS) {
    const control = getSummary(summaries, spec.cell, "control").median;
    const candidate = getSummary(summaries, spec.cell, "candidate").median;
    const ratio = candidate / control;
    const limit = limits.get(spec.cell)!;
    const result = ratio <= limit ? "PASS" : "FAIL";
    if (result === "FAIL") passed = false;
    console.log(
      `| ${spec.label} | ${ratio.toFixed(4)}x | <= ${limit.toFixed(4)}x | ${result} |`,
    );
  }

  console.log();
  console.log(
    `CP4-AJ LAZY-KIND COMPOSITION VIABILITY GATE: ${passed ? "PASS" : "FAIL"}`,
  );
  console.log(
    "CP4-AJ is viability-only; no production promotion is inferred from this phase.",
  );
}

function runWorker(
  cell: Cell,
  source: Source,
  workerProbeOnly: boolean,
): WorkerResult {
  const sourceRoot =
    source === "control" ? CONTROL_WORKTREE : CANDIDATE_WORKTREE;

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
    throw new Error(`CP4-AJ requires Bun ${EXPECTED_BUN}, got ${Bun.version}`);
  }
  if (Bun.revision !== EXPECTED_BUN_REVISION) {
    throw new Error(
      `CP4-AJ requires Bun revision ${EXPECTED_BUN_REVISION}, got ${Bun.revision}`,
    );
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty !== "") {
    throw new Error(`CP4-AJ requires a clean worktree:\n${dirty}`);
  }

  const changed = git([
    "diff",
    "--name-only",
    CONTROL_SOURCE,
    CANDIDATE_SOURCE,
    "--",
    "src",
  ]);
  if (changed !== "src/runtime/router.ts") {
    throw new Error(
      `candidate must differ from CP4-AI only at src/runtime/router.ts; got:\n${changed}`,
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
  if (candidateWorktreeCreated) removeWorktree(CANDIDATE_WORKTREE);
  if (controlWorktreeCreated) removeWorktree(CONTROL_WORKTREE);
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
