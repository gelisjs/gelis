import { spawnSync } from "node:child_process";
import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_BUN = "1.4.2";
const EXPECTED_BUN_REVISION = "744846f844374847c902b5e7fd59b4342a51ef99";
const PRODUCTION_SOURCE = "8e43aad09759d60378b3fc174292850057ccfba3";
const CANDIDATE_SOURCE = "77168cea5056c50bd7188b2dace17f72f7a01514";
const ROUTES = 5_000;
const SAMPLES = 11;
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, "cp3t-pipeline-translation-worker.mts");
const REPOSITORY_ROOT = resolve(HERE, "../..");
const BASELINE_WORKTREE = resolve(
  REPOSITORY_ROOT,
  "..",
  `gelis-cp3t-baseline-${process.pid}-${Date.now()}`,
);
const CANDIDATE_ROUTER = join(REPOSITORY_ROOT, "src/runtime/router.ts");
const BASELINE_ROUTER = join(BASELINE_WORKTREE, "src/runtime/router.ts");

type Variant = "production" | "candidate";
type Cell =
  | "router-dynamic"
  | "handler-string-stable"
  | "handler-string-param"
  | "handler-json-stable"
  | "handler-json-param"
  | "pipeline-string-stable"
  | "pipeline-string-param"
  | "pipeline-json-stable"
  | "pipeline-json-param";

interface Pair {
  readonly cell: Cell;
  readonly label: string;
}

interface WorkerResult {
  readonly cell: Cell;
  readonly variant: Variant;
  readonly probeOnly: boolean;
  readonly nsPerOp: number | null;
  readonly iterations: number;
  readonly warmups: number;
  readonly sink: number;
}

interface Summary {
  readonly cell: Cell;
  readonly variant: Variant;
  readonly median: number;
  readonly p25: number;
  readonly p75: number;
  readonly min: number;
  readonly max: number;
}

const PAIRS: readonly Pair[] = [
  { cell: "router-dynamic", label: "router dynamic" },
  { cell: "handler-string-stable", label: "handler string stable" },
  { cell: "handler-string-param", label: "handler string param" },
  { cell: "handler-json-stable", label: "handler JSON stable" },
  { cell: "handler-json-param", label: "handler JSON param" },
  { cell: "pipeline-string-stable", label: "pipeline string stable" },
  { cell: "pipeline-string-param", label: "pipeline string param" },
  { cell: "pipeline-json-stable", label: "pipeline JSON stable" },
  { cell: "pipeline-json-param", label: "pipeline JSON param" },
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
  console.log(
    `CP3-T CORRECTNESS PROBE: PASS (${PAIRS.length * 2}/${PAIRS.length * 2})`,
  );
} else if (completed) {
  console.log();
  console.log("CP3-T LOCAL PIPELINE TRANSLATION RUN: COMPLETE");
}

function printHeader(): void {
  console.log(
    "Competitive Performance v0.1 — CP3-T pipeline translation decomposition",
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
        if (result.nsPerOp === null) {
          throw new Error(`Missing timing metric for ${variant} ${pair.cell}`);
        }
        values.get(key(pair.cell, variant))!.push(result.nsPerOp);
      }
    }
  }

  const summaries = new Map<string, Summary>();
  for (const pair of PAIRS) {
    for (const variant of ["production", "candidate"] as const) {
      const input = values.get(key(pair.cell, variant));
      if (input === undefined || input.length !== SAMPLES) {
        throw new Error(`Incomplete timing set for ${variant} ${pair.cell}`);
      }
      summaries.set(
        key(pair.cell, variant),
        summarize(pair.cell, variant, input),
      );
    }
  }

  console.log("Pipeline translation cells");
  console.log("| cell | variant | median ns/op | p25 | p75 | min | max |");
  console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: |");
  for (const pair of PAIRS) {
    for (const variant of ["production", "candidate"] as const) {
      const summary = getSummary(summaries, pair.cell, variant);
      console.log(
        `| ${pair.cell} | ${variant} | ${summary.median.toFixed(1)} | ${summary.p25.toFixed(1)} | ${summary.p75.toFixed(1)} | ${summary.min.toFixed(1)} | ${summary.max.toFixed(1)} |`,
      );
    }
  }

  console.log();
  console.log("Candidate / production ratios");
  console.log("| comparison | ratio | candidate advantage |");
  console.log("| --- | ---: | ---: |");
  for (const pair of PAIRS) {
    const production = getSummary(summaries, pair.cell, "production");
    const candidate = getSummary(summaries, pair.cell, "candidate");
    console.log(
      `| ${pair.label} | ${(candidate.median / production.median).toFixed(4)}x | ${(production.median - candidate.median).toFixed(1)} ns |`,
    );
  }

  console.log();
  console.log("Per-variant layer increments");
  console.log("| layer increment | production | candidate | candidate - production |");
  console.log("| --- | ---: | ---: | ---: |");
  printIncrement(
    summaries,
    "handler stable string - router",
    "router-dynamic",
    "handler-string-stable",
  );
  printIncrement(
    summaries,
    "handler param string - handler stable string",
    "handler-string-stable",
    "handler-string-param",
  );
  printIncrement(
    summaries,
    "handler stable JSON - router",
    "router-dynamic",
    "handler-json-stable",
  );
  printIncrement(
    summaries,
    "handler param JSON - handler stable JSON",
    "handler-json-stable",
    "handler-json-param",
  );
  printIncrement(
    summaries,
    "normalize stable string",
    "handler-string-stable",
    "pipeline-string-stable",
  );
  printIncrement(
    summaries,
    "normalize param string",
    "handler-string-param",
    "pipeline-string-param",
  );
  printIncrement(
    summaries,
    "normalize stable JSON",
    "handler-json-stable",
    "pipeline-json-stable",
  );
  printIncrement(
    summaries,
    "normalize param JSON",
    "handler-json-param",
    "pipeline-json-param",
  );

  const routerAdvantage = advantage(summaries, "router-dynamic");

  console.log();
  console.log("Router-win translation diagnostics");
  console.log("| boundary | candidate advantage | retained vs router win |");
  console.log("| --- | ---: | ---: |");
  for (const cell of [
    "handler-string-stable",
    "handler-string-param",
    "handler-json-stable",
    "handler-json-param",
    "pipeline-string-stable",
    "pipeline-string-param",
    "pipeline-json-stable",
    "pipeline-json-param",
  ] as const) {
    const cellAdvantage = advantage(summaries, cell);
    const retention =
      routerAdvantage === 0 ? "n/a" : `${(cellAdvantage / routerAdvantage).toFixed(4)}x`;
    console.log(
      `| ${cell} | ${cellAdvantage.toFixed(1)} ns | ${retention} |`,
    );
  }

  console.log();
  console.log(
    "CP3-T is decomposition-only: no performance acceptance threshold is applied.",
  );
}

function printIncrement(
  summaries: Map<string, Summary>,
  label: string,
  lower: Cell,
  upper: Cell,
): void {
  const production =
    getSummary(summaries, upper, "production").median -
    getSummary(summaries, lower, "production").median;
  const candidate =
    getSummary(summaries, upper, "candidate").median -
    getSummary(summaries, lower, "candidate").median;
  console.log(
    `| ${label} | ${production.toFixed(1)} ns | ${candidate.toFixed(1)} ns | ${(candidate - production).toFixed(1)} ns |`,
  );
}

function advantage(summaries: Map<string, Summary>, cell: Cell): number {
  return (
    getSummary(summaries, cell, "production").median -
    getSummary(summaries, cell, "candidate").median
  );
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
    throw new Error(`CP3-T requires Bun ${EXPECTED_BUN}, got ${Bun.version}`);
  }
  if (Bun.revision !== EXPECTED_BUN_REVISION) {
    throw new Error(
      `CP3-T requires Bun revision ${EXPECTED_BUN_REVISION}, got ${Bun.revision}`,
    );
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty !== "") {
    throw new Error(`CP3-T requires a clean worktree:\n${dirty}`);
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
    [
      "-C",
      REPOSITORY_ROOT,
      "merge-base",
      "--is-ancestor",
      CANDIDATE_SOURCE,
      "HEAD",
    ],
    { encoding: "utf8" },
  );
  if (candidateAncestor.status !== 0) {
    throw new Error(
      `Candidate source ${CANDIDATE_SOURCE} is not an ancestor of HEAD`,
    );
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
    throw new Error(
      `Failed to remove CP3-T baseline worktree:\n${remove.stderr}`,
    );
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
    throw new Error("CP3-T baseline worktree remained after cleanup");
  }
}

function summarize(
  cell: Cell,
  variant: Variant,
  input: readonly number[],
): Summary {
  const sorted = [...input].sort((left, right) => left - right);
  return {
    cell,
    variant,
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

function quantile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) throw new Error("Cannot summarize empty sample");
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = sorted[lower]!;
  const upperValue = sorted[upper]!;
  if (lower === upper) return lowerValue;
  return lowerValue + (upperValue - lowerValue) * (position - lower);
}

function key(cell: Cell, variant: Variant): string {
  return `${cell}:${variant}`;
}

function git(args: readonly string[]): string {
  return gitAt(REPOSITORY_ROOT, args);
}

function gitAt(cwd: string, args: readonly string[]): string {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  return result.stdout.trim();
}
