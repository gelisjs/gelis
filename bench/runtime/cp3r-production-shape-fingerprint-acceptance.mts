import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const EXPECTED_BUN = "1.4.2";
const EXPECTED_BUN_REVISION = "744846f844374847c902b5e7fd59b4342a51ef99";
const PRODUCTION_SOURCE = "8e43aad09759d60378b3fc174292850057ccfba3";
const CANDIDATE_SOURCE = "bda7c0668c38b45bb37afaea72f0b923eb37d64b";
const ROUTES = 5_000;
const SAMPLES = 11;
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, "cp3r-production-shape-fingerprint-worker.mts");
const REPOSITORY_ROOT = resolve(HERE, "../..");
const BASELINE_WORKTREE = resolve(
  REPOSITORY_ROOT,
  "..",
  `gelis-cp3r-baseline-${process.pid}-${Date.now()}`,
);
const CANDIDATE_ROUTER = join(REPOSITORY_ROOT, "src/runtime/router.ts");
const BASELINE_ROUTER = join(BASELINE_WORKTREE, "src/runtime/router.ts");

type Variant = "production" | "candidate";
type Cell =
  | "mixed-static-request"
  | "mixed-dynamic-request"
  | "generic-dynamic-request"
  | "pipeline-string"
  | "pipeline-json"
  | "collision-request"
  | "registration-trailing"
  | "memory-trailing";

type Unit = "ns/op" | "ms" | "bytes";

interface Pair {
  readonly cell: Cell;
  readonly label: string;
}

interface WorkerResult {
  readonly cell: Cell;
  readonly variant: Variant;
  readonly probeOnly: boolean;
  readonly metric: number | null;
  readonly unit: Unit;
  readonly iterations: number;
  readonly warmups: number;
  readonly sink: number;
}

interface Summary {
  readonly cell: Cell;
  readonly variant: Variant;
  readonly unit: Unit;
  readonly median: number;
  readonly p25: number;
  readonly p75: number;
  readonly min: number;
  readonly max: number;
}

const PAIRS: readonly Pair[] = [
  { cell: "mixed-static-request", label: "mixed static request" },
  { cell: "mixed-dynamic-request", label: "mixed trailing dynamic request" },
  { cell: "generic-dynamic-request", label: "generic multi-param dynamic request" },
  { cell: "pipeline-string", label: "string pipeline" },
  { cell: "pipeline-json", label: "JSON pipeline" },
  { cell: "collision-request", label: "forced fingerprint collision" },
  { cell: "registration-trailing", label: "trailing registration" },
  { cell: "memory-trailing", label: "retained router heap delta" },
];

const probeOnly = process.argv.includes("--probe-only");
const harnessSha = git(["rev-parse", "HEAD"]);
const cpu = cpus()[0]?.model ?? "unknown";

preflight();
createBaselineWorktree();

let completed = false;
let probeCompleted = false;

try {
  printHeader();

  if (probeOnly) {
    runProbe();
    probeCompleted = true;
  } else {
    runTiming();
    completed = true;
  }
} finally {
  cleanupBaselineWorktree();
}

if (probeCompleted) {
  console.log();
  console.log(`CP3-R CORRECTNESS PROBE: PASS (${PAIRS.length * 2}/${PAIRS.length * 2})`);
} else if (completed) {
  console.log();
  console.log("CP3-R LOCAL PRODUCTION-SHAPE FINGERPRINT RUN: COMPLETE");
}

function printHeader(): void {
  console.log(
    "Competitive Performance v0.1 — CP3-R production-shape fingerprint candidate",
  );
  console.log(`Bun:            ${Bun.version}`);
  console.log(`Revision:       ${Bun.revision}`);
  console.log(`CPU:            ${cpu}`);
  console.log(`Harness SHA:    ${harnessSha}`);
  console.log(`Production src: ${PRODUCTION_SOURCE}`);
  console.log(`Candidate src:  ${CANDIDATE_SOURCE}`);
  console.log(`Routes:         ${ROUTES.toLocaleString("en-US")}`);
  console.log(
    probeOnly
      ? "Mode:           correctness probe only"
      : `Samples:        ${SAMPLES} mirrored fresh-worker pairs/cell pair`,
  );
  console.log();
}

function runProbe(): void {
  for (const pair of PAIRS) {
    for (const variant of ["production", "candidate"] as const) {
      const result = runWorker(pair.cell, variant, true);
      if (
        !result.probeOnly ||
        result.cell !== pair.cell ||
        result.variant !== variant
      ) {
        throw new Error(`Invalid probe result for ${variant} ${pair.cell}`);
      }
      console.log(`PASS ${variant}-${pair.cell}`);
    }
  }
}

function runTiming(): void {
  const values = new Map<string, number[]>();
  const units = new Map<Cell, Unit>();

  for (const pair of PAIRS) {
    values.set(key(pair.cell, "production"), []);
    values.set(key(pair.cell, "candidate"), []);

    for (let sample = 0; sample < SAMPLES; sample++) {
      const candidateFirst = sample % 2 === 1;
      const order: readonly Variant[] = candidateFirst
        ? ["candidate", "production"]
        : ["production", "candidate"];

      for (const variant of order) {
        const result = runWorker(pair.cell, variant, false);
        if (result.metric === null) {
          throw new Error(`Missing timing metric for ${variant} ${pair.cell}`);
        }
        const knownUnit = units.get(pair.cell);
        if (knownUnit !== undefined && knownUnit !== result.unit) {
          throw new Error(`Unit mismatch for ${pair.cell}`);
        }
        units.set(pair.cell, result.unit);
        values.get(key(pair.cell, variant))!.push(result.metric);
      }
    }
  }

  const summaries = new Map<string, Summary>();
  for (const pair of PAIRS) {
    const unit = units.get(pair.cell);
    if (unit === undefined) throw new Error(`Missing unit for ${pair.cell}`);
    for (const variant of ["production", "candidate"] as const) {
      const input = values.get(key(pair.cell, variant));
      if (input === undefined || input.length !== SAMPLES) {
        throw new Error(`Incomplete timing set for ${variant} ${pair.cell}`);
      }
      summaries.set(
        key(pair.cell, variant),
        summarize(pair.cell, variant, unit, input),
      );
    }
  }

  console.log("Production vs candidate cells");
  console.log("| cell | variant | median | p25 | p75 | min | max | unit |");
  console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const pair of PAIRS) {
    for (const variant of ["production", "candidate"] as const) {
      const summary = getSummary(summaries, pair.cell, variant);
      console.log(
        `| ${pair.cell} | ${variant} | ${formatMetric(summary.median, summary.unit)} | ${formatMetric(summary.p25, summary.unit)} | ${formatMetric(summary.p75, summary.unit)} | ${formatMetric(summary.min, summary.unit)} | ${formatMetric(summary.max, summary.unit)} | ${summary.unit} |`,
      );
    }
  }

  console.log();
  console.log("Candidate / production ratios");
  console.log("| comparison | ratio | delta |");
  console.log("| --- | ---: | ---: |");
  for (const pair of PAIRS) {
    const production = getSummary(summaries, pair.cell, "production");
    const candidate = getSummary(summaries, pair.cell, "candidate");
    console.log(
      `| ${pair.label} | ${(candidate.median / production.median).toFixed(4)}x | ${formatDelta(candidate.median - production.median, candidate.unit)} |`,
    );
  }

  const staticRatio = ratio(summaries, "mixed-static-request");
  const dynamicRatio = ratio(summaries, "mixed-dynamic-request");
  const genericRatio = ratio(summaries, "generic-dynamic-request");
  const stringRatio = ratio(summaries, "pipeline-string");
  const jsonRatio = ratio(summaries, "pipeline-json");
  const pipelineGeomean = Math.sqrt(stringRatio * jsonRatio);
  const collisionRatio = ratio(summaries, "collision-request");
  const registrationRatio = ratio(summaries, "registration-trailing");
  const memoryRatio = ratio(summaries, "memory-trailing");

  const gates = [
    { label: "mixed static request", value: staticRatio, limit: 1.02 },
    { label: "mixed trailing dynamic request", value: dynamicRatio, limit: 0.9 },
    { label: "generic multi-param dynamic request", value: genericRatio, limit: 1.03 },
    { label: "pipeline geomean", value: pipelineGeomean, limit: 0.98 },
    { label: "forced-collision fallback", value: collisionRatio, limit: 1.15 },
    { label: "trailing-route registration", value: registrationRatio, limit: 1.75 },
    { label: "retained router heap delta", value: memoryRatio, limit: 1.5 },
  ] as const;

  let passed = true;
  console.log();
  console.log("Frozen CP3-R candidate gates");
  console.log("| gate | candidate/production | limit | result |");
  console.log("| --- | ---: | ---: | --- |");
  for (const gate of gates) {
    const result = gate.value <= gate.limit ? "PASS" : "FAIL";
    if (result === "FAIL") passed = false;
    console.log(
      `| ${gate.label} | ${gate.value.toFixed(4)}x | <= ${gate.limit.toFixed(4)}x | ${result} |`,
    );
  }

  console.log();
  console.log(`CP3-R PRODUCTION-SHAPE FINGERPRINT GATE: ${passed ? "PASS" : "FAIL"}`);
}

function runWorker(
  cell: Cell,
  variant: Variant,
  workerProbeOnly: boolean,
): WorkerResult {
  const routerPath =
    variant === "production" ? BASELINE_ROUTER : CANDIDATE_ROUTER;
  const result = spawnSync(
    process.execPath,
    [
      WORKER,
      `--cell=${cell}`,
      `--variant=${variant}`,
      `--router-path=${routerPath}`,
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
      `Worker failed for ${variant} ${cell}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }

  const line = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (line === undefined) {
    throw new Error(`Worker emitted no result for ${variant} ${cell}`);
  }
  const parsed = JSON.parse(line) as WorkerResult;
  if (parsed.cell !== cell || parsed.variant !== variant) {
    throw new Error(`Worker identity mismatch for ${variant} ${cell}`);
  }
  return parsed;
}

function preflight(): void {
  if (Bun.version !== EXPECTED_BUN) {
    throw new Error(`CP3-R requires Bun ${EXPECTED_BUN}, got ${Bun.version}`);
  }
  if (Bun.revision !== EXPECTED_BUN_REVISION) {
    throw new Error(
      `CP3-R requires Bun revision ${EXPECTED_BUN_REVISION}, got ${Bun.revision}`,
    );
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty !== "") {
    throw new Error(`CP3-R requires a clean worktree:\n${dirty}`);
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
    ],
    { encoding: "utf8" },
  );
  if (sourceDiff.status !== 0) {
    throw new Error(`src/** differs from frozen candidate ${CANDIDATE_SOURCE}`);
  }

  const candidateAncestor = spawnSync(
    "git",
    ["-C", REPOSITORY_ROOT, "merge-base", "--is-ancestor", CANDIDATE_SOURCE, "HEAD"],
    { encoding: "utf8" },
  );
  if (candidateAncestor.status !== 0) {
    throw new Error(`Candidate source ${CANDIDATE_SOURCE} is not an ancestor of HEAD`);
  }
}

function createBaselineWorktree(): void {
  const result = spawnSync(
    "git",
    [
      "-C",
      REPOSITORY_ROOT,
      "worktree",
      "add",
      "--detach",
      BASELINE_WORKTREE,
      PRODUCTION_SOURCE,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`Failed to create baseline worktree:\n${result.stderr}`);
  }
  const head = gitAt(BASELINE_WORKTREE, ["rev-parse", "HEAD"]);
  if (head !== PRODUCTION_SOURCE) {
    throw new Error(`Baseline worktree SHA mismatch: ${head}`);
  }
}

function cleanupBaselineWorktree(): void {
  const remove = spawnSync(
    "git",
    ["-C", REPOSITORY_ROOT, "worktree", "remove", BASELINE_WORKTREE],
    { encoding: "utf8" },
  );
  if (remove.status !== 0) {
    throw new Error(`Failed to remove CP3-R baseline worktree:\n${remove.stderr}`);
  }

  const prune = spawnSync(
    "git",
    ["-C", REPOSITORY_ROOT, "worktree", "prune"],
    { encoding: "utf8" },
  );
  if (prune.status !== 0) {
    throw new Error(`Failed to prune worktrees:\n${prune.stderr}`);
  }

  const list = git(["worktree", "list", "--porcelain"]);
  if (list.includes(BASELINE_WORKTREE)) {
    throw new Error("CP3-R baseline worktree remained after cleanup");
  }
}

function summarize(
  cell: Cell,
  variant: Variant,
  unit: Unit,
  input: readonly number[],
): Summary {
  const sorted = [...input].sort((left, right) => left - right);
  return {
    cell,
    variant,
    unit,
    median: quantile(sorted, 0.5),
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
    min: sorted[0]!,
    max: sorted.at(-1)!,
  };
}

function getSummary(
  summaries: Map<string, Summary>,
  cell: Cell,
  variant: Variant,
): Summary {
  const summary = summaries.get(key(cell, variant));
  if (summary === undefined) {
    throw new Error(`Missing summary for ${variant} ${cell}`);
  }
  return summary;
}

function ratio(summaries: Map<string, Summary>, cell: Cell): number {
  return (
    getSummary(summaries, cell, "candidate").median /
    getSummary(summaries, cell, "production").median
  );
}

function key(cell: Cell, variant: Variant): string {
  return `${variant}:${cell}`;
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
  if (unit === "bytes") return Math.round(value).toLocaleString("en-US");
  return value.toFixed(unit === "ms" ? 3 : 1);
}

function formatDelta(value: number, unit: Unit): string {
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${formatMetric(value, unit)} ${unit}`;
}

function git(args: readonly string[]): string {
  return gitAt(REPOSITORY_ROOT, args);
}

function gitAt(cwd: string, args: readonly string[]): string {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}
