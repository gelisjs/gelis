import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_BUN = "1.4.2";
const EXPECTED_BUN_REVISION = "744846f844374847c902b5e7fd59b4342a51ef99";
const PRODUCTION = "5d9698d6b8d368ddcff358fc2645435b93c0c062";
const WORKER_BLOB = "9df1a3a236b0ec07626fce9e85041291448963e1";
const ROUTES = 5_000;
const PAIRED_WORKERS_PER_CELL = 16;
const CYCLES_PER_WORKER = 8;
const BOOTSTRAP_REPS = 5_000;
const EXPECTED_LOCAL_LOGICAL_CPUS = 12;
const CLEAR_IMPROVEMENT_UPPER = 0.98;
const CLEAR_REGRESSION_LOWER = 1.02;
const MATERIAL_IMPROVEMENT = 0.95;
const MATERIAL_REGRESSION = 1.05;
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = resolve(
  HERE,
  "cp4aq3-production-performance-decision-worker.mts",
);
const REPOSITORY_ROOT = resolve(HERE, "../..");
const RUN_TOKEN = `${process.pid}-${Date.now()}`;

type Cell =
  | "static-only-raw"
  | "generic-dynamic-raw"
  | "trailing-dynamic-json"
  | "collision-dynamic-raw"
  | "all-dynamic-raw";

type Classification = "CLEAR IMPROVEMENT" | "INCONCLUSIVE" | "CLEAR REGRESSION";

type HotpathDecision =
  | "ELIGIBLE FOR PRODUCTION PROMOTION"
  | "HOLD / INCONCLUSIVE"
  | "REJECTED FOR PRODUCTION PROMOTION";

interface CellSpec {
  readonly cell: Cell;
  readonly label: string;
}

interface WorkerResult {
  readonly cell: Cell;
  readonly probeOnly: boolean;
  readonly unit: "ns/op";
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

interface Diagnostics {
  readonly rawMedianRatio: number;
  readonly workerMedianRatio: number;
  readonly bootstrapLow: number;
  readonly bootstrapHigh: number;
  readonly classification: Classification;
  readonly materialImprovement: boolean;
  readonly materialRegressionEstimate: boolean;
  readonly minWorkerRatio: number;
  readonly maxWorkerRatio: number;
}

const CELLS: readonly CellSpec[] = [
  { cell: "static-only-raw", label: "static-only raw" },
  { cell: "generic-dynamic-raw", label: "generic dynamic raw" },
  { cell: "trailing-dynamic-json", label: "pure trailing dynamic JSON" },
  { cell: "collision-dynamic-raw", label: "forced collision raw" },
  { cell: "all-dynamic-raw", label: "ALL dynamic raw" },
];

const probeOnly = process.argv.includes("--probe-only");
const candidate = readCandidate(process.argv.slice(2));
const harnessSha = git(["rev-parse", "HEAD"]);
const cpu = cpus()[0]?.model ?? "unknown";
const logicalCpuCount = cpus().length;
const affinityLogicalCpu = Math.max(0, logicalCpuCount - 2);
const affinityMaskHex = (1n << BigInt(affinityLogicalCpu)).toString(16);
const worktreeA = resolve(REPOSITORY_ROOT, "..", `gelis-cp4aq3-a-${RUN_TOKEN}`);
const worktreeB = resolve(REPOSITORY_ROOT, "..", `gelis-cp4aq3-b-${RUN_TOKEN}`);
let worktreeACreated = false;
let worktreeBCreated = false;
let completed = false;
let workerResultSequence = 0;

preflight();

try {
  createWorktree(worktreeA, PRODUCTION);
  worktreeACreated = true;
  createWorktree(worktreeB, candidate);
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
    `CP4-AQ3 CORRECTNESS PROBE: PASS (${CELLS.length}/${CELLS.length} paired-source checks)`,
  );
} else if (completed) {
  console.log();
  console.log("CP4-AQ3 LOCAL PRODUCTION PERFORMANCE DECISION RUN: COMPLETE");
}

function printHeader(): void {
  console.log(
    "Competitive Performance v0.1 — CP4-AQ3 production performance decision protocol",
  );
  console.log(`Bun:             ${Bun.version}`);
  console.log(`Revision:        ${Bun.revision}`);
  console.log(`CPU:             ${cpu}`);
  console.log(`Logical CPUs:    ${logicalCpuCount}`);
  console.log(`Harness SHA:     ${harnessSha}`);
  console.log(`Production A:    ${PRODUCTION}`);
  console.log(`Candidate B:     ${candidate}`);
  console.log(`Worker blob:     ${WORKER_BLOB} (exact AQ1F2/AQ2 worker)`);
  console.log(`Routes:          ${ROUTES.toLocaleString("en-US")}`);

  if (probeOnly) {
    console.log("Mode:            correctness probe only");
  } else {
    console.log(
      `Paired workers:  ${PAIRED_WORKERS_PER_CELL} fresh workers/cell`,
    );
    console.log(`Cycles/worker:   ${CYCLES_PER_WORKER}`);
    console.log("Cycle order:     balanced ABBA / BAAB within each process");
    console.log("Timed legs:      32 per worker (4 legs × 8 cycles)");
    console.log("Cells:           5 calibrated representative hotpaths");
    console.log(
      "Classifier:      CI upper <= 0.98 improvement; CI lower >= 1.02 regression",
    );
    console.log(
      "Material floor:  median <= 0.95 improvement; median >= 1.05 regression estimate",
    );
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
    console.log(`PASS paired-production+candidate-${spec.cell}`);
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
        `PROGRESS aq3 ${cellIndex + 1}/${CELLS.length} ${spec.cell} worker ${workerIndex + 1}/${PAIRED_WORKERS_PER_CELL}`,
      );
      const result = runWorker(spec.cell, workerIndex, false);
      validateTimedResult(result, spec.cell, workerIndex);
      results.push(result);
    }
    all.set(spec.cell, results);
  }

  const diagnostics = buildDiagnostics(all);
  printDiagnostics(diagnostics);
  printWorkerRatios(all);
  printDecision(diagnostics);
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
    result.baabRatios.length !== 4 ||
    result.aMetrics.length !== CYCLES_PER_WORKER * 2 ||
    result.bMetrics.length !== CYCLES_PER_WORKER * 2
  ) {
    throw new Error(`Result shape mismatch for ${cell} #${workerIndex}`);
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
    const bootstrap = bootstrapInterval(
      workerRatios,
      `${spec.cell}:${candidate}`,
    );
    const workerMedianRatio = median(workerRatios);
    const classification = classify(bootstrap.low, bootstrap.high);
    output.set(spec.cell, {
      rawMedianRatio: median(allB) / median(allA),
      workerMedianRatio,
      bootstrapLow: bootstrap.low,
      bootstrapHigh: bootstrap.high,
      classification,
      materialImprovement:
        classification === "CLEAR IMPROVEMENT" &&
        workerMedianRatio <= MATERIAL_IMPROVEMENT,
      materialRegressionEstimate: workerMedianRatio >= MATERIAL_REGRESSION,
      minWorkerRatio: Math.min(...workerRatios),
      maxWorkerRatio: Math.max(...workerRatios),
    });
  }
  return output;
}

function classify(low: number, high: number): Classification {
  if (high <= CLEAR_IMPROVEMENT_UPPER) return "CLEAR IMPROVEMENT";
  if (low >= CLEAR_REGRESSION_LOWER) return "CLEAR REGRESSION";
  return "INCONCLUSIVE";
}

function printDiagnostics(diagnostics: ReadonlyMap<Cell, Diagnostics>): void {
  console.log("Production vs candidate hotpath diagnostics");
  console.log(
    "| comparison | raw leg median B/A | paired-worker median | bootstrap 95% CI | classification | material 5% |",
  );
  console.log("| --- | ---: | ---: | ---: | --- | --- |");
  for (const spec of CELLS) {
    const value = getDiagnostics(diagnostics, spec.cell);
    const material = value.materialImprovement
      ? "IMPROVEMENT"
      : value.materialRegressionEstimate
        ? "REGRESSION ESTIMATE"
        : "NO";
    console.log(
      `| ${spec.label} | ${value.rawMedianRatio.toFixed(4)}x | ${value.workerMedianRatio.toFixed(4)}x | ${value.bootstrapLow.toFixed(4)}x–${value.bootstrapHigh.toFixed(4)}x | ${value.classification} | ${material} |`,
    );
  }
}

function printWorkerRatios(all: ReadonlyMap<Cell, WorkerResult[]>): void {
  console.log();
  console.log("Fresh paired-worker median cycle ratios candidate / production");
  console.log("| comparison | median | min | max | workers |");
  console.log("| --- | ---: | ---: | ---: | ---: |");
  for (const spec of CELLS) {
    const ratios = getResults(all, spec.cell).map(
      (result) => result.workerRatio!,
    );
    console.log(
      `| ${spec.label} | ${median(ratios).toFixed(4)}x | ${Math.min(...ratios).toFixed(4)}x | ${Math.max(...ratios).toFixed(4)}x | ${ratios.length} |`,
    );
  }
}

function printDecision(diagnostics: ReadonlyMap<Cell, Diagnostics>): void {
  const values = CELLS.map((spec) => getDiagnostics(diagnostics, spec.cell));
  const clearRegressions = values.filter(
    (value) => value.classification === "CLEAR REGRESSION",
  ).length;
  const clearImprovements = values.filter(
    (value) => value.classification === "CLEAR IMPROVEMENT",
  ).length;
  const materialImprovements = values.filter(
    (value) => value.materialImprovement,
  ).length;
  const materialRegressionEstimates = values.filter(
    (value) => value.materialRegressionEstimate,
  ).length;

  let decision: HotpathDecision;
  if (clearRegressions > 0) {
    decision = "REJECTED FOR PRODUCTION PROMOTION";
  } else if (materialRegressionEstimates > 0) {
    decision = "HOLD / INCONCLUSIVE";
  } else if (materialImprovements > 0) {
    decision = "ELIGIBLE FOR PRODUCTION PROMOTION";
  } else {
    decision = "HOLD / INCONCLUSIVE";
  }

  console.log();
  console.log("Frozen CP4-AQ3 hotpath decision summary");
  console.log("| check | count | meaning |");
  console.log("| --- | ---: | --- |");
  console.log(
    `| clear improvements | ${clearImprovements} | bootstrap CI entirely at or below 0.98x |`,
  );
  console.log(
    `| material improvements | ${materialImprovements} | clear improvement with median at or below 0.95x |`,
  );
  console.log(
    `| clear regressions | ${clearRegressions} | bootstrap CI entirely at or above 1.02x |`,
  );
  console.log(
    `| material regression estimates | ${materialRegressionEstimates} | median at or above 1.05x, blocks promotion even if CI is inconclusive |`,
  );
  console.log();
  console.log(`CP4-AQ3 HOTPATH DECISION: ${decision}`);
  console.log(
    "AQ3 is candidate-vs-production hotpath evidence only. Final source promotion still requires repository Quality/correctness and any separately applicable memory gate.",
  );
}

function bootstrapInterval(
  values: readonly number[],
  seedLabel: string,
): { readonly low: number; readonly high: number } {
  const random = seededRandom(hashString(seedLabel) ^ 0xa3000003);
  const samples: number[] = [];
  for (let rep = 0; rep < BOOTSTRAP_REPS; rep++) {
    const sample: number[] = [];
    for (let index = 0; index < values.length; index++) {
      sample.push(values[Math.floor(random() * values.length)]!);
    }
    samples.push(median(sample));
  }
  samples.sort((a, b) => a - b);
  return {
    low: percentileSorted(samples, 0.025),
    high: percentileSorted(samples, 0.975),
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
    `--source-root-a=${worktreeA}`,
    `--source-root-b=${worktreeB}`,
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
    `gelis-cp4aq3-result-${process.pid}-${Date.now()}-${workerResultSequence++}.json`,
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
    if (launched.status === 0) resultText = readFileSync(resultFile, "utf8");
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
    throw new Error(`CP4-AQ3 requires Bun ${EXPECTED_BUN}, got ${Bun.version}`);
  }
  if (Bun.revision !== EXPECTED_BUN_REVISION) {
    throw new Error(
      `CP4-AQ3 requires Bun revision ${EXPECTED_BUN_REVISION}, got ${Bun.revision}`,
    );
  }
  const dirty = git(["status", "--porcelain"]);
  if (dirty !== "") {
    throw new Error(`CP4-AQ3 requires a clean worktree:\n${dirty}`);
  }
  git(["cat-file", "-e", `${PRODUCTION}^{commit}`]);
  git(["cat-file", "-e", `${candidate}^{commit}`]);
  if (!probeOnly && candidate === PRODUCTION) {
    throw new Error("CP4-AQ3 timed decision requires candidate != production");
  }
  if (!probeOnly) {
    if (process.platform !== "win32") {
      throw new Error(
        "CP4-AQ3 timed decision is authoritative only on Windows",
      );
    }
    if (logicalCpuCount !== EXPECTED_LOCAL_LOGICAL_CPUS) {
      throw new Error(
        `CP4-AQ3 timed decision requires ${EXPECTED_LOCAL_LOGICAL_CPUS} logical CPUs, got ${logicalCpuCount}`,
      );
    }
  }
}

function readCandidate(values: readonly string[]): string {
  const prefix = "--candidate=";
  const value = values
    .find((item) => item.startsWith(prefix))
    ?.slice(prefix.length);
  if (value === undefined || value.length === 0) {
    throw new Error("CP4-AQ3 requires --candidate=<commit-sha>");
  }
  return value;
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

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
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
