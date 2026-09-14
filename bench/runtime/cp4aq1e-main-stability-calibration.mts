import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_BUN = "1.4.2";
const EXPECTED_BUN_REVISION = "744846f844374847c902b5e7fd59b4342a51ef99";
const SOURCE = "5d9698d6b8d368ddcff358fc2645435b93c0c062";
const ROUTES = 5_000;
const BLOCKS = 8;
const PAIRS_PER_BLOCK = 8;
const SAMPLES = BLOCKS * PAIRS_PER_BLOCK;
const BOOTSTRAP_REPS = 5_000;
const EXPECTED_LOCAL_LOGICAL_CPUS = 12;
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = resolve(HERE, "cp4aq1e-main-stability-calibration-worker.mts");
const REPOSITORY_ROOT = resolve(HERE, "../..");
const RUN_TOKEN = `${process.pid}-${Date.now()}`;
const WORKTREE_A = resolve(
  REPOSITORY_ROOT,
  "..",
  `gelis-cp4aq1e-main-a-${RUN_TOKEN}`,
);
const WORKTREE_B = resolve(
  REPOSITORY_ROOT,
  "..",
  `gelis-cp4aq1e-main-b-${RUN_TOKEN}`,
);

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
  readonly kind: "hotpath" | "registration" | "memory";
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

interface PairResult {
  readonly block: number;
  readonly order: Order;
  readonly a: number;
  readonly b: number;
}

interface Summary {
  readonly median: number;
  readonly p25: number;
  readonly p75: number;
  readonly min: number;
  readonly max: number;
}

interface CellDiagnostics {
  readonly overallRatio: number;
  readonly bootstrapLow: number;
  readonly bootstrapHigh: number;
  readonly orderABRatio: number;
  readonly orderBARatio: number;
  readonly orderSpread: number;
  readonly blockRatios: readonly number[];
  readonly maxBlockDeviation: number;
}

const CELLS: readonly CellSpec[] = [
  { cell: "static-only-raw", label: "static-only raw", kind: "hotpath" },
  { cell: "mixed-static-raw", label: "mixed static raw", kind: "hotpath" },
  { cell: "mixed-dynamic-raw", label: "mixed dynamic raw", kind: "hotpath" },
  { cell: "mixed-dynamic-json", label: "mixed dynamic JSON", kind: "hotpath" },
  {
    cell: "mixed-same-length-dynamic-raw",
    label: "mixed same-length dynamic raw",
    kind: "hotpath",
  },
  {
    cell: "trailing-dynamic-raw",
    label: "pure trailing dynamic raw",
    kind: "hotpath",
  },
  {
    cell: "trailing-dynamic-json",
    label: "pure trailing dynamic JSON",
    kind: "hotpath",
  },
  {
    cell: "generic-dynamic-raw",
    label: "generic dynamic raw",
    kind: "hotpath",
  },
  {
    cell: "collision-dynamic-raw",
    label: "forced collision raw",
    kind: "hotpath",
  },
  { cell: "all-dynamic-raw", label: "ALL dynamic raw", kind: "hotpath" },
  {
    cell: "static-registration",
    label: "static registration",
    kind: "registration",
  },
];

const SOURCES: readonly Source[] = ["a", "b"];
const probeOnly = process.argv.includes("--probe-only");
const harnessSha = git(["rev-parse", "HEAD"]);
const cpu = cpus()[0]?.model ?? "unknown";
const logicalCpuCount = cpus().length;
const affinityLogicalCpu = Math.max(0, logicalCpuCount - 2);
const affinityMaskHex = (1n << BigInt(affinityLogicalCpu)).toString(16);
let worktreeACreated = false;
let worktreeBCreated = false;
let probeCompleted = false;
let completed = false;
let workerResultSequence = 0;

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
    `CP4-AQ1E-MAIN CORRECTNESS PROBE: PASS (${CELLS.length * SOURCES.length}/${CELLS.length * SOURCES.length})`,
  );
} else if (completed) {
  console.log();
  console.log(
    "CP4-AQ1E-MAIN LOCAL HARDENED STABILITY CALIBRATION RUN: COMPLETE",
  );
}

function printHeader(): void {
  console.log(
    "Competitive Performance v0.1 — CP4-AQ1E-MAIN hardened benchmark stability calibration",
  );
  console.log(`Bun:             ${Bun.version}`);
  console.log(`Revision:        ${Bun.revision}`);
  console.log(`CPU:             ${cpu}`);
  console.log(`Logical CPUs:    ${logicalCpuCount}`);
  console.log(`Harness SHA:     ${harnessSha}`);
  console.log(`Source A:        ${SOURCE}`);
  console.log(`Source B:        ${SOURCE}`);
  console.log(`Routes:          ${ROUTES.toLocaleString("en-US")}`);
  if (probeOnly) {
    console.log("Mode:            correctness probe only");
  } else {
    console.log(`Blocks:          ${BLOCKS}`);
    console.log(`Pairs/block:     ${PAIRS_PER_BLOCK}`);
    console.log(`Samples/source:  ${SAMPLES} fresh-worker measurements/cell`);
    console.log("Order:           4 A→B + 4 B→A pairs per block");
    console.log(
      "Cells:           10 hotpath + 1 registration; memory isolated in AQ1E-MEMORY",
    );
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

  for (let cellIndex = 0; cellIndex < CELLS.length; cellIndex++) {
    const spec = CELLS[cellIndex]!;
    const pairs: PairResult[] = [];

    for (let block = 0; block < BLOCKS; block++) {
      console.log(
        `PROGRESS main ${cellIndex + 1}/${CELLS.length} ${spec.cell} block ${block + 1}/${BLOCKS}`,
      );
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
        pairs.push({ block, order, a, b });
      }
    }

    if (pairs.length !== SAMPLES) {
      throw new Error(`Incomplete pair set for ${spec.cell}`);
    }
    results.set(spec.cell, pairs);
  }

  printAbsoluteMetrics(results, units);
  const diagnostics = buildDiagnostics(results);
  printEstimatorTable(diagnostics);
  printBlockwiseTable(diagnostics);
  printReadiness(diagnostics);
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

function buildDiagnostics(
  results: ReadonlyMap<Cell, PairResult[]>,
): ReadonlyMap<Cell, CellDiagnostics> {
  const output = new Map<Cell, CellDiagnostics>();

  for (const spec of CELLS) {
    const pairs = getPairs(results, spec.cell);
    const overallRatio = ratioOfMedians(pairs);
    const bootstrap = blockBootstrapInterval(pairs, spec.cell);
    const abPairs = pairs.filter((pair) => pair.order === "a-b");
    const baPairs = pairs.filter((pair) => pair.order === "b-a");
    const orderABRatio = ratioOfMedians(abPairs);
    const orderBARatio = ratioOfMedians(baPairs);
    const orderSpread = Math.abs(orderABRatio - orderBARatio);
    const blockRatios: number[] = [];

    for (let block = 0; block < BLOCKS; block++) {
      const blockPairs = pairs.filter((pair) => pair.block === block);
      if (blockPairs.length !== PAIRS_PER_BLOCK) {
        throw new Error(`Incomplete block ${block + 1} for ${spec.cell}`);
      }
      blockRatios.push(ratioOfMedians(blockPairs));
    }

    output.set(spec.cell, {
      overallRatio,
      bootstrapLow: bootstrap.low,
      bootstrapHigh: bootstrap.high,
      orderABRatio,
      orderBARatio,
      orderSpread,
      blockRatios,
      maxBlockDeviation: Math.max(
        ...blockRatios.map((ratio) => Math.abs(ratio - 1)),
      ),
    });
  }

  return output;
}

function printEstimatorTable(
  diagnostics: ReadonlyMap<Cell, CellDiagnostics>,
): void {
  console.log();
  console.log("Hardened same-source estimator diagnostics");
  console.log(
    "| comparison | median(B)/median(A) | block-bootstrap 95% CI | A→B ratio | B→A ratio | order spread |",
  );
  console.log("| --- | ---: | ---: | ---: | ---: | ---: |");

  for (const spec of CELLS) {
    const value = getDiagnostics(diagnostics, spec.cell);
    console.log(
      `| ${spec.label} | ${value.overallRatio.toFixed(4)}x | ${value.bootstrapLow.toFixed(4)}x–${value.bootstrapHigh.toFixed(4)}x | ${value.orderABRatio.toFixed(4)}x | ${value.orderBARatio.toFixed(4)}x | ${(value.orderSpread * 100).toFixed(2)}% |`,
    );
  }
}

function printBlockwiseTable(
  diagnostics: ReadonlyMap<Cell, CellDiagnostics>,
): void {
  console.log();
  console.log("Block ratio-of-medians B / A");
  console.log(
    "| comparison | b1 | b2 | b3 | b4 | b5 | b6 | b7 | b8 | max deviation |",
  );
  console.log(
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  );

  for (const spec of CELLS) {
    const value = getDiagnostics(diagnostics, spec.cell);
    const blocks = value.blockRatios
      .map((ratio) => `${ratio.toFixed(4)}x`)
      .join(" | ");
    console.log(
      `| ${spec.label} | ${blocks} | ${(value.maxBlockDeviation * 100).toFixed(2)}% |`,
    );
  }
}

function printReadiness(diagnostics: ReadonlyMap<Cell, CellDiagnostics>): void {
  let ready = true;

  console.log();
  console.log("Frozen CP4-AQ1E-MAIN benchmark-readiness criteria");
  console.log(
    "| comparison | aggregate bias | bootstrap CI | order spread | block deviation | result |",
  );
  console.log("| --- | ---: | ---: | ---: | ---: | --- |");

  for (const spec of CELLS) {
    const value = getDiagnostics(diagnostics, spec.cell);
    const limits = readinessLimits(spec.kind);
    const bias = Math.abs(value.overallRatio - 1);
    const ciPass =
      value.bootstrapLow >= 1 - limits.ciRadius &&
      value.bootstrapHigh <= 1 + limits.ciRadius;
    const pass =
      bias <= limits.bias &&
      ciPass &&
      value.orderSpread <= limits.orderSpread &&
      value.maxBlockDeviation <= limits.blockDeviation;
    if (!pass) ready = false;

    console.log(
      `| ${spec.label} | ${(bias * 100).toFixed(2)}% / <= ${(limits.bias * 100).toFixed(2)}% | ${value.bootstrapLow.toFixed(4)}x–${value.bootstrapHigh.toFixed(4)}x / ±${(limits.ciRadius * 100).toFixed(1)}% | ${(value.orderSpread * 100).toFixed(2)}% / <= ${(limits.orderSpread * 100).toFixed(2)}% | ${(value.maxBlockDeviation * 100).toFixed(2)}% / <= ${(limits.blockDeviation * 100).toFixed(2)}% | ${pass ? "PASS" : "FAIL"} |`,
    );
  }

  console.log();
  console.log(
    `CP4-AQ1E-MAIN HARDENED BENCHMARK 2%-GATE READINESS: ${ready ? "PASS" : "FAIL"}`,
  );
  console.log(
    "AQ1E-MAIN is environment/estimator calibration only; this readiness result does not reclassify Gelis source performance.",
  );
}

function readinessLimits(kind: CellSpec["kind"]): {
  readonly bias: number;
  readonly ciRadius: number;
  readonly orderSpread: number;
  readonly blockDeviation: number;
} {
  if (kind === "hotpath") {
    return {
      bias: 0.01,
      ciRadius: 0.015,
      orderSpread: 0.01,
      blockDeviation: 0.02,
    };
  }
  if (kind === "registration") {
    return {
      bias: 0.02,
      ciRadius: 0.04,
      orderSpread: 0.03,
      blockDeviation: 0.05,
    };
  }
  return {
    bias: 0.005,
    ciRadius: 0.005,
    orderSpread: 0.005,
    blockDeviation: 0.005,
  };
}

function blockBootstrapInterval(
  pairs: readonly PairResult[],
  cell: Cell,
): { readonly low: number; readonly high: number } {
  const blocks: PairResult[][] = [];
  for (let block = 0; block < BLOCKS; block++) {
    const values = pairs.filter((pair) => pair.block === block);
    if (values.length !== PAIRS_PER_BLOCK) {
      throw new Error(`Incomplete bootstrap block ${block + 1} for ${cell}`);
    }
    blocks.push(values);
  }

  const random = seededRandom(hashString(cell) ^ 0x51f15e);
  const ratios: number[] = [];
  for (let rep = 0; rep < BOOTSTRAP_REPS; rep++) {
    const sampled: PairResult[] = [];
    for (let index = 0; index < BLOCKS; index++) {
      const selected = Math.floor(random() * BLOCKS);
      sampled.push(...blocks[selected]!);
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
  cell: Cell,
  source: Source,
  workerProbeOnly: boolean,
): WorkerResult {
  const sourceRoot = source === "a" ? WORKTREE_A : WORKTREE_B;
  const args = [
    WORKER,
    `--cell=${cell}`,
    "--variant=candidate",
    `--source-root=${sourceRoot}`,
    `--probe-only=${workerProbeOnly ? "true" : "false"}`,
  ];

  const result =
    workerProbeOnly || process.platform !== "win32"
      ? spawnSync(process.execPath, args, workerOptions())
      : spawnPinnedWindowsWorker(args);

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

function spawnPinnedWindowsWorker(args: readonly string[]) {
  const bunPath = quotePowerShell(process.execPath);
  const resultFile = resolve(
    REPOSITORY_ROOT,
    "..",
    `gelis-cp4aq1e-main-result-${process.pid}-${Date.now()}-${workerResultSequence++}.json`,
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
      stderr: `${launched.stderr}
result-file read failed: ${String(error)}`,
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

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function preflight(): void {
  if (Bun.version !== EXPECTED_BUN) {
    throw new Error(
      `CP4-AQ1E-MAIN requires Bun ${EXPECTED_BUN}, got ${Bun.version}`,
    );
  }
  if (Bun.revision !== EXPECTED_BUN_REVISION) {
    throw new Error(
      `CP4-AQ1E-MAIN requires Bun revision ${EXPECTED_BUN_REVISION}, got ${Bun.revision}`,
    );
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty !== "") {
    throw new Error(`CP4-AQ1E-MAIN requires a clean worktree:\n${dirty}`);
  }

  if (!probeOnly) {
    if (process.platform !== "win32") {
      throw new Error(
        "CP4-AQ1E-MAIN timed calibration is authoritative only on Windows",
      );
    }
    if (logicalCpuCount !== EXPECTED_LOCAL_LOGICAL_CPUS) {
      throw new Error(
        `CP4-AQ1E-MAIN timed calibration requires ${EXPECTED_LOCAL_LOGICAL_CPUS} logical CPUs, got ${logicalCpuCount}`,
      );
    }
  }

  git(["cat-file", "-e", `${SOURCE}^{commit}`]);
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

function getPairs(
  results: ReadonlyMap<Cell, PairResult[]>,
  cell: Cell,
): readonly PairResult[] {
  const value = results.get(cell);
  if (value === undefined) throw new Error(`Missing results for ${cell}`);
  return value;
}

function getDiagnostics(
  diagnostics: ReadonlyMap<Cell, CellDiagnostics>,
  cell: Cell,
): CellDiagnostics {
  const value = diagnostics.get(cell);
  if (value === undefined) throw new Error(`Missing diagnostics for ${cell}`);
  return value;
}

function summarize(values: readonly number[]): Summary {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    median: percentileSorted(sorted, 0.5),
    p25: percentileSorted(sorted, 0.25),
    p75: percentileSorted(sorted, 0.75),
    min: sorted[0]!,
    max: sorted.at(-1)!,
  };
}

function median(values: readonly number[]): number {
  return percentileSorted(
    [...values].sort((a, b) => a - b),
    0.5,
  );
}

function percentileSorted(values: readonly number[], quantile: number): number {
  if (values.length === 0) throw new Error("Cannot summarize empty values");
  const index = (values.length - 1) * quantile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const lowerValue = values[lower]!;
  const upperValue = values[upper]!;
  if (lower === upper) return lowerValue;
  return lowerValue + (upperValue - lowerValue) * (index - lower);
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function formatMetric(value: number, unit: Unit): string {
  if (unit === "ns/op") return value.toFixed(1);
  if (unit === "ms") return value.toFixed(3);
  return value.toFixed(1);
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
