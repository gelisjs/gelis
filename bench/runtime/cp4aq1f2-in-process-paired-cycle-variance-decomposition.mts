import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_BUN = "1.4.2";
const EXPECTED_BUN_REVISION = "744846f844374847c902b5e7fd59b4342a51ef99";
const SOURCE = "5d9698d6b8d368ddcff358fc2645435b93c0c062";
const ROUTES = 5_000;
const PAIRED_WORKERS_PER_CELL = 8;
const CYCLES_PER_WORKER = 8;
const BOOTSTRAP_REPS = 5_000;
const EXPECTED_LOCAL_LOGICAL_CPUS = 12;
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = resolve(
  HERE,
  "cp4aq1f2-in-process-paired-cycle-variance-decomposition-worker.mts",
);
const REPOSITORY_ROOT = resolve(HERE, "../..");
const RUN_TOKEN = `${process.pid}-${Date.now()}`;
const WORKTREE_A = resolve(
  REPOSITORY_ROOT,
  "..",
  `gelis-cp4aq1f2-a-${RUN_TOKEN}`,
);
const WORKTREE_B = resolve(
  REPOSITORY_ROOT,
  "..",
  `gelis-cp4aq1f2-b-${RUN_TOKEN}`,
);

type Cell =
  | "static-only-raw"
  | "generic-dynamic-raw"
  | "trailing-dynamic-json"
  | "collision-dynamic-raw"
  | "all-dynamic-raw";

type Unit = "ns/op";

interface CellSpec {
  readonly cell: Cell;
  readonly label: string;
}

interface WorkerResult {
  readonly cell: Cell;
  readonly probeOnly: boolean;
  readonly unit: Unit;
  readonly workerIndex: number;
  readonly pairedIterations: number;
  readonly warmups: number;
  readonly cycles: number;
  readonly workerRatio: number | null;
  readonly abbaRatios: readonly number[];
  readonly baabRatios: readonly number[];
  readonly cycleRatios: readonly number[];
  readonly aMetrics: readonly number[];
  readonly bMetrics: readonly number[];
  readonly sink: number;
}

interface Summary {
  readonly median: number;
  readonly p25: number;
  readonly p75: number;
  readonly min: number;
  readonly max: number;
}

interface Diagnostics {
  readonly rawMedianRatio: number;
  readonly workerMedianRatio: number;
  readonly bootstrapLow: number;
  readonly bootstrapHigh: number;
  readonly abbaMedian: number;
  readonly baabMedian: number;
  readonly orientationSpread: number;
  readonly maxWorkerDeviation: number;
  readonly cycleSpreadMedian: number;
  readonly cycleSpreadP95: number;
}

const CELLS: readonly CellSpec[] = [
  { cell: "static-only-raw", label: "static-only raw" },
  { cell: "generic-dynamic-raw", label: "generic dynamic raw" },
  { cell: "trailing-dynamic-json", label: "pure trailing dynamic JSON" },
  { cell: "collision-dynamic-raw", label: "forced collision raw" },
  { cell: "all-dynamic-raw", label: "ALL dynamic raw" },
];

const probeOnly = process.argv.includes("--probe-only");
const harnessSha = git(["rev-parse", "HEAD"]);
const cpu = cpus()[0]?.model ?? "unknown";
const logicalCpuCount = cpus().length;
const affinityLogicalCpu = Math.max(0, logicalCpuCount - 2);
const affinityMaskHex = (1n << BigInt(affinityLogicalCpu)).toString(16);
let worktreeACreated = false;
let worktreeBCreated = false;
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
  } else {
    runTiming();
    completed = true;
  }
} finally {
  cleanupWorktrees();
}

if (probeOnly) {
  console.log();
  console.log(
    `CP4-AQ1F2 CORRECTNESS PROBE: PASS (${CELLS.length}/${CELLS.length} paired-source checks)`,
  );
} else if (completed) {
  console.log();
  console.log(
    "CP4-AQ1F2 LOCAL IN-PROCESS PAIRED-CYCLE VARIANCE DECOMPOSITION RUN: COMPLETE",
  );
}

function printHeader(): void {
  console.log(
    "Competitive Performance v0.1 — CP4-AQ1F2 in-process paired-cycle variance decomposition",
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
    console.log(
      `Paired workers:  ${PAIRED_WORKERS_PER_CELL} fresh in-process A/B workers/cell`,
    );
    console.log(`Cycles/worker:   ${CYCLES_PER_WORKER}`);
    console.log("Cycle order:     balanced ABBA / BAAB within each process");
    console.log("Timed legs:      32 per worker (4 legs × 8 cycles)");
    console.log("Cells:           5 representative hotpaths");
    console.log(
      `Windows affinity: logical CPU ${affinityLogicalCpu} (0x${affinityMaskHex})`,
    );
    console.log("Worker priority: HIGH");
    console.log(
      `Bootstrap:       ${BOOTSTRAP_REPS.toLocaleString("en-US")} deterministic worker resamples`,
    );
  }
  console.log();
}

function runProbe(): void {
  for (const spec of CELLS) {
    const result = runWorker(spec.cell, 0, true);
    if (!result.probeOnly || result.cell !== spec.cell) {
      throw new Error(`Invalid paired probe for ${spec.cell}`);
    }
    console.log(`PASS paired-a+b-${spec.cell}`);
  }
}

function runTiming(): void {
  const all = new Map<Cell, WorkerResult[]>();

  for (let cellIndex = 0; cellIndex < CELLS.length; cellIndex++) {
    const spec = CELLS[cellIndex]!;
    const results: WorkerResult[] = [];

    for (
      let workerIndex = 0;
      workerIndex < PAIRED_WORKERS_PER_CELL;
      workerIndex++
    ) {
      console.log(
        `PROGRESS aq1f2 ${cellIndex + 1}/${CELLS.length} ${spec.cell} worker ${workerIndex + 1}/${PAIRED_WORKERS_PER_CELL}`,
      );
      const result = runWorker(spec.cell, workerIndex, false);
      validateTimedResult(result, spec.cell, workerIndex);
      results.push(result);
    }
    all.set(spec.cell, results);
  }

  printAbsoluteMetrics(all);
  const diagnostics = buildDiagnostics(all);
  printDiagnostics(diagnostics);
  printWorkerTable(all);
  printViability(diagnostics);
}

function validateTimedResult(
  result: WorkerResult,
  cell: Cell,
  workerIndex: number,
): void {
  if (
    result.probeOnly ||
    result.cell !== cell ||
    result.workerIndex !== workerIndex
  ) {
    throw new Error(`Worker identity mismatch for ${cell} #${workerIndex}`);
  }
  if (result.workerRatio === null || result.cycles !== CYCLES_PER_WORKER) {
    throw new Error(`Incomplete paired result for ${cell} #${workerIndex}`);
  }
  if (
    result.cycleRatios.length !== CYCLES_PER_WORKER ||
    result.abbaRatios.length !== 4 ||
    result.baabRatios.length !== 4
  ) {
    throw new Error(`Cycle shape mismatch for ${cell} #${workerIndex}`);
  }
  if (
    result.aMetrics.length !== CYCLES_PER_WORKER * 2 ||
    result.bMetrics.length !== CYCLES_PER_WORKER * 2
  ) {
    throw new Error(`Leg metric count mismatch for ${cell} #${workerIndex}`);
  }
}

function printAbsoluteMetrics(all: ReadonlyMap<Cell, WorkerResult[]>): void {
  console.log("In-process timed-leg absolute metrics");
  console.log("| cell | source | median | p25 | p75 | min | max | unit |");
  console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |");

  for (const spec of CELLS) {
    const results = getResults(all, spec.cell);
    for (const [source, values] of [
      ["a", results.flatMap((result) => result.aMetrics)],
      ["b", results.flatMap((result) => result.bMetrics)],
    ] as const) {
      const summary = summarize(values);
      console.log(
        `| ${spec.cell} | ${source} | ${summary.median.toFixed(1)} | ${summary.p25.toFixed(1)} | ${summary.p75.toFixed(1)} | ${summary.min.toFixed(1)} | ${summary.max.toFixed(1)} | ns/op |`,
      );
    }
  }
}

function buildDiagnostics(
  all: ReadonlyMap<Cell, WorkerResult[]>,
): ReadonlyMap<Cell, Diagnostics> {
  const output = new Map<Cell, Diagnostics>();

  for (const spec of CELLS) {
    const results = getResults(all, spec.cell);
    const workerRatios = results.map((result) => result.workerRatio!);
    const allA = results.flatMap((result) => result.aMetrics);
    const allB = results.flatMap((result) => result.bMetrics);
    const abba = results.flatMap((result) => result.abbaRatios);
    const baab = results.flatMap((result) => result.baabRatios);
    const spreads = results
      .map((result) => relativeSpread(result.cycleRatios))
      .sort((a, b) => a - b);
    const bootstrap = bootstrapInterval(workerRatios, spec.cell);
    const abbaMedian = median(abba);
    const baabMedian = median(baab);

    output.set(spec.cell, {
      rawMedianRatio: median(allB) / median(allA),
      workerMedianRatio: median(workerRatios),
      bootstrapLow: bootstrap.low,
      bootstrapHigh: bootstrap.high,
      abbaMedian,
      baabMedian,
      orientationSpread: Math.abs(abbaMedian - baabMedian),
      maxWorkerDeviation: Math.max(
        ...workerRatios.map((ratio) => Math.abs(ratio - 1)),
      ),
      cycleSpreadMedian: percentileSorted(spreads, 0.5),
      cycleSpreadP95: percentileSorted(spreads, 0.95),
    });
  }
  return output;
}

function printDiagnostics(
  diagnostics: ReadonlyMap<Cell, Diagnostics>,
): void {
  console.log();
  console.log("AQ1F2 in-process paired-cycle diagnostics");
  console.log(
    "| comparison | raw leg median B/A | paired-worker median | bootstrap 95% CI | ABBA | BAAB | orientation spread | within-worker cycle spread median/p95 |",
  );
  console.log("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");

  for (const spec of CELLS) {
    const value = getDiagnostics(diagnostics, spec.cell);
    console.log(
      `| ${spec.label} | ${value.rawMedianRatio.toFixed(4)}x | ${value.workerMedianRatio.toFixed(4)}x | ${value.bootstrapLow.toFixed(4)}x–${value.bootstrapHigh.toFixed(4)}x | ${value.abbaMedian.toFixed(4)}x | ${value.baabMedian.toFixed(4)}x | ${(value.orientationSpread * 100).toFixed(2)}% | ${(value.cycleSpreadMedian * 100).toFixed(2)}% / ${(value.cycleSpreadP95 * 100).toFixed(2)}% |`,
    );
  }
}

function printWorkerTable(all: ReadonlyMap<Cell, WorkerResult[]>): void {
  console.log();
  console.log("Fresh paired-worker median cycle ratios B / A");
  console.log(
    "| comparison | w1 | w2 | w3 | w4 | w5 | w6 | w7 | w8 | max deviation |",
  );
  console.log(
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  );

  for (const spec of CELLS) {
    const ratios = getResults(all, spec.cell).map(
      (result) => result.workerRatio!,
    );
    const maxDeviation = Math.max(
      ...ratios.map((ratio) => Math.abs(ratio - 1)),
    );
    console.log(
      `| ${spec.label} | ${ratios.map((ratio) => `${ratio.toFixed(4)}x`).join(" | ")} | ${(maxDeviation * 100).toFixed(2)}% |`,
    );
  }
}

function printViability(diagnostics: ReadonlyMap<Cell, Diagnostics>): void {
  let viable = true;
  console.log();
  console.log("Frozen CP4-AQ1F2 mechanism-viability criteria");
  console.log(
    "| comparison | paired-worker bias | bootstrap CI | orientation spread | worker deviation | result |",
  );
  console.log("| --- | ---: | ---: | ---: | ---: | --- |");

  for (const spec of CELLS) {
    const value = getDiagnostics(diagnostics, spec.cell);
    const bias = Math.abs(value.workerMedianRatio - 1);
    const ciPass =
      value.bootstrapLow >= 0.985 && value.bootstrapHigh <= 1.015;
    const pass =
      bias <= 0.01 &&
      ciPass &&
      value.orientationSpread <= 0.01 &&
      value.maxWorkerDeviation <= 0.02;
    if (!pass) viable = false;

    console.log(
      `| ${spec.label} | ${(bias * 100).toFixed(2)}% / <= 1.00% | ${value.bootstrapLow.toFixed(4)}x–${value.bootstrapHigh.toFixed(4)}x / 0.9850x–1.0150x | ${(value.orientationSpread * 100).toFixed(2)}% / <= 1.00% | ${(value.maxWorkerDeviation * 100).toFixed(2)}% / <= 2.00% | ${pass ? "PASS" : "FAIL"} |`,
    );
  }

  console.log();
  console.log(
    `CP4-AQ1F2 IN-PROCESS MECHANISM VIABILITY FOR FULL AQ1G: ${viable ? "PASS" : "FAIL"}`,
  );
  console.log(
    "AQ1F2 is same-source variance decomposition only; it cannot reclassify Gelis performance, AQ1E, or AQ1F.",
  );
}

function bootstrapInterval(
  values: readonly number[],
  cell: Cell,
): { readonly low: number; readonly high: number } {
  const random = seededRandom(hashString(cell) ^ 0xa1f20002);
  const ratios: number[] = [];

  for (let rep = 0; rep < BOOTSTRAP_REPS; rep++) {
    const sample: number[] = [];
    for (let index = 0; index < values.length; index++) {
      sample.push(values[Math.floor(random() * values.length)]!);
    }
    ratios.push(median(sample));
  }

  ratios.sort((a, b) => a - b);
  return {
    low: percentileSorted(ratios, 0.025),
    high: percentileSorted(ratios, 0.975),
  };
}

function runWorker(
  cell: Cell,
  workerIndex: number,
  workerProbeOnly: boolean,
): WorkerResult {
  const args = [
    WORKER,
    `--cell=${cell}`,
    `--source-root-a=${WORKTREE_A}`,
    `--source-root-b=${WORKTREE_B}`,
    `--worker-index=${workerIndex}`,
    `--probe-only=${workerProbeOnly ? "true" : "false"}`,
  ];

  const result =
    workerProbeOnly || process.platform !== "win32"
      ? spawnSync(process.execPath, args, workerOptions())
      : spawnPinnedWindowsWorker(args);

  if (result.status !== 0) {
    throw new Error(
      `Worker failed for ${cell} #${workerIndex}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }

  const line = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (line === undefined) {
    throw new Error(`Worker emitted no result for ${cell} #${workerIndex}`);
  }
  return JSON.parse(line) as WorkerResult;
}

function spawnPinnedWindowsWorker(args: readonly string[]) {
  const bunPath = quotePowerShell(process.execPath);
  const resultFile = resolve(
    REPOSITORY_ROOT,
    "..",
    `gelis-cp4aq1f2-result-${process.pid}-${Date.now()}-${workerResultSequence++}.json`,
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

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function preflight(): void {
  if (Bun.version !== EXPECTED_BUN) {
    throw new Error(`CP4-AQ1F2 requires Bun ${EXPECTED_BUN}, got ${Bun.version}`);
  }
  if (Bun.revision !== EXPECTED_BUN_REVISION) {
    throw new Error(
      `CP4-AQ1F2 requires Bun revision ${EXPECTED_BUN_REVISION}, got ${Bun.revision}`,
    );
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty !== "") {
    throw new Error(`CP4-AQ1F2 requires a clean worktree:\n${dirty}`);
  }

  if (!probeOnly) {
    if (process.platform !== "win32") {
      throw new Error("CP4-AQ1F2 timed calibration is authoritative only on Windows");
    }
    if (logicalCpuCount !== EXPECTED_LOCAL_LOGICAL_CPUS) {
      throw new Error(
        `CP4-AQ1F2 timed calibration requires ${EXPECTED_LOCAL_LOGICAL_CPUS} logical CPUs, got ${logicalCpuCount}`,
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

function getResults(
  all: ReadonlyMap<Cell, WorkerResult[]>,
  cell: Cell,
): readonly WorkerResult[] {
  const value = all.get(cell);
  if (value === undefined) throw new Error(`Missing results for ${cell}`);
  return value;
}

function getDiagnostics(
  all: ReadonlyMap<Cell, Diagnostics>,
  cell: Cell,
): Diagnostics {
  const value = all.get(cell);
  if (value === undefined) throw new Error(`Missing diagnostics for ${cell}`);
  return value;
}

function relativeSpread(values: readonly number[]): number {
  const center = median(values);
  return (Math.max(...values) - Math.min(...values)) / center;
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
  return percentileSorted([...values].sort((a, b) => a - b), 0.5);
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
