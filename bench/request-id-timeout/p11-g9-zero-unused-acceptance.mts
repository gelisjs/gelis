import { readFileSync, rmSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const EXPECTED_BUN = "1.4.2";
const EXPECTED_BUN_REVISION = "744846f844374847c902b5e7fd59b4342a51ef99";
const CONTROL_SHA = "457e14e491c2d27450a81ddbeb4a7db04b8f77b1";
const CANDIDATE_SHA = "8483fe31f96a1965ace152295bbdaefa77a6fce8";
const ROUTES = 5_000;
const PAIRED_WORKERS_PER_CELL = 16;
const CYCLES_PER_WORKER = 8;
const BOOTSTRAP_REPS = 5_000;
const CASE_GATE = 1.03;
const GEOMEAN_GATE = 1.015;
const EXPECTED_LOCAL_LOGICAL_CPUS = 12;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(HERE, "../..");
const WORKER = resolve(HERE, "p11-g9-zero-unused-worker.mts");
const RUN_TOKEN = `${process.pid}-${Date.now()}`;

type ZeroScenario =
  "static-raw" | "dynamic-raw" | "static-json" | "dynamic-json";

interface WorkerResult {
  readonly mode: "zero-unused";
  readonly scenario: ZeroScenario;
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
  readonly controlMetrics: readonly number[];
  readonly candidateMetrics: readonly number[];
  readonly sink: number;
  readonly routes: number;
}

interface CellDiagnostics {
  readonly rawMedianRatio: number;
  readonly workerMedianRatio: number;
  readonly bootstrapLow: number;
  readonly bootstrapHigh: number;
  readonly minWorkerRatio: number;
  readonly maxWorkerRatio: number;
  readonly pass: boolean;
}

const SCENARIOS: readonly ZeroScenario[] = [
  "static-raw",
  "dynamic-raw",
  "static-json",
  "dynamic-json",
];

const probeOnly = process.argv.includes("--probe-only");
const harnessSha = git(["rev-parse", "HEAD"]);
const workerBlob = git(["hash-object", WORKER]);
const cpu = cpus()[0]?.model ?? "unknown";
const logicalCpuCount = cpus().length;
const affinityLogicalCpu = Math.max(0, logicalCpuCount - 2);
const affinityMaskHex = (1n << BigInt(affinityLogicalCpu)).toString(16);
const controlRoot = resolve(
  REPOSITORY_ROOT,
  "..",
  `gelis-p11-g9-control-${RUN_TOKEN}`,
);
const candidateRoot = resolve(
  REPOSITORY_ROOT,
  "..",
  `gelis-p11-g9-candidate-${RUN_TOKEN}`,
);
let controlCreated = false;
let candidateCreated = false;
let workerResultSequence = 0;
let completed = false;

preflight();

try {
  createWorktree(controlRoot, CONTROL_SHA);
  controlCreated = true;
  createWorktree(candidateRoot, CANDIDATE_SHA);
  candidateCreated = true;

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
    `P11-G9 ZERO-UNUSED CORRECTNESS PROBE: PASS (${SCENARIOS.length}/${SCENARIOS.length} paired-source checks)`,
  );
} else if (completed) {
  console.log();
  console.log("P11-G9 ZERO-UNUSED LOCAL ACCEPTANCE RUN: COMPLETE");
}

function printHeader(): void {
  console.log("P11-G9 Request-ID + Timeout Zero-Unused Acceptance");
  console.log(`Bun:             ${Bun.version}`);
  console.log(`Revision:        ${Bun.revision}`);
  console.log(`CPU:             ${cpu}`);
  console.log(`Logical CPUs:    ${logicalCpuCount}`);
  console.log(`Harness SHA:     ${harnessSha}`);
  console.log(`Control A:       ${CONTROL_SHA}`);
  console.log(`Candidate B:     ${CANDIDATE_SHA}`);
  console.log(`Worker blob:     ${workerBlob}`);
  console.log(
    `Routes:          ${ROUTES.toLocaleString("en-US")} mixed routes`,
  );

  if (probeOnly) {
    console.log("Mode:            correctness probe only");
  } else {
    console.log(
      `Paired workers:  ${PAIRED_WORKERS_PER_CELL} fresh workers/cell`,
    );
    console.log(`Cycles/worker:   ${CYCLES_PER_WORKER}`);
    console.log("Cycle order:     balanced ABBA / BAAB within each process");
    console.log("Timed legs:      32 per worker (4 legs × 8 cycles)");
    console.log(
      `Case gate:       candidate/control median <= ${CASE_GATE.toFixed(3)}x`,
    );
    console.log(
      `Geomean gate:    four-case geomean <= ${GEOMEAN_GATE.toFixed(3)}x`,
    );
    console.log(
      `Windows affinity: logical CPU ${affinityLogicalCpu} (0x${affinityMaskHex})`,
    );
    console.log("Worker priority: HIGH");
    console.log(
      `Bootstrap:       ${BOOTSTRAP_REPS.toLocaleString("en-US")} deterministic worker resamples (diagnostic only)`,
    );
  }
  console.log();
}

function runProbe(): void {
  for (const scenario of SCENARIOS) {
    const result = runWorker(scenario, 0, true);
    if (
      !result.probeOnly ||
      result.scenario !== scenario ||
      result.routes !== ROUTES
    ) {
      throw new Error(`Invalid P11-G9 probe result for ${scenario}`);
    }
    console.log(`PASS paired-control+candidate-${scenario}`);
  }
}

function runTiming(): void {
  const diagnostics = new Map<ZeroScenario, CellDiagnostics>();

  for (
    let scenarioIndex = 0;
    scenarioIndex < SCENARIOS.length;
    scenarioIndex++
  ) {
    const scenario = SCENARIOS[scenarioIndex]!;
    const results: WorkerResult[] = [];

    for (
      let workerIndex = 0;
      workerIndex < PAIRED_WORKERS_PER_CELL;
      workerIndex++
    ) {
      console.log(
        `PROGRESS g9 ${scenarioIndex + 1}/${SCENARIOS.length} ${scenario} worker ${workerIndex + 1}/${PAIRED_WORKERS_PER_CELL}`,
      );
      const result = runWorker(scenario, workerIndex, false);
      validateTimedResult(result, scenario, workerIndex);
      results.push(result);
    }

    const workerRatios = results.map((result) => result.workerRatio!);
    const controlMetrics = results.flatMap((result) => result.controlMetrics);
    const candidateMetrics = results.flatMap(
      (result) => result.candidateMetrics,
    );
    const bootstrap = bootstrapInterval(
      workerRatios,
      `${scenario}:${CANDIDATE_SHA}`,
    );
    const workerMedianRatio = median(workerRatios);

    diagnostics.set(scenario, {
      rawMedianRatio: median(candidateMetrics) / median(controlMetrics),
      workerMedianRatio,
      bootstrapLow: bootstrap.low,
      bootstrapHigh: bootstrap.high,
      minWorkerRatio: Math.min(...workerRatios),
      maxWorkerRatio: Math.max(...workerRatios),
      pass: workerMedianRatio <= CASE_GATE,
    });
  }

  printDiagnostics(diagnostics);
  printDecision(diagnostics);
}

function validateTimedResult(
  result: WorkerResult,
  scenario: ZeroScenario,
  workerIndex: number,
): void {
  if (
    result.probeOnly ||
    result.mode !== "zero-unused" ||
    result.scenario !== scenario ||
    result.workerIndex !== workerIndex ||
    result.routes !== ROUTES ||
    result.unit !== "ns/op"
  ) {
    throw new Error(
      `P11-G9 worker identity mismatch for ${scenario} #${workerIndex}`,
    );
  }

  if (
    result.workerRatio === null ||
    result.cycles !== CYCLES_PER_WORKER ||
    result.cycleRatios.length !== CYCLES_PER_WORKER ||
    result.abbaRatios.length !== 4 ||
    result.baabRatios.length !== 4 ||
    result.controlMetrics.length !== CYCLES_PER_WORKER * 2 ||
    result.candidateMetrics.length !== CYCLES_PER_WORKER * 2
  ) {
    throw new Error(`Incomplete P11-G9 result for ${scenario} #${workerIndex}`);
  }
}

function printDiagnostics(
  diagnostics: ReadonlyMap<ZeroScenario, CellDiagnostics>,
): void {
  console.log();
  console.log("Zero-unused candidate / frozen-control diagnostics");
  console.log(
    "| scenario | raw leg median | paired-worker median | bootstrap 95% CI | min | max | gate |",
  );
  console.log("| --- | ---: | ---: | ---: | ---: | ---: | --- |");

  for (const scenario of SCENARIOS) {
    const value = getDiagnostics(diagnostics, scenario);
    console.log(
      `| ${scenario} | ${value.rawMedianRatio.toFixed(4)}x | ${value.workerMedianRatio.toFixed(4)}x | ${value.bootstrapLow.toFixed(4)}x–${value.bootstrapHigh.toFixed(4)}x | ${value.minWorkerRatio.toFixed(4)}x | ${value.maxWorkerRatio.toFixed(4)}x | ${value.pass ? "PASS" : "FAIL"} |`,
    );
  }
}

function printDecision(
  diagnostics: ReadonlyMap<ZeroScenario, CellDiagnostics>,
): void {
  const values = SCENARIOS.map((scenario) =>
    getDiagnostics(diagnostics, scenario),
  );
  const ratios = values.map((value) => value.workerMedianRatio);
  const geomean = geometricMean(ratios);
  const geomeanPass = geomean <= GEOMEAN_GATE;
  const casesPass = values.every((value) => value.pass);
  const accepted = casesPass && geomeanPass;

  console.log();
  console.log(
    `Zero-unused geomean: ${geomean.toFixed(4)}x <= ${GEOMEAN_GATE.toFixed(3)}x => ${geomeanPass ? "PASS" : "FAIL"}`,
  );
  console.log(`P11-G9 ZERO-UNUSED ACCEPTANCE: ${accepted ? "PASS" : "FAIL"}`);

  if (!accepted) {
    process.exitCode = 1;
  }
}

function runWorker(
  scenario: ZeroScenario,
  workerIndex: number,
  workerProbeOnly: boolean,
): WorkerResult {
  const args = [
    WORKER,
    `--scenario=${scenario}`,
    `--control-root=${controlRoot}`,
    `--candidate-root=${candidateRoot}`,
    `--worker-index=${workerIndex}`,
    `--probe-only=${workerProbeOnly ? "true" : "false"}`,
  ];

  const result =
    workerProbeOnly || process.platform !== "win32"
      ? spawnSync(process.execPath, args, workerOptions())
      : spawnPinnedWindowsWorker(args);

  if (result.status !== 0) {
    throw new Error(
      `P11-G9 worker failed for ${scenario} #${workerIndex}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }

  const line = result.stdout.trim().split(/\r?\n/u).filter(Boolean).at(-1);
  if (line === undefined) {
    throw new Error(
      `P11-G9 worker emitted no result for ${scenario} #${workerIndex}`,
    );
  }

  return JSON.parse(line) as WorkerResult;
}

function spawnPinnedWindowsWorker(args: readonly string[]) {
  const bunPath = quotePowerShell(process.execPath);
  const resultFile = resolve(
    REPOSITORY_ROOT,
    "..",
    `gelis-p11-g9-result-${process.pid}-${Date.now()}-${workerResultSequence++}.json`,
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
    throw new Error(`P11-G9 requires Bun ${EXPECTED_BUN}, got ${Bun.version}`);
  }
  if (Bun.revision !== EXPECTED_BUN_REVISION) {
    throw new Error(
      `P11-G9 requires Bun revision ${EXPECTED_BUN_REVISION}, got ${Bun.revision}`,
    );
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty !== "") {
    throw new Error(`P11-G9 requires a clean harness worktree:\n${dirty}`);
  }

  git(["cat-file", "-e", `${CONTROL_SHA}^{commit}`]);
  git(["cat-file", "-e", `${CANDIDATE_SHA}^{commit}`]);

  if (!probeOnly) {
    if (process.platform !== "win32") {
      throw new Error(
        "P11-G9 timed acceptance is authoritative only on Windows",
      );
    }
    if (logicalCpuCount !== EXPECTED_LOCAL_LOGICAL_CPUS) {
      throw new Error(
        `P11-G9 timed acceptance requires ${EXPECTED_LOCAL_LOGICAL_CPUS} logical CPUs, got ${logicalCpuCount}`,
      );
    }
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
      `Unable to create P11-G9 worktree for ${source}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
}

function cleanupWorktrees(): void {
  if (candidateCreated) removeWorktree(candidateRoot);
  if (controlCreated) removeWorktree(controlRoot);
}

function removeWorktree(path: string): void {
  spawnSync(
    "git",
    ["-C", REPOSITORY_ROOT, "worktree", "remove", "--force", path],
    { encoding: "utf8" },
  );
}

function bootstrapInterval(
  values: readonly number[],
  seedLabel: string,
): { readonly low: number; readonly high: number } {
  const random = seededRandom(hashString(seedLabel) ^ 0x11090009);
  const samples: number[] = [];

  for (let rep = 0; rep < BOOTSTRAP_REPS; rep++) {
    const sample: number[] = [];
    for (let index = 0; index < values.length; index++) {
      sample.push(values[Math.floor(random() * values.length)]!);
    }
    samples.push(median(sample));
  }

  samples.sort((left, right) => left - right);
  return {
    low: percentileSorted(samples, 0.025),
    high: percentileSorted(samples, 0.975),
  };
}

function getDiagnostics(
  all: ReadonlyMap<ZeroScenario, CellDiagnostics>,
  scenario: ZeroScenario,
): CellDiagnostics {
  const value = all.get(scenario);
  if (value === undefined) {
    throw new Error(`Missing P11-G9 diagnostics for ${scenario}`);
  }
  return value;
}

function median(values: readonly number[]): number {
  return percentileSorted(
    [...values].sort((left, right) => left - right),
    0.5,
  );
}

function percentileSorted(values: readonly number[], quantile: number): number {
  if (values.length === 0) {
    throw new Error("Cannot summarize empty P11-G9 values");
  }
  const index = (values.length - 1) * quantile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const lowerValue = values[lower]!;
  const upperValue = values[upper]!;
  if (lower === upper) return lowerValue;
  return lowerValue + (upperValue - lowerValue) * (index - lower);
}

function geometricMean(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot compute empty P11-G9 geomean");
  }
  return Math.exp(
    values.reduce((sum, value) => sum + Math.log(value), 0) / values.length,
  );
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
