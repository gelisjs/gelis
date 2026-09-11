import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const WORKER = resolve(HERE, "p11-g8-zero-unused-worker.mts");

const CONTROL_SHA = "c6a65d639679464744ba3be21cfc8acb0f850d9a";
const CANDIDATE_SHA = "4b9053d7efaec35e71d35b3fbb0cb5b97cba7b61";
const SAMPLE_COUNT = 11;
const CASE_GATE = 1.03;
const GEOMEAN_GATE = 1.015;

type ZeroScenario =
  | "static-raw"
  | "dynamic-raw"
  | "static-json"
  | "dynamic-json";

interface WorkerResult {
  readonly mode: "zero-unused";
  readonly framework: "gelis";
  readonly scenario: ZeroScenario;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number;
  readonly sink: number;
  readonly routes: number;
}

interface PairedResult {
  readonly controlNs: number;
  readonly candidateNs: number;
  readonly ratio: number;
  readonly controlFirstRatio: number;
  readonly candidateFirstRatio: number;
}

const options = readOptions(process.argv.slice(2));
const controlRoot = resolve(ROOT, options.controlRoot);
const candidateRoot = resolve(ROOT, options.candidateRoot);

const controlSha = gitHead(controlRoot);
const candidateSha = gitHead(candidateRoot);

if (controlSha !== CONTROL_SHA) {
  throw new Error(
    `P11-G8 control must be ${CONTROL_SHA}, received ${controlSha}`,
  );
}

if (candidateSha !== CANDIDATE_SHA) {
  throw new Error(
    `P11-G8 candidate must be ${CANDIDATE_SHA}, received ${candidateSha}`,
  );
}

assertCleanWorkingTree(controlRoot, "control");
assertCleanWorkingTree(candidateRoot, "candidate");

console.log("P11-G8 Request-ID + Timeout Zero-Unused Acceptance");
console.log(`Bun:       ${Bun.version}`);
console.log(`CPU:       ${cpus()[0]?.model ?? "unknown"}`);
console.log(`Control:   ${controlSha}`);
console.log(`Candidate: ${candidateSha}`);
console.log("Routes:    5,000 mixed routes");
console.log(`Samples:   ${SAMPLE_COUNT} mirrored fresh-process pairs\n`);

const scenarios: readonly ZeroScenario[] = [
  "static-raw",
  "dynamic-raw",
  "static-json",
  "dynamic-json",
];

console.log("Zero-unused regression vs frozen P11-F completion control");
console.log(
  "| scenario | control ns/op | candidate ns/op | candidate/control | control-first | candidate-first | gate |",
);
console.log("| --- | ---: | ---: | ---: | ---: | ---: | --- |");

let accepted = true;
const ratios: number[] = [];

for (const scenario of scenarios) {
  const result = await runMirroredRoots(scenario, controlRoot, candidateRoot);
  const pass = result.ratio <= CASE_GATE;

  ratios.push(result.ratio);
  accepted &&= pass;

  console.log(
    `| ${scenario} | ${formatNs(result.controlNs)} | ${formatNs(result.candidateNs)} | ${formatRatio(result.ratio)} | ${formatRatio(result.controlFirstRatio)} | ${formatRatio(result.candidateFirstRatio)} | ${pass ? "PASS" : "FAIL"} |`,
  );
}

const geomean = geometricMean(ratios);
const geomeanPass = geomean <= GEOMEAN_GATE;
accepted &&= geomeanPass;

console.log(
  `\nZero-unused geomean: ${formatRatio(geomean)} <= ${GEOMEAN_GATE.toFixed(3)}x => ${geomeanPass ? "PASS" : "FAIL"}`,
);
console.log(`\nP11-G8 ACCEPTANCE: ${accepted ? "PASS" : "FAIL"}`);

if (!accepted) {
  process.exitCode = 1;
}

async function runMirroredRoots(
  scenario: ZeroScenario,
  control: string,
  candidate: string,
): Promise<PairedResult> {
  const pairs: Array<{
    control: WorkerResult;
    candidate: WorkerResult;
    controlFirst: boolean;
  }> = [];

  for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
    const controlFirst = sample % 2 === 0;

    const first = await runWorker([
      `--scenario=${scenario}`,
      `--root=${controlFirst ? control : candidate}`,
    ]);
    const second = await runWorker([
      `--scenario=${scenario}`,
      `--root=${controlFirst ? candidate : control}`,
    ]);

    pairs.push({
      control: controlFirst ? first : second,
      candidate: controlFirst ? second : first,
      controlFirst,
    });
  }

  const pairRatios = pairs.map(
    (pair) => pair.candidate.nsPerOp / pair.control.nsPerOp,
  );
  const controlFirstRatios = pairs
    .filter((pair) => pair.controlFirst)
    .map((pair) => pair.candidate.nsPerOp / pair.control.nsPerOp);
  const candidateFirstRatios = pairs
    .filter((pair) => !pair.controlFirst)
    .map((pair) => pair.candidate.nsPerOp / pair.control.nsPerOp);

  return {
    controlNs: median(pairs.map((pair) => pair.control.nsPerOp)),
    candidateNs: median(pairs.map((pair) => pair.candidate.nsPerOp)),
    ratio: median(pairRatios),
    controlFirstRatio: median(controlFirstRatios),
    candidateFirstRatio: median(candidateFirstRatios),
  };
}

async function runWorker(args: readonly string[]): Promise<WorkerResult> {
  const child = Bun.spawn([process.execPath, WORKER, ...args], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdoutPromise = new Response(child.stdout).text();
  const stderrPromise = new Response(child.stderr).text();
  const exitCode = await child.exited;
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

  if (exitCode !== 0) {
    throw new Error(
      ["P11-G8 benchmark worker failed", ...args, stdout, stderr].join("\n"),
    );
  }

  const lines = stdout
    .trim()
    .split(/\r?\n/u)
    .filter((line) => line.length > 0);
  const last = lines.at(-1);

  if (last === undefined) {
    throw new Error("P11-G8 benchmark worker emitted no JSON");
  }

  const parsed: unknown = JSON.parse(last);
  if (!isWorkerResult(parsed)) {
    throw new Error(`Invalid P11-G8 worker result: ${last}`);
  }

  return parsed;
}

function isWorkerResult(value: unknown): value is WorkerResult {
  return (
    value !== null &&
    typeof value === "object" &&
    "mode" in value &&
    value.mode === "zero-unused" &&
    "framework" in value &&
    value.framework === "gelis" &&
    "scenario" in value &&
    typeof value.scenario === "string" &&
    "iterations" in value &&
    typeof value.iterations === "number" &&
    value.iterations > 0 &&
    "warmups" in value &&
    typeof value.warmups === "number" &&
    value.warmups > 0 &&
    "nsPerOp" in value &&
    typeof value.nsPerOp === "number" &&
    Number.isFinite(value.nsPerOp) &&
    value.nsPerOp > 0 &&
    "sink" in value &&
    typeof value.sink === "number" &&
    "routes" in value &&
    value.routes === 5_000
  );
}

interface Options {
  readonly controlRoot: string;
  readonly candidateRoot: string;
}

function readOptions(values: readonly string[]): Options {
  let controlRoot: string | undefined;
  let candidateRoot: string | undefined;

  for (const value of values) {
    if (value.startsWith("--control-root=")) {
      controlRoot = value.slice("--control-root=".length);
    } else if (value.startsWith("--candidate-root=")) {
      candidateRoot = value.slice("--candidate-root=".length);
    }
  }

  if (controlRoot === undefined || controlRoot.length === 0) {
    throw new Error("P11-G8 benchmark requires --control-root=<path>");
  }

  if (candidateRoot === undefined || candidateRoot.length === 0) {
    throw new Error("P11-G8 benchmark requires --candidate-root=<path>");
  }

  return { controlRoot, candidateRoot };
}

function gitHead(root: string): string {
  const result = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr));
  }

  return new TextDecoder().decode(result.stdout).trim();
}

function assertCleanWorkingTree(root: string, label: string): void {
  const result = Bun.spawnSync(["git", "status", "--porcelain"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr));
  }

  const status = new TextDecoder().decode(result.stdout).trim();
  if (status.length !== 0) {
    throw new Error(`P11-G8 ${label} worktree must be clean:\n${status}`);
  }
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot compute median of empty P11-G8 sample set");
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[midpoint]!
    : (sorted[midpoint - 1]! + sorted[midpoint]!) / 2;
}

function geometricMean(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot compute geometric mean of empty P11-G8 set");
  }

  return Math.exp(
    values.reduce((total, value) => total + Math.log(value), 0) / values.length,
  );
}

function formatNs(value: number): string {
  return value.toFixed(1);
}

function formatRatio(value: number): string {
  return `${value.toFixed(4)}x`;
}
