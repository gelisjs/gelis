import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const WORKER = resolve(HERE, "p11-e10-enabled-worker.mts");

const E9_BASE_SHA = "92214a5bf099f9b5daacfda4f1d254b87a1f53bd";
const EXPECTED_HONO_VERSION = "4.13.5";
const SAMPLE_COUNT = 11;
const GEOMEAN_GATE = 1.1;

type Framework = "gelis" | "hono";
type Scenario =
  | "valid-header-under"
  | "streamed-under"
  | "header-fast-reject"
  | "stream-overflow";

interface WorkerResult {
  readonly framework: Framework;
  readonly scenario: Scenario;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number;
  readonly sink: number;
}

interface PairedResult {
  readonly gelisNs: number;
  readonly honoNs: number;
  readonly ratio: number;
  readonly honoFirstRatio: number;
  readonly gelisFirstRatio: number;
}

const scenarios: readonly Scenario[] = [
  "valid-header-under",
  "streamed-under",
  "header-fast-reject",
  "stream-overflow",
];

assertCleanWorkingTree(ROOT);
assertPackageEquivalentToE9(ROOT);

const headSha = gitHead(ROOT);
const honoVersion = await readHonoVersion(ROOT);

if (honoVersion !== EXPECTED_HONO_VERSION) {
  throw new Error(
    `P11-E10 requires Hono ${EXPECTED_HONO_VERSION}, received ${honoVersion}`,
  );
}

console.log("P11-E10 Body Limit Enabled Competitor Acceptance");
console.log(`Bun:       ${Bun.version}`);
console.log(`CPU:       ${cpus()[0]?.model ?? "unknown"}`);
console.log(`E9 base:   ${E9_BASE_SHA}`);
console.log(`Candidate: ${headSha}`);
console.log(`Hono:      ${honoVersion}`);
console.log(`Limit:     1,024 bytes`);
console.log(`Under:     768 bytes`);
console.log(`Over:      1,536 bytes`);
console.log(`Samples:   ${SAMPLE_COUNT} mirrored fresh-process pairs\n`);

console.log("Enabled body-limit comparison vs Hono");
console.log(
  "| scenario | Gelis ns/op | Hono ns/op | Gelis/Hono | Hono-first | Gelis-first | gate |",
);
console.log("| --- | ---: | ---: | ---: | ---: | ---: | --- |");

let accepted = true;
const ratios: number[] = [];

for (const scenario of scenarios) {
  const result = await runMirroredFrameworks(scenario);
  const gate = scenarioGate(scenario);
  const pass = result.ratio <= gate;

  ratios.push(result.ratio);
  accepted &&= pass;

  console.log(
    `| ${scenario} | ${formatNs(result.gelisNs)} | ${formatNs(result.honoNs)} | ${formatRatio(result.ratio)} | ${formatRatio(result.honoFirstRatio)} | ${formatRatio(result.gelisFirstRatio)} | ${pass ? "PASS" : "FAIL"} |`,
  );
}

const geomean = geometricMean(ratios);
const geomeanPass = geomean <= GEOMEAN_GATE;
accepted &&= geomeanPass;

console.log(
  `\nEnabled geomean: ${formatRatio(geomean)} <= ${GEOMEAN_GATE.toFixed(2)}x => ${geomeanPass ? "PASS" : "FAIL"}`,
);
console.log(
  "Semantic note: Gelis still counts actual request-body bytes when a valid Content-Length is present; Hono 4.13.5 fast-paths that case from the header before the handler consumes the body.",
);
console.log(`\nP11-E10 ACCEPTANCE: ${accepted ? "PASS" : "FAIL"}`);

if (!accepted) {
  process.exitCode = 1;
}

async function runMirroredFrameworks(
  scenario: Scenario,
): Promise<PairedResult> {
  const pairs: Array<{
    gelis: WorkerResult;
    hono: WorkerResult;
    honoFirst: boolean;
  }> = [];

  for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
    const honoFirst = sample % 2 === 0;
    const firstFramework: Framework = honoFirst ? "hono" : "gelis";
    const secondFramework: Framework = honoFirst ? "gelis" : "hono";

    const first = await runWorker(firstFramework, scenario);
    const second = await runWorker(secondFramework, scenario);

    pairs.push({
      gelis: honoFirst ? second : first,
      hono: honoFirst ? first : second,
      honoFirst,
    });
  }

  const pairRatios = pairs.map(
    (pair) => pair.gelis.nsPerOp / pair.hono.nsPerOp,
  );
  const honoFirstRatios = pairs
    .filter((pair) => pair.honoFirst)
    .map((pair) => pair.gelis.nsPerOp / pair.hono.nsPerOp);
  const gelisFirstRatios = pairs
    .filter((pair) => !pair.honoFirst)
    .map((pair) => pair.gelis.nsPerOp / pair.hono.nsPerOp);

  return {
    gelisNs: median(pairs.map((pair) => pair.gelis.nsPerOp)),
    honoNs: median(pairs.map((pair) => pair.hono.nsPerOp)),
    ratio: median(pairRatios),
    honoFirstRatio: median(honoFirstRatios),
    gelisFirstRatio: median(gelisFirstRatios),
  };
}

async function runWorker(
  framework: Framework,
  scenario: Scenario,
): Promise<WorkerResult> {
  const child = Bun.spawn(
    [
      process.execPath,
      WORKER,
      `--framework=${framework}`,
      `--scenario=${scenario}`,
    ],
    {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const stdoutPromise = new Response(child.stdout).text();
  const stderrPromise = new Response(child.stderr).text();
  const exitCode = await child.exited;
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

  if (exitCode !== 0) {
    throw new Error(
      [
        "P11-E10 benchmark worker failed",
        `framework=${framework}`,
        `scenario=${scenario}`,
        stdout,
        stderr,
      ].join("\n"),
    );
  }

  const lines = stdout
    .trim()
    .split(/\r?\n/u)
    .filter((line) => line.length > 0);
  const last = lines.at(-1);

  if (last === undefined) {
    throw new Error("P11-E10 benchmark worker emitted no JSON");
  }

  const parsed: unknown = JSON.parse(last);
  if (!isWorkerResult(parsed, framework, scenario)) {
    throw new Error(`Invalid P11-E10 worker result: ${last}`);
  }

  return parsed;
}

function isWorkerResult(
  value: unknown,
  framework: Framework,
  scenario: Scenario,
): value is WorkerResult {
  return (
    value !== null &&
    typeof value === "object" &&
    "framework" in value &&
    value.framework === framework &&
    "scenario" in value &&
    value.scenario === scenario &&
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

function scenarioGate(scenario: Scenario): number {
  switch (scenario) {
    case "valid-header-under":
    case "streamed-under":
    case "stream-overflow":
      return 1.15;
    case "header-fast-reject":
      return 1.1;
  }
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

function assertCleanWorkingTree(root: string): void {
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
    throw new Error(`P11-E10 working tree must be clean:\n${status}`);
  }
}

function assertPackageEquivalentToE9(root: string): void {
  const result = Bun.spawnSync(
    ["git", "diff", "--quiet", E9_BASE_SHA, "--", "package.json", "bun.lock"],
    {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  if (result.exitCode === 0) {
    return;
  }

  if (result.exitCode === 1) {
    throw new Error(
      "P11-E10 requires package and lockfile state identical to accepted E9 base",
    );
  }

  throw new Error(new TextDecoder().decode(result.stderr));
}

async function readHonoVersion(root: string): Promise<string> {
  const file = Bun.file(resolve(root, "node_modules/hono/package.json"));
  const json = (await file.json()) as { readonly version?: unknown };

  return typeof json.version === "string" ? json.version : "unknown";
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot compute median of empty P11-E10 sample set");
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[midpoint]!
    : (sorted[midpoint - 1]! + sorted[midpoint]!) / 2;
}

function geometricMean(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot compute geometric mean of empty P11-E10 set");
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
