import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_BUN = "1.4.2";
const EXPECTED_BUN_REVISION = "744846f844374847c902b5e7fd59b4342a51ef99";
const SOURCE = "5d9698d6b8d368ddcff358fc2645435b93c0c062";
const EXPECTED_WORKER_BLOB = "9df1a3a236b0ec07626fce9e85041291448963e1";
const ROUTES = 5_000;
const PAIRED_WORKERS_PER_CELL = 16;
const CYCLES_PER_WORKER = 8;
const BOOTSTRAP_REPS = 5_000;
const NEUTRAL_LOW = 0.98;
const NEUTRAL_HIGH = 1.02;
const EXPECTED_LOCAL_LOGICAL_CPUS = 12;
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = resolve(
  HERE,
  "cp4aq2-hotpath-detectability-frontier-worker.mts",
);
const REPOSITORY_ROOT = resolve(HERE, "../..");
const RUN_TOKEN = `${process.pid}-${Date.now()}`;
const WORKTREE_A = resolve(
  REPOSITORY_ROOT,
  "..",
  `gelis-cp4aq2-a-${RUN_TOKEN}`,
);
const WORKTREE_B = resolve(
  REPOSITORY_ROOT,
  "..",
  `gelis-cp4aq2-b-${RUN_TOKEN}`,
);

type Cell =
  | "static-only-raw"
  | "generic-dynamic-raw"
  | "trailing-dynamic-json"
  | "collision-dynamic-raw"
  | "all-dynamic-raw";

type Classification = "CLEAR IMPROVEMENT" | "INCONCLUSIVE" | "CLEAR REGRESSION";

type EffectKey = "minus10" | "minus5" | "control" | "plus5" | "plus10";

interface CellSpec {
  readonly cell: Cell;
  readonly label: string;
}

interface EffectSpec {
  readonly key: EffectKey;
  readonly label: string;
  readonly factor: number;
  readonly expected: Classification;
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

interface FrontierRow {
  readonly cell: Cell;
  readonly effect: EffectSpec;
  readonly estimate: number;
  readonly bootstrapLow: number;
  readonly bootstrapHigh: number;
  readonly classification: Classification;
  readonly pass: boolean;
}

interface RawDiagnostics {
  readonly median: number;
  readonly bootstrapLow: number;
  readonly bootstrapHigh: number;
  readonly min: number;
  readonly max: number;
}

const CELLS: readonly CellSpec[] = [
  { cell: "static-only-raw", label: "static-only raw" },
  { cell: "generic-dynamic-raw", label: "generic dynamic raw" },
  { cell: "trailing-dynamic-json", label: "pure trailing dynamic JSON" },
  { cell: "collision-dynamic-raw", label: "forced collision raw" },
  { cell: "all-dynamic-raw", label: "ALL dynamic raw" },
];

const EFFECTS: readonly EffectSpec[] = [
  {
    key: "minus10",
    label: "-10% latency",
    factor: 0.9,
    expected: "CLEAR IMPROVEMENT",
  },
  {
    key: "minus5",
    label: "-5% latency",
    factor: 0.95,
    expected: "CLEAR IMPROVEMENT",
  },
  {
    key: "control",
    label: "0% control",
    factor: 1,
    expected: "INCONCLUSIVE",
  },
  {
    key: "plus5",
    label: "+5% latency",
    factor: 1.05,
    expected: "CLEAR REGRESSION",
  },
  {
    key: "plus10",
    label: "+10% latency",
    factor: 1.1,
    expected: "CLEAR REGRESSION",
  },
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
    `CP4-AQ2 CORRECTNESS PROBE: PASS (${CELLS.length}/${CELLS.length} paired-source checks)`,
  );
} else if (completed) {
  console.log();
  console.log("CP4-AQ2 LOCAL HOTPATH DETECTABILITY FRONTIER RUN: COMPLETE");
}

function printHeader(): void {
  console.log(
    "Competitive Performance v0.1 — CP4-AQ2 hotpath detectability frontier",
  );
  console.log(`Bun:             ${Bun.version}`);
  console.log(`Revision:        ${Bun.revision}`);
  console.log(`CPU:             ${cpu}`);
  console.log(`Logical CPUs:    ${logicalCpuCount}`);
  console.log(`Harness SHA:     ${harnessSha}`);
  console.log(`Source A:        ${SOURCE}`);
  console.log(`Source B:        ${SOURCE}`);
  console.log(`Worker blob:     ${EXPECTED_WORKER_BLOB} (exact AQ1F2 worker)`);
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
    console.log("Cells:           5 representative hotpaths");
    console.log("Synthetic bands: -10%, -5%, 0%, +5%, +10% latency");
    console.log(
      `Neutral zone:    ${NEUTRAL_LOW.toFixed(2)}x–${NEUTRAL_HIGH.toFixed(2)}x`,
    );
    console.log(
      "Injection:       post-timing multiplicative shift of B/A ratios",
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
        `PROGRESS aq2 ${cellIndex + 1}/${CELLS.length} ${spec.cell} worker ${workerIndex + 1}/${PAIRED_WORKERS_PER_CELL}`,
      );
      const result = runWorker(spec.cell, workerIndex, false);
      validateTimedResult(result, spec.cell, workerIndex);
      results.push(result);
    }
    all.set(spec.cell, results);
  }

  printRawDiagnostics(all);
  const rows = buildFrontierRows(all);
  printFrontierRows(rows);
  printBandSummary(rows);
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

function printRawDiagnostics(all: ReadonlyMap<Cell, WorkerResult[]>): void {
  console.log(
    "Raw same-source paired-worker diagnostics before synthetic shifting",
  );
  console.log("| comparison | median B/A | bootstrap 95% CI | min | max |");
  console.log("| --- | ---: | ---: | ---: | ---: |");

  for (const spec of CELLS) {
    const values = getResults(all, spec.cell).map(
      (result) => result.workerRatio!,
    );
    const diagnostic = rawDiagnostics(values, spec.cell);
    console.log(
      `| ${spec.label} | ${diagnostic.median.toFixed(4)}x | ${diagnostic.bootstrapLow.toFixed(4)}x–${diagnostic.bootstrapHigh.toFixed(4)}x | ${diagnostic.min.toFixed(4)}x | ${diagnostic.max.toFixed(4)}x |`,
    );
  }
}

function rawDiagnostics(values: readonly number[], cell: Cell): RawDiagnostics {
  const sorted = [...values].sort((a, b) => a - b);
  const bootstrap = bootstrapInterval(values, `${cell}:raw`);
  return {
    median: median(values),
    bootstrapLow: bootstrap.low,
    bootstrapHigh: bootstrap.high,
    min: sorted[0]!,
    max: sorted.at(-1)!,
  };
}

function buildFrontierRows(
  all: ReadonlyMap<Cell, WorkerResult[]>,
): readonly FrontierRow[] {
  const rows: FrontierRow[] = [];

  for (const spec of CELLS) {
    const rawRatios = getResults(all, spec.cell).map(
      (result) => result.workerRatio!,
    );

    for (const effect of EFFECTS) {
      const shifted = rawRatios.map((ratio) => ratio * effect.factor);
      const bootstrap = bootstrapInterval(
        shifted,
        `${spec.cell}:${effect.key}`,
      );
      const classification = classify(bootstrap.low, bootstrap.high);
      rows.push({
        cell: spec.cell,
        effect,
        estimate: median(shifted),
        bootstrapLow: bootstrap.low,
        bootstrapHigh: bootstrap.high,
        classification,
        pass: classification === effect.expected,
      });
    }
  }

  return rows;
}

function classify(low: number, high: number): Classification {
  if (high <= NEUTRAL_LOW) return "CLEAR IMPROVEMENT";
  if (low >= NEUTRAL_HIGH) return "CLEAR REGRESSION";
  return "INCONCLUSIVE";
}

function printFrontierRows(rows: readonly FrontierRow[]): void {
  console.log();
  console.log("CP4-AQ2 synthetic multiplicative detectability matrix");
  console.log(
    "| comparison | injected effect | expected ratio | estimate | bootstrap 95% CI | classification | expected class | result |",
  );
  console.log("| --- | --- | ---: | ---: | ---: | --- | --- | --- |");

  for (const spec of CELLS) {
    for (const effect of EFFECTS) {
      const row = getRow(rows, spec.cell, effect.key);
      console.log(
        `| ${spec.label} | ${effect.label} | ${effect.factor.toFixed(2)}x | ${row.estimate.toFixed(4)}x | ${row.bootstrapLow.toFixed(4)}x–${row.bootstrapHigh.toFixed(4)}x | ${row.classification} | ${effect.expected} | ${row.pass ? "PASS" : "FAIL"} |`,
      );
    }
  }
}

function printBandSummary(rows: readonly FrontierRow[]): void {
  const controlPass = CELLS.every(
    (spec) => getRow(rows, spec.cell, "control").pass,
  );
  const fivePass = CELLS.every(
    (spec) =>
      getRow(rows, spec.cell, "minus5").pass &&
      getRow(rows, spec.cell, "plus5").pass,
  );
  const tenPass = CELLS.every(
    (spec) =>
      getRow(rows, spec.cell, "minus10").pass &&
      getRow(rows, spec.cell, "plus10").pass,
  );

  const frontier = !controlPass
    ? "INVALID CONTROL"
    : fivePass
      ? "5%"
      : tenPass
        ? "10%"
        : ">10%";

  console.log();
  console.log("Frozen CP4-AQ2 universal detectability summary");
  console.log("| check | requirement | result |");
  console.log("| --- | --- | --- |");
  console.log(
    `| 0% control | all five cells remain INCONCLUSIVE inside ±2% neutral policy | ${controlPass ? "PASS" : "FAIL"} |`,
  );
  console.log(
    `| ±5% latency | all five cells correctly classify both improvement and regression | ${fivePass ? "PASS" : "FAIL"} |`,
  );
  console.log(
    `| ±10% latency | all five cells correctly classify both improvement and regression | ${tenPass ? "PASS" : "FAIL"} |`,
  );
  console.log();
  console.log(`CP4-AQ2 UNIVERSAL HOTPATH DETECTION FLOOR: ${frontier}`);
  console.log(
    "AQ2 is same-source statistical detectability calibration only; synthetic shifts are applied after timing and cannot reclassify Gelis source performance.",
  );
}

function bootstrapInterval(
  values: readonly number[],
  seedKey: string,
): { readonly low: number; readonly high: number } {
  const random = seededRandom(hashString(seedKey) ^ 0xa2022026);
  const medians: number[] = [];

  for (let rep = 0; rep < BOOTSTRAP_REPS; rep++) {
    const sample: number[] = [];
    for (let index = 0; index < values.length; index++) {
      sample.push(values[Math.floor(random() * values.length)]!);
    }
    medians.push(median(sample));
  }

  medians.sort((a, b) => a - b);
  return {
    low: percentileSorted(medians, 0.025),
    high: percentileSorted(medians, 0.975),
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
    `gelis-cp4aq2-result-${process.pid}-${Date.now()}-${workerResultSequence++}.json`,
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
    throw new Error(`CP4-AQ2 requires Bun ${EXPECTED_BUN}, got ${Bun.version}`);
  }
  if (Bun.revision !== EXPECTED_BUN_REVISION) {
    throw new Error(
      `CP4-AQ2 requires Bun revision ${EXPECTED_BUN_REVISION}, got ${Bun.revision}`,
    );
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty !== "") {
    throw new Error(`CP4-AQ2 requires a clean worktree:\n${dirty}`);
  }

  const workerBlob = git(["hash-object", WORKER]);
  if (workerBlob !== EXPECTED_WORKER_BLOB) {
    throw new Error(
      `CP4-AQ2 requires exact AQ1F2 worker blob ${EXPECTED_WORKER_BLOB}, got ${workerBlob}`,
    );
  }

  if (!probeOnly) {
    if (process.platform !== "win32") {
      throw new Error(
        "CP4-AQ2 timed calibration is authoritative only on Windows",
      );
    }
    if (logicalCpuCount !== EXPECTED_LOCAL_LOGICAL_CPUS) {
      throw new Error(
        `CP4-AQ2 timed calibration requires ${EXPECTED_LOCAL_LOGICAL_CPUS} logical CPUs, got ${logicalCpuCount}`,
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

function getRow(
  rows: readonly FrontierRow[],
  cell: Cell,
  effectKey: EffectKey,
): FrontierRow {
  const value = rows.find(
    (row) => row.cell === cell && row.effect.key === effectKey,
  );
  if (value === undefined) {
    throw new Error(`Missing frontier row for ${cell}/${effectKey}`);
  }
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
