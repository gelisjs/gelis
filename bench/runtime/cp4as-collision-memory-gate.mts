import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_BUN = "1.4.2";
const EXPECTED_BUN_REVISION = "744846f844374847c902b5e7fd59b4342a51ef99";
const PRODUCTION = "5d9698d6b8d368ddcff358fc2645435b93c0c062";
const CANDIDATE = "dd25f4ada6ceef68460efb0845fea45c238c49cf";
const ROUTES = 5_000;
const BLOCKS = 8;
const PAIRS_PER_BLOCK = 4;
const SAMPLES_PER_SOURCE = BLOCKS * PAIRS_PER_BLOCK;
const RETAINED_ROUTERS = 32;
const BOOTSTRAP_REPS = 5_000;
const EXPECTED_LOCAL_LOGICAL_CPUS = 12;
const CALIBRATION_BIAS_LIMIT = 0.01;
const CALIBRATION_CI_LOW = 0.985;
const CALIBRATION_CI_HIGH = 1.015;
const CALIBRATION_ORDER_SPREAD_LIMIT = 0.01;
const CALIBRATION_BLOCK_DEVIATION_LIMIT = 0.02;
const MEMORY_REGRESSION_LIMIT = 1.05;
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = resolve(HERE, "cp4ar-collision-memory-gate-worker.mts");
const REPOSITORY_ROOT = resolve(HERE, "../..");
const RUN_TOKEN = `${process.pid}-${Date.now()}`;

type SourceLabel = "a" | "b";
type Order = "a-b" | "b-a";
type Mode = "probe" | "calibration" | "candidate";
type CandidateDecision = "PASS" | "HOLD / INCONCLUSIVE" | "FAIL";

interface WorkerResult {
  readonly source: SourceLabel;
  readonly probeOnly: boolean;
  readonly metric: number | null;
  readonly unit: "bytes/router";
  readonly retainedRouters: number;
  readonly sink: number;
}

interface PairResult {
  readonly block: number;
  readonly order: Order;
  readonly a: number;
  readonly b: number;
}

interface Diagnostics {
  readonly ratio: number;
  readonly bootstrapLow: number;
  readonly bootstrapHigh: number;
  readonly orderABRatio: number;
  readonly orderBARatio: number;
  readonly orderSpread: number;
  readonly blockRatios: readonly number[];
  readonly maxBlockDeviation: number;
}

const probeOnly = process.argv.includes("--probe-only");
const calibration = process.argv.includes("--calibrate");
if (probeOnly && calibration) {
  throw new Error("Choose either --probe-only or --calibrate, not both");
}
const mode: Mode = probeOnly
  ? "probe"
  : calibration
    ? "calibration"
    : "candidate";
const sourceA = PRODUCTION;
const sourceB = calibration ? PRODUCTION : CANDIDATE;
const harnessSha = git(["rev-parse", "HEAD"]);
const cpu = cpus()[0]?.model ?? "unknown";
const logicalCpuCount = cpus().length;
const affinityLogicalCpu = Math.max(0, logicalCpuCount - 2);
const affinityMaskHex = (1n << BigInt(affinityLogicalCpu)).toString(16);
const worktreeA = resolve(
  REPOSITORY_ROOT,
  "..",
  `gelis-cp4ar-memory-a-${RUN_TOKEN}`,
);
const worktreeB = resolve(
  REPOSITORY_ROOT,
  "..",
  `gelis-cp4ar-memory-b-${RUN_TOKEN}`,
);
let worktreeACreated = false;
let worktreeBCreated = false;
let completed = false;
let workerResultSequence = 0;

preflight();

try {
  createWorktree(worktreeA, sourceA);
  worktreeACreated = true;
  createWorktree(worktreeB, sourceB);
  worktreeBCreated = true;

  printHeader();
  if (probeOnly) {
    runProbe();
  } else {
    runTiming();
    completed = true;
  }
} finally {
  cleanupWorktrees();
}

if (probeOnly) {
  console.log();
  console.log("CP4-AS COLLISION-MEMORY CORRECTNESS PROBE: PASS (2/2)");
} else if (completed && calibration) {
  console.log();
  console.log("CP4-AS COLLISION-MEMORY CALIBRATION RUN: COMPLETE");
} else if (completed) {
  console.log();
  console.log("CP4-AS COLLISION-MEMORY CANDIDATE RUN: COMPLETE");
}

function printHeader(): void {
  console.log("Competitive Performance v0.1 — CP4-AS collision-memory gate");
  console.log(`Bun:             ${Bun.version}`);
  console.log(`Revision:        ${Bun.revision}`);
  console.log(`CPU:             ${cpu}`);
  console.log(`Logical CPUs:    ${logicalCpuCount}`);
  console.log(`Harness SHA:     ${harnessSha}`);
  console.log(`Mode:            ${mode}`);
  console.log(`Source A:        ${sourceA}`);
  console.log(`Source B:        ${sourceB}`);
  console.log(
    `Routes:          ${ROUTES.toLocaleString("en-US")} forced-collision trailing routes`,
  );

  if (!probeOnly) {
    console.log(`Blocks:          ${BLOCKS}`);
    console.log(`Pairs/block:     ${PAIRS_PER_BLOCK}`);
    console.log(
      `Samples/source:  ${SAMPLES_PER_SOURCE} fresh-worker measurements`,
    );
    console.log("Order:           2 A→B + 2 B→A pairs per block");
    console.log(`Retained routers/sample: ${RETAINED_ROUTERS}`);
    console.log("Metric:          retained heap bytes/router");
    console.log(
      `Windows affinity: logical CPU ${affinityLogicalCpu} (0x${affinityMaskHex})`,
    );
    console.log("Worker priority: HIGH");
    console.log(
      `Bootstrap:       ${BOOTSTRAP_REPS.toLocaleString("en-US")} deterministic block resamples`,
    );
  }
  console.log();
}

function runProbe(): void {
  const a = runWorker("a", true);
  const b = runWorker("b", true);
  if (!a.probeOnly || !b.probeOnly) {
    throw new Error("invalid collision-memory probe result");
  }
  console.log("PASS a-collision-memory");
  console.log("PASS b-collision-memory");
}

function runTiming(): void {
  const pairs: PairResult[] = [];

  for (let block = 0; block < BLOCKS; block++) {
    console.log(`PROGRESS collision-memory block ${block + 1}/${BLOCKS}`);
    for (let pair = 0; pair < PAIRS_PER_BLOCK; pair++) {
      const order: Order = pair % 2 === 0 ? "a-b" : "b-a";
      const first: SourceLabel = order === "a-b" ? "a" : "b";
      const second: SourceLabel = order === "a-b" ? "b" : "a";
      const firstResult = runWorker(first, false);
      const secondResult = runWorker(second, false);
      if (firstResult.metric === null || secondResult.metric === null) {
        throw new Error("missing collision-memory metric");
      }
      if (firstResult.unit !== secondResult.unit) {
        throw new Error("collision-memory unit mismatch");
      }
      const a = first === "a" ? firstResult.metric : secondResult.metric;
      const b = first === "b" ? firstResult.metric : secondResult.metric;
      pairs.push({ block, order, a, b });
    }
  }

  if (pairs.length !== SAMPLES_PER_SOURCE) {
    throw new Error(`incomplete pair set: ${pairs.length}`);
  }

  printAbsoluteMetrics(pairs);
  const diagnostics = buildDiagnostics(pairs);
  printDiagnostics(diagnostics);
  printBlocks(diagnostics);
  if (calibration) {
    printCalibrationDecision(diagnostics);
  } else {
    printCandidateDecision(diagnostics);
  }
}

function printAbsoluteMetrics(pairs: readonly PairResult[]): void {
  console.log("Collision-memory absolute metrics");
  console.log("| source | median | p25 | p75 | min | max | unit |");
  console.log("| --- | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const source of ["a", "b"] as const) {
    const values = pairs.map((pair) => (source === "a" ? pair.a : pair.b));
    const sorted = [...values].sort((a, b) => a - b);
    console.log(
      `| ${source} | ${median(values).toFixed(1)} | ${percentileSorted(sorted, 0.25).toFixed(1)} | ${percentileSorted(sorted, 0.75).toFixed(1)} | ${Math.min(...values).toFixed(1)} | ${Math.max(...values).toFixed(1)} | bytes/router |`,
    );
  }
}

function buildDiagnostics(pairs: readonly PairResult[]): Diagnostics {
  const ratio = ratioOfMedians(pairs);
  const bootstrap = blockBootstrapInterval(pairs);
  const abPairs = pairs.filter((pair) => pair.order === "a-b");
  const baPairs = pairs.filter((pair) => pair.order === "b-a");
  const orderABRatio = ratioOfMedians(abPairs);
  const orderBARatio = ratioOfMedians(baPairs);
  const orderSpread = Math.abs(orderABRatio - orderBARatio);
  const blockRatios: number[] = [];

  for (let block = 0; block < BLOCKS; block++) {
    const blockPairs = pairs.filter((pair) => pair.block === block);
    if (blockPairs.length !== PAIRS_PER_BLOCK) {
      throw new Error(`incomplete block ${block + 1}`);
    }
    blockRatios.push(ratioOfMedians(blockPairs));
  }

  return {
    ratio,
    bootstrapLow: bootstrap.low,
    bootstrapHigh: bootstrap.high,
    orderABRatio,
    orderBARatio,
    orderSpread,
    blockRatios,
    maxBlockDeviation: Math.max(
      ...blockRatios.map((value) => Math.abs(value - 1)),
    ),
  };
}

function printDiagnostics(value: Diagnostics): void {
  console.log();
  console.log("Collision-memory estimator diagnostics");
  console.log(
    "| median(B)/median(A) | block-bootstrap 95% CI | A→B ratio | B→A ratio | order spread |",
  );
  console.log("| ---: | ---: | ---: | ---: | ---: |");
  console.log(
    `| ${value.ratio.toFixed(4)}x | ${value.bootstrapLow.toFixed(4)}x–${value.bootstrapHigh.toFixed(4)}x | ${value.orderABRatio.toFixed(4)}x | ${value.orderBARatio.toFixed(4)}x | ${(value.orderSpread * 100).toFixed(2)}% |`,
  );
}

function printBlocks(value: Diagnostics): void {
  console.log();
  console.log("Block ratio-of-medians B / A");
  console.log("| b1 | b2 | b3 | b4 | b5 | b6 | b7 | b8 | max deviation |");
  console.log(
    "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  );
  console.log(
    `| ${value.blockRatios.map((ratio) => `${ratio.toFixed(4)}x`).join(" | ")} | ${(value.maxBlockDeviation * 100).toFixed(2)}% |`,
  );
}

function printCalibrationDecision(value: Diagnostics): void {
  const bias = Math.abs(value.ratio - 1);
  const ciPass =
    value.bootstrapLow >= CALIBRATION_CI_LOW &&
    value.bootstrapHigh <= CALIBRATION_CI_HIGH;
  const pass =
    bias <= CALIBRATION_BIAS_LIMIT &&
    ciPass &&
    value.orderSpread <= CALIBRATION_ORDER_SPREAD_LIMIT &&
    value.maxBlockDeviation <= CALIBRATION_BLOCK_DEVIATION_LIMIT;

  console.log();
  console.log("Frozen CP4-AS collision-memory calibration criteria");
  console.log(
    "| bias | bootstrap CI | order spread | block deviation | result |",
  );
  console.log("| ---: | ---: | ---: | ---: | --- |");
  console.log(
    `| ${(bias * 100).toFixed(2)}% / <= 1.00% | ${value.bootstrapLow.toFixed(4)}x–${value.bootstrapHigh.toFixed(4)}x / 0.9850x–1.0150x | ${(value.orderSpread * 100).toFixed(2)}% / <= 1.00% | ${(value.maxBlockDeviation * 100).toFixed(2)}% / <= 2.00% | ${pass ? "PASS" : "FAIL"} |`,
  );
  console.log();
  console.log(
    `CP4-AS COLLISION-MEMORY 5%-GATE READINESS: ${pass ? "PASS" : "FAIL"}`,
  );
}

function printCandidateDecision(value: Diagnostics): void {
  let decision: CandidateDecision;
  if (value.bootstrapHigh <= MEMORY_REGRESSION_LIMIT) {
    decision = "PASS";
  } else if (value.bootstrapLow > MEMORY_REGRESSION_LIMIT) {
    decision = "FAIL";
  } else {
    decision = "HOLD / INCONCLUSIVE";
  }

  console.log();
  console.log("Frozen CP4-AS collision-memory candidate decision");
  console.log("| rule | observed | decision |");
  console.log("| --- | ---: | --- |");
  console.log(
    `| 5% retained-heap ceiling | ${value.bootstrapLow.toFixed(4)}x–${value.bootstrapHigh.toFixed(4)}x | ${decision} |`,
  );
  console.log();
  console.log(`CP4-AS COLLISION-MEMORY DECISION: ${decision}`);
}

function blockBootstrapInterval(pairs: readonly PairResult[]): {
  readonly low: number;
  readonly high: number;
} {
  const blocks: PairResult[][] = [];
  for (let block = 0; block < BLOCKS; block++) {
    const values = pairs.filter((pair) => pair.block === block);
    if (values.length !== PAIRS_PER_BLOCK) {
      throw new Error(`incomplete bootstrap block ${block + 1}`);
    }
    blocks.push(values);
  }

  const random = seededRandom(0x4a524d45);
  const ratios: number[] = [];
  for (let rep = 0; rep < BOOTSTRAP_REPS; rep++) {
    const sampled: PairResult[] = [];
    for (let index = 0; index < BLOCKS; index++) {
      sampled.push(...blocks[Math.floor(random() * BLOCKS)]!);
    }
    ratios.push(ratioOfMedians(sampled));
  }
  ratios.sort((a, b) => a - b);
  return {
    low: percentileSorted(ratios, 0.025),
    high: percentileSorted(ratios, 0.975),
  };
}

function ratioOfMedians(pairs: readonly PairResult[]): number {
  return (
    median(pairs.map((pair) => pair.b)) / median(pairs.map((pair) => pair.a))
  );
}

function runWorker(
  source: SourceLabel,
  workerProbeOnly: boolean,
): WorkerResult {
  const sourceRoot = source === "a" ? worktreeA : worktreeB;
  const args = [
    WORKER,
    `--source=${source}`,
    `--source-root=${sourceRoot}`,
    `--probe-only=${workerProbeOnly ? "true" : "false"}`,
  ];

  const result =
    workerProbeOnly || process.platform !== "win32"
      ? spawnSync(process.execPath, args, workerOptions())
      : spawnPinnedWindowsWorker(args);

  if (result.status !== 0) {
    throw new Error(
      `worker failed for ${source}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  const line = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (line === undefined) {
    throw new Error(`worker emitted no result for ${source}`);
  }
  const parsed = JSON.parse(line) as WorkerResult;
  if (parsed.source !== source || parsed.retainedRouters !== RETAINED_ROUTERS) {
    throw new Error(`worker identity mismatch for ${source}`);
  }
  return parsed;
}

function spawnPinnedWindowsWorker(args: readonly string[]) {
  const bunPath = quotePowerShell(process.execPath);
  const resultFile = resolve(
    REPOSITORY_ROOT,
    "..",
    `gelis-cp4ar-memory-result-${process.pid}-${Date.now()}-${workerResultSequence++}.json`,
  );
  const argumentList = [...args, `--result-file=${resultFile}`]
    .map(quotePowerShell)
    .join(", ");
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "$err = [IO.Path]::GetTempFileName()",
    "$gate = [IO.Path]::GetTempFileName()",
    "Remove-Item -LiteralPath $gate -Force -ErrorAction SilentlyContinue",
    `try { $arguments = @(${argumentList}); $arguments += ('--launch-gate=' + $gate); $p = Start-Process -FilePath ${bunPath} -ArgumentList $arguments -PassThru -WindowStyle Hidden -RedirectStandardError $err`,
    "Start-Sleep -Milliseconds 25",
    "$p.Refresh()",
    `$p.ProcessorAffinity = [IntPtr]0x${affinityMaskHex}`,
    "$p.PriorityClass = 'High'",
    "[IO.File]::WriteAllText($gate, 'go')",
    "$p.WaitForExit()",
    "$code = $p.ExitCode",
    "if (Test-Path $err) { [Console]::Error.Write([IO.File]::ReadAllText($err)) }",
    "exit $code } finally { Remove-Item -LiteralPath $err,$gate -Force -ErrorAction SilentlyContinue }",
  ].join("; ");

  const launched = spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
    workerOptions(),
  );

  let resultText = "";
  try {
    if (launched.status === 0) {
      resultText = readFileSync(resultFile, "utf8");
    }
  } catch (error) {
    return {
      ...launched,
      status: 1,
      stdout: "",
      stderr: `${launched.stderr}\nresult-file read failed: ${String(error)}`,
    };
  } finally {
    rmSync(resultFile, { force: true });
  }

  return { ...launched, stdout: resultText };
}

function workerOptions() {
  return {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8" as const,
    env: process.env,
    maxBuffer: 1024 * 1024,
  };
}

function preflight(): void {
  if (Bun.version !== EXPECTED_BUN) {
    throw new Error(
      `CP4-AS memory gate requires Bun ${EXPECTED_BUN}, got ${Bun.version}`,
    );
  }
  if (Bun.revision !== EXPECTED_BUN_REVISION) {
    throw new Error(
      `CP4-AS memory gate requires Bun revision ${EXPECTED_BUN_REVISION}, got ${Bun.revision}`,
    );
  }
  const dirty = git(["status", "--porcelain"]);
  if (dirty !== "") {
    throw new Error(`CP4-AS memory gate requires a clean worktree:\n${dirty}`);
  }
  if (!probeOnly) {
    if (process.platform !== "win32") {
      throw new Error(
        "CP4-AS timed memory runs are authoritative only on Windows",
      );
    }
    if (logicalCpuCount !== EXPECTED_LOCAL_LOGICAL_CPUS) {
      throw new Error(
        `CP4-AS timed memory runs require ${EXPECTED_LOCAL_LOGICAL_CPUS} logical CPUs, got ${logicalCpuCount}`,
      );
    }
  }
  git(["cat-file", "-e", `${sourceA}^{commit}`]);
  git(["cat-file", "-e", `${sourceB}^{commit}`]);
}

function createWorktree(path: string, source: string): void {
  const result = spawnSync(
    "git",
    ["-C", REPOSITORY_ROOT, "worktree", "add", "--detach", path, source],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(
      `unable to create worktree for ${source}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
}

function cleanupWorktrees(): void {
  if (worktreeBCreated) removeWorktree(worktreeB);
  if (worktreeACreated) removeWorktree(worktreeA);
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
    throw new Error(
      `git ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error("median requires values");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function percentileSorted(
  values: readonly number[],
  percentile: number,
): number {
  if (values.length === 0) throw new Error("percentile requires values");
  const index = (values.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return values[lower]!;
  const weight = index - lower;
  return values[lower]! * (1 - weight) + values[upper]! * weight;
}

function seededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}
