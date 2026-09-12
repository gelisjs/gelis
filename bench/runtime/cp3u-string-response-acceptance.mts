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
const HISTORICAL_REQUIRED_STRING_RATIO = 0.9827;
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, "cp3u-string-response-worker.mts");
const REPOSITORY_ROOT = resolve(HERE, "../..");
const BASELINE_WORKTREE = resolve(
  REPOSITORY_ROOT,
  "..",
  `gelis-cp3u-baseline-${process.pid}-${Date.now()}`,
);
const CANDIDATE_ROUTER = join(REPOSITORY_ROOT, "src/runtime/router.ts");
const CANDIDATE_RESPONSE = join(REPOSITORY_ROOT, "src/runtime/response.ts");
const BASELINE_ROUTER = join(BASELINE_WORKTREE, "src/runtime/router.ts");
const BASELINE_RESPONSE = join(BASELINE_WORKTREE, "src/runtime/response.ts");

type Cell =
  | "production-stable-current"
  | "candidate-stable-current"
  | "candidate-stable-cached-status"
  | "candidate-stable-no-status"
  | "candidate-stable-cached-no-status"
  | "production-handler-param"
  | "candidate-handler-param"
  | "candidate-handler-param-prehash"
  | "production-param-current"
  | "candidate-param-current"
  | "candidate-param-cached-status"
  | "candidate-param-no-status"
  | "candidate-param-cached-no-status"
  | "candidate-param-prehash-current"
  | "candidate-param-prehash-no-status";

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

const STABLE_GROUP: readonly Cell[] = [
  "production-stable-current",
  "candidate-stable-current",
  "candidate-stable-cached-status",
  "candidate-stable-no-status",
  "candidate-stable-cached-no-status",
];

const PARAM_GROUP: readonly Cell[] = [
  "production-handler-param",
  "candidate-handler-param",
  "candidate-handler-param-prehash",
  "production-param-current",
  "candidate-param-current",
  "candidate-param-cached-status",
  "candidate-param-no-status",
  "candidate-param-cached-no-status",
  "candidate-param-prehash-current",
  "candidate-param-prehash-no-status",
];

const ALL_CELLS: readonly Cell[] = [...STABLE_GROUP, ...PARAM_GROUP];
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
  console.log(`CP3-U CORRECTNESS PROBE: PASS (${ALL_CELLS.length}/${ALL_CELLS.length})`);
} else if (completed) {
  console.log();
  console.log("CP3-U LOCAL STRING RESPONSE DECOMPOSITION RUN: COMPLETE");
}

function printHeader(): void {
  console.log(
    "Competitive Performance v0.1 — CP3-U string response decomposition",
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
      : `Samples:        ${SAMPLES} fresh workers/cell with rotated group order`,
  );
  console.log();
}

function runProbe(): void {
  for (const cell of ALL_CELLS) {
    const result = runWorker(cell, true);
    if (!result.probeOnly || result.cell !== cell) {
      throw new Error(`Invalid probe result for ${cell}`);
    }
    console.log(`PASS ${cell}`);
  }
}

function runTiming(): void {
  const values = new Map<Cell, number[]>();
  for (const cell of ALL_CELLS) values.set(cell, []);

  runTimedGroup(STABLE_GROUP, values);
  runTimedGroup(PARAM_GROUP, values);

  const summaries = new Map<Cell, Summary>();
  for (const cell of ALL_CELLS) {
    const input = values.get(cell);
    if (input === undefined || input.length !== SAMPLES) {
      throw new Error(`Incomplete timing set for ${cell}`);
    }
    summaries.set(cell, summarize(cell, input));
  }

  printCellTable(summaries);
  printRatios(summaries);
  printAlternativeRatios(summaries);
  printLayerIncrements(summaries);
  printHistoricalRecovery(summaries);

  console.log();
  console.log(
    "CP3-U is decomposition-only: no performance acceptance threshold is applied.",
  );
}

function runTimedGroup(
  group: readonly Cell[],
  values: Map<Cell, number[]>,
): void {
  for (let sample = 0; sample < SAMPLES; sample++) {
    const offset = sample % group.length;
    const rotated = [...group.slice(offset), ...group.slice(0, offset)];
    const order = sample % 2 === 0 ? rotated : rotated.reverse();

    for (const cell of order) {
      const result = runWorker(cell, false);
      if (result.nsPerOp === null) {
        throw new Error(`Missing timing metric for ${cell}`);
      }
      values.get(cell)!.push(result.nsPerOp);
    }
  }
}

function printCellTable(summaries: Map<Cell, Summary>): void {
  console.log("String response decomposition cells");
  console.log("| cell | median ns/op | p25 | p75 | min | max |");
  console.log("| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const cell of ALL_CELLS) {
    const summary = getSummary(summaries, cell);
    console.log(
      `| ${cell} | ${summary.median.toFixed(1)} | ${summary.p25.toFixed(1)} | ${summary.p75.toFixed(1)} | ${summary.min.toFixed(1)} | ${summary.max.toFixed(1)} |`,
    );
  }
}

function printRatios(summaries: Map<Cell, Summary>): void {
  const productionStable = median(summaries, "production-stable-current");
  const productionParam = median(summaries, "production-param-current");
  const productionHandler = median(summaries, "production-handler-param");

  console.log();
  console.log("Candidate / production ratios");
  console.log("| comparison | ratio | delta ns |");
  console.log("| --- | ---: | ---: |");

  for (const cell of [
    "candidate-stable-current",
    "candidate-stable-cached-status",
    "candidate-stable-no-status",
    "candidate-stable-cached-no-status",
  ] as const) {
    printRatioRow(summaries, cell, productionStable);
  }

  printRatioRow(summaries, "candidate-handler-param", productionHandler);
  printRatioRow(summaries, "candidate-handler-param-prehash", productionHandler);

  for (const cell of [
    "candidate-param-current",
    "candidate-param-cached-status",
    "candidate-param-no-status",
    "candidate-param-cached-no-status",
    "candidate-param-prehash-current",
    "candidate-param-prehash-no-status",
  ] as const) {
    printRatioRow(summaries, cell, productionParam);
  }
}

function printAlternativeRatios(summaries: Map<Cell, Summary>): void {
  const stableCurrent = median(summaries, "candidate-stable-current");
  const paramCurrent = median(summaries, "candidate-param-current");

  console.log();
  console.log("Alternative / candidate-current ratios");
  console.log("| comparison | ratio | delta ns |");
  console.log("| --- | ---: | ---: |");

  for (const cell of [
    "candidate-stable-cached-status",
    "candidate-stable-no-status",
    "candidate-stable-cached-no-status",
  ] as const) {
    printRatioRow(summaries, cell, stableCurrent);
  }

  for (const cell of [
    "candidate-param-cached-status",
    "candidate-param-no-status",
    "candidate-param-cached-no-status",
    "candidate-param-prehash-current",
    "candidate-param-prehash-no-status",
  ] as const) {
    printRatioRow(summaries, cell, paramCurrent);
  }
}

function printLayerIncrements(summaries: Map<Cell, Summary>): void {
  const productionHandler = median(summaries, "production-handler-param");
  const candidateHandler = median(summaries, "candidate-handler-param");
  const prehashHandler = median(summaries, "candidate-handler-param-prehash");

  console.log();
  console.log("Parameter response-construction increments");
  console.log("| response path | increment above matching handler | delta vs candidate current increment |");
  console.log("| --- | ---: | ---: |");

  const candidateCurrentIncrement =
    median(summaries, "candidate-param-current") - candidateHandler;

  printIncrementRow(
    "production current",
    median(summaries, "production-param-current") - productionHandler,
    candidateCurrentIncrement,
  );
  printIncrementRow(
    "candidate current",
    candidateCurrentIncrement,
    candidateCurrentIncrement,
  );
  printIncrementRow(
    "candidate cached status",
    median(summaries, "candidate-param-cached-status") - candidateHandler,
    candidateCurrentIncrement,
  );
  printIncrementRow(
    "candidate no status",
    median(summaries, "candidate-param-no-status") - candidateHandler,
    candidateCurrentIncrement,
  );
  printIncrementRow(
    "candidate cached no status",
    median(summaries, "candidate-param-cached-no-status") - candidateHandler,
    candidateCurrentIncrement,
  );
  printIncrementRow(
    "candidate prehash current",
    median(summaries, "candidate-param-prehash-current") - prehashHandler,
    candidateCurrentIncrement,
  );
  printIncrementRow(
    "candidate prehash no status",
    median(summaries, "candidate-param-prehash-no-status") - prehashHandler,
    candidateCurrentIncrement,
  );

  console.log();
  console.log("Legacy prefix prehash diagnostics");
  console.log("| diagnostic | value |");
  console.log("| --- | ---: |");
  console.log(
    `| prehash handler overhead | ${(prehashHandler - candidateHandler).toFixed(1)} ns |`,
  );
  const prehashCurrentIncrement =
    median(summaries, "candidate-param-prehash-current") - prehashHandler;
  console.log(
    `| prehash current normalization change | ${(prehashCurrentIncrement - candidateCurrentIncrement).toFixed(1)} ns |`,
  );
}

function printHistoricalRecovery(summaries: Map<Cell, Summary>): void {
  const productionParam = median(summaries, "production-param-current");

  console.log();
  console.log("Historical CP3-S recovery diagnostic (not a CP3-U gate)");
  console.log(
    `String ratio needed with CP3-S JSON held at 0.9773x: <= ${HISTORICAL_REQUIRED_STRING_RATIO.toFixed(4)}x`,
  );
  console.log("| candidate param pipeline | ratio vs production current | meets <= 0.9827x? |");
  console.log("| --- | ---: | --- |");

  for (const cell of [
    "candidate-param-current",
    "candidate-param-cached-status",
    "candidate-param-no-status",
    "candidate-param-cached-no-status",
    "candidate-param-prehash-current",
    "candidate-param-prehash-no-status",
  ] as const) {
    const ratio = median(summaries, cell) / productionParam;
    console.log(
      `| ${cell} | ${ratio.toFixed(4)}x | ${ratio <= HISTORICAL_REQUIRED_STRING_RATIO ? "YES" : "NO"} |`,
    );
  }
}

function printRatioRow(
  summaries: Map<Cell, Summary>,
  cell: Cell,
  baseline: number,
): void {
  const value = median(summaries, cell);
  console.log(
    `| ${cell} | ${(value / baseline).toFixed(4)}x | ${(value - baseline).toFixed(1)} |`,
  );
}

function printIncrementRow(
  label: string,
  increment: number,
  candidateCurrentIncrement: number,
): void {
  console.log(
    `| ${label} | ${increment.toFixed(1)} ns | ${(increment - candidateCurrentIncrement).toFixed(1)} ns |`,
  );
}

function runWorker(cell: Cell, workerProbeOnly: boolean): WorkerResult {
  const production = cell.startsWith("production-");
  const routerPath = production ? BASELINE_ROUTER : CANDIDATE_ROUTER;
  const responsePath = production ? BASELINE_RESPONSE : CANDIDATE_RESPONSE;

  const result = spawnSync(
    process.execPath,
    [
      WORKER,
      `--cell=${cell}`,
      `--router-path=${routerPath}`,
      `--response-path=${responsePath}`,
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
    throw new Error(`Worker identity mismatch for ${cell}`);
  }
  return parsed;
}

function preflight(): void {
  if (Bun.version !== EXPECTED_BUN) {
    throw new Error(`CP3-U requires Bun ${EXPECTED_BUN}, got ${Bun.version}`);
  }
  if (Bun.revision !== EXPECTED_BUN_REVISION) {
    throw new Error(
      `CP3-U requires Bun revision ${EXPECTED_BUN_REVISION}, got ${Bun.revision}`,
    );
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty !== "") {
    throw new Error(`CP3-U requires a clean worktree:\n${dirty}`);
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
    throw new Error(`Failed to create CP3-U baseline worktree:\n${result.stderr}`);
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
      `Failed to remove CP3-U baseline worktree:\n${remove.stderr}`,
    );
  }

  const prune = spawnSync("git", ["-C", REPOSITORY_ROOT, "worktree", "prune"], {
    encoding: "utf8",
  });
  if (prune.status !== 0) {
    throw new Error(`Failed to prune worktrees:\n${prune.stderr}`);
  }

  const list = git(["worktree", "list", "--porcelain"]);
  if (list.includes(BASELINE_WORKTREE)) {
    throw new Error("CP3-U baseline worktree remained after cleanup");
  }
}

function summarize(cell: Cell, input: readonly number[]): Summary {
  const sorted = [...input].sort((left, right) => left - right);
  return {
    cell,
    median: quantile(sorted, 0.5),
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
    min: sorted[0]!,
    max: sorted.at(-1)!,
  };
}

function getSummary(summaries: Map<Cell, Summary>, cell: Cell): Summary {
  const summary = summaries.get(cell);
  if (summary === undefined) {
    throw new Error(`Missing summary for ${cell}`);
  }
  return summary;
}

function median(summaries: Map<Cell, Summary>, cell: Cell): number {
  return getSummary(summaries, cell).median;
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
