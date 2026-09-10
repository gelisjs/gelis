import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const WORKER = resolve(HERE, "p11-d-worker.mts");

const CONTROL_SHA = "f2b104df8ffbe96348c51271a1868a1c4f9141c7";
const SAMPLE_COUNT = 11;

const ZERO_CASE_GATE = 1.03;
const ZERO_GEOMEAN_GATE = 1.015;
const STATIC_CASE_GATE = 1.10;
const STATIC_GEOMEAN_GATE = 1.05;
const DYNAMIC_CASE_GATE = 1.15;
const SCALING_GATE = 1.50;

type ZeroScenario =
  | "static-raw"
  | "dynamic-raw"
  | "static-json"
  | "dynamic-json";

type EnabledScenario =
  | "actual-wildcard"
  | "actual-allowlist"
  | "actual-credentialed"
  | "preflight-static-methods"
  | "actual-dynamic-origin";

type Framework = "gelis" | "hono";

interface WorkerResult {
  readonly mode: "zero-unused" | "enabled" | "scaling";
  readonly framework: Framework;
  readonly scenario: string;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number;
  readonly sink: number;
  readonly routes?: number;
}

interface PairedResult {
  readonly leftNs: number;
  readonly rightNs: number;
  readonly ratio: number;
  readonly leftFirstRatio: number;
  readonly rightFirstRatio: number;
}

const options = readOptions(process.argv.slice(2));
const controlRoot = resolve(ROOT, options.controlRoot);
const candidateRoot = resolve(ROOT, options.candidateRoot);

const controlSha = gitHead(controlRoot);
const candidateSha = gitHead(candidateRoot);

if (controlSha !== CONTROL_SHA) {
  throw new Error(
    `P11-D control must be ${CONTROL_SHA}, received ${controlSha}`,
  );
}

const honoVersion = await readHonoVersion(candidateRoot);

console.log("P11-D CORS Capability Acceptance");
console.log(`Bun:       ${Bun.version}`);
console.log(`CPU:       ${cpus()[0]?.model ?? "unknown"}`);
console.log(`Control:   ${controlSha}`);
console.log(`Candidate: ${candidateSha}`);
console.log(`Hono:      ${honoVersion}`);
console.log(`Samples:   ${SAMPLE_COUNT} mirrored fresh-process pairs\n`);

let accepted = true;

const zeroScenarios: readonly ZeroScenario[] = [
  "static-raw",
  "dynamic-raw",
  "static-json",
  "dynamic-json",
];

console.log("Zero-unused regression vs pre-CORS control");
console.log(
  "| scenario | control ns/op | candidate ns/op | candidate/control | control-first | candidate-first | gate |",
);
console.log("| --- | ---: | ---: | ---: | ---: | ---: | --- |");

const zeroRatios: number[] = [];

for (const scenario of zeroScenarios) {
  const result = await runMirroredRoots(scenario, controlRoot, candidateRoot);
  const pass = result.ratio <= ZERO_CASE_GATE;
  zeroRatios.push(result.ratio);
  accepted &&= pass;

  console.log(
    `| ${scenario} | ${formatNs(result.leftNs)} | ${formatNs(result.rightNs)} | ${formatRatio(result.ratio)} | ${formatRatio(result.leftFirstRatio)} | ${formatRatio(result.rightFirstRatio)} | ${pass ? "PASS" : "FAIL"} |`,
  );
}

const zeroGeomean = geometricMean(zeroRatios);
const zeroGeomeanPass = zeroGeomean <= ZERO_GEOMEAN_GATE;
accepted &&= zeroGeomeanPass;
console.log(
  `\nZero-unused geomean: ${formatRatio(zeroGeomean)} <= ${ZERO_GEOMEAN_GATE.toFixed(3)}x => ${zeroGeomeanPass ? "PASS" : "FAIL"}\n`,
);

const enabledScenarios: readonly EnabledScenario[] = [
  "actual-wildcard",
  "actual-allowlist",
  "actual-credentialed",
  "preflight-static-methods",
  "actual-dynamic-origin",
];

console.log("Enabled CORS comparison vs Hono");
console.log(
  "| scenario | Gelis ns/op | Hono ns/op | Gelis/Hono | Hono-first | Gelis-first | gate |",
);
console.log("| --- | ---: | ---: | ---: | ---: | ---: | --- |");

const staticRatios: number[] = [];

for (const scenario of enabledScenarios) {
  const result = await runMirroredFrameworks(scenario);
  const isDynamic = scenario === "actual-dynamic-origin";
  const gate = isDynamic ? DYNAMIC_CASE_GATE : STATIC_CASE_GATE;
  const pass = result.ratio <= gate;
  accepted &&= pass;

  if (!isDynamic) {
    staticRatios.push(result.ratio);
  }

  console.log(
    `| ${scenario} | ${formatNs(result.leftNs)} | ${formatNs(result.rightNs)} | ${formatRatio(result.ratio)} | ${formatRatio(result.rightFirstRatio)} | ${formatRatio(result.leftFirstRatio)} | ${pass ? "PASS" : "FAIL"} |`,
  );
}

const staticGeomean = geometricMean(staticRatios);
const staticGeomeanPass = staticGeomean <= STATIC_GEOMEAN_GATE;
accepted &&= staticGeomeanPass;
console.log(
  `\nEnabled static geomean: ${formatRatio(staticGeomean)} <= ${STATIC_GEOMEAN_GATE.toFixed(2)}x => ${staticGeomeanPass ? "PASS" : "FAIL"}\n`,
);

console.log("Route-aware preflight scalability");
const scaling = await runMirroredScaling();
const scalingPass = scaling.ratio <= SCALING_GATE;
accepted &&= scalingPass;

console.log(
  `1,000 routes: ${formatNs(scaling.leftNs)} ns/op`,
);
console.log(
  `5,000 routes: ${formatNs(scaling.rightNs)} ns/op`,
);
console.log(
  `5000/1000: ${formatRatio(scaling.ratio)} <= ${SCALING_GATE.toFixed(2)}x => ${scalingPass ? "PASS" : "FAIL"}`,
);
console.log(
  `Order diagnostics: 1000-first ${formatRatio(scaling.leftFirstRatio)}, 5000-first ${formatRatio(scaling.rightFirstRatio)}`,
);

console.log(`\nP11-D ACCEPTANCE: ${accepted ? "PASS" : "FAIL"}`);

if (!accepted) {
  process.exitCode = 1;
}

async function runMirroredRoots(
  scenario: ZeroScenario,
  control: string,
  candidate: string,
): Promise<PairedResult> {
  const pairs: Array<{
    left: WorkerResult;
    right: WorkerResult;
    leftFirst: boolean;
  }> = [];

  for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
    const leftFirst = sample % 2 === 0;

    const first = await runWorker([
      "--mode=zero-unused",
      `--scenario=${scenario}`,
      `--root=${leftFirst ? control : candidate}`,
    ]);
    const second = await runWorker([
      "--mode=zero-unused",
      `--scenario=${scenario}`,
      `--root=${leftFirst ? candidate : control}`,
    ]);

    pairs.push({
      left: leftFirst ? first : second,
      right: leftFirst ? second : first,
      leftFirst,
    });
  }

  return summarizePairs(pairs);
}

async function runMirroredFrameworks(
  scenario: EnabledScenario,
): Promise<PairedResult> {
  const pairs: Array<{
    left: WorkerResult;
    right: WorkerResult;
    leftFirst: boolean;
  }> = [];

  for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
    const gelisFirst = sample % 2 === 1;
    const firstFramework: Framework = gelisFirst ? "gelis" : "hono";
    const secondFramework: Framework = gelisFirst ? "hono" : "gelis";

    const first = await runWorker([
      "--mode=enabled",
      `--framework=${firstFramework}`,
      `--scenario=${scenario}`,
    ]);
    const second = await runWorker([
      "--mode=enabled",
      `--framework=${secondFramework}`,
      `--scenario=${scenario}`,
    ]);

    pairs.push({
      left: gelisFirst ? first : second,
      right: gelisFirst ? second : first,
      leftFirst: gelisFirst,
    });
  }

  return summarizePairs(pairs);
}

async function runMirroredScaling(): Promise<PairedResult> {
  const pairs: Array<{
    left: WorkerResult;
    right: WorkerResult;
    leftFirst: boolean;
  }> = [];

  for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
    const oneKFirst = sample % 2 === 0;
    const firstRoutes = oneKFirst ? 1_000 : 5_000;
    const secondRoutes = oneKFirst ? 5_000 : 1_000;

    const first = await runWorker([
      "--mode=scaling",
      `--routes=${firstRoutes}`,
    ]);
    const second = await runWorker([
      "--mode=scaling",
      `--routes=${secondRoutes}`,
    ]);

    pairs.push({
      left: oneKFirst ? first : second,
      right: oneKFirst ? second : first,
      leftFirst: oneKFirst,
    });
  }

  return summarizePairs(pairs);
}

function summarizePairs(
  pairs: readonly {
    readonly left: WorkerResult;
    readonly right: WorkerResult;
    readonly leftFirst: boolean;
  }[],
): PairedResult {
  const ratios = pairs.map((pair) => pair.right.nsPerOp / pair.left.nsPerOp);
  const leftFirstRatios = pairs
    .filter((pair) => pair.leftFirst)
    .map((pair) => pair.right.nsPerOp / pair.left.nsPerOp);
  const rightFirstRatios = pairs
    .filter((pair) => !pair.leftFirst)
    .map((pair) => pair.right.nsPerOp / pair.left.nsPerOp);

  return {
    leftNs: median(pairs.map((pair) => pair.left.nsPerOp)),
    rightNs: median(pairs.map((pair) => pair.right.nsPerOp)),
    ratio: median(ratios),
    leftFirstRatio: median(leftFirstRatios),
    rightFirstRatio: median(rightFirstRatios),
  };
}

async function runWorker(args: readonly string[]): Promise<WorkerResult> {
  const child = Bun.spawn([process.execPath, WORKER, ...args], {
    cwd: candidateRoot,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdoutPromise = new Response(child.stdout).text();
  const stderrPromise = new Response(child.stderr).text();
  const exitCode = await child.exited;
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

  if (exitCode !== 0) {
    throw new Error(
      ["P11-D benchmark worker failed", ...args, stdout, stderr].join("\n"),
    );
  }

  const lines = stdout
    .trim()
    .split(/\r?\n/u)
    .filter((line) => line.length > 0);
  const last = lines.at(-1);

  if (last === undefined) {
    throw new Error("P11-D benchmark worker emitted no JSON");
  }

  const parsed: unknown = JSON.parse(last);
  if (!isWorkerResult(parsed)) {
    throw new Error(`Invalid P11-D worker result: ${last}`);
  }

  return parsed;
}

function isWorkerResult(value: unknown): value is WorkerResult {
  return (
    value !== null &&
    typeof value === "object" &&
    "mode" in value &&
    (value.mode === "zero-unused" || value.mode === "enabled" || value.mode === "scaling") &&
    "framework" in value &&
    (value.framework === "gelis" || value.framework === "hono") &&
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
    typeof value.sink === "number"
  );
}

interface Options {
  readonly controlRoot: string;
  readonly candidateRoot: string;
}

function readOptions(values: readonly string[]): Options {
  let controlRoot: string | undefined;
  let candidateRoot = ".";

  for (const value of values) {
    if (value.startsWith("--control-root=")) {
      controlRoot = value.slice("--control-root=".length);
    } else if (value.startsWith("--candidate-root=")) {
      candidateRoot = value.slice("--candidate-root=".length);
    }
  }

  if (controlRoot === undefined || controlRoot.length === 0) {
    throw new Error("P11-D benchmark requires --control-root=<path>");
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

async function readHonoVersion(root: string): Promise<string> {
  const file = Bun.file(resolve(root, "node_modules/hono/package.json"));
  const json = (await file.json()) as { readonly version?: unknown };

  return typeof json.version === "string" ? json.version : "unknown";
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot compute median of empty P11-D sample set");
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[midpoint]!
    : (sorted[midpoint - 1]! + sorted[midpoint]!) / 2;
}

function geometricMean(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot compute geometric mean of empty P11-D set");
  }

  return Math.exp(
    values.reduce((total, value) => total + Math.log(value), 0) /
      values.length,
  );
}

function formatNs(value: number): string {
  return value.toFixed(1);
}

function formatRatio(value: number): string {
  return `${value.toFixed(4)}x`;
}
