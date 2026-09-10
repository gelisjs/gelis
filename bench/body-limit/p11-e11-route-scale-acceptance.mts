import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const WORKER = resolve(HERE, "p11-e11-route-scale-worker.mts");

const E10_BASE_SHA = "50f0726855954b38a985367f0b45b57acfb488d3";
const SAMPLE_COUNT = 11;
const ROUTE_SCALE_GATE = 1.5;

type RouteCount = 1_000 | 5_000;

interface WorkerResult {
  readonly routeCount: RouteCount;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number;
  readonly sink: number;
}

interface PairedResult {
  readonly oneThousandNs: number;
  readonly fiveThousandNs: number;
  readonly ratio: number;
  readonly oneThousandFirstRatio: number;
  readonly fiveThousandFirstRatio: number;
}

assertCleanWorkingTree(ROOT);
assertImplementationEquivalentToE10(ROOT);

const headSha = gitHead(ROOT);
const result = await runMirroredRouteCounts();
const accepted = result.ratio <= ROUTE_SCALE_GATE;

console.log("P11-E11 Body Limit Route-Scale Acceptance");
console.log(`Bun:       ${Bun.version}`);
console.log(`CPU:       ${cpus()[0]?.model ?? "unknown"}`);
console.log(`E10 base:  ${E10_BASE_SHA}`);
console.log(`Candidate: ${headSha}`);
console.log(`Samples:   ${SAMPLE_COUNT} mirrored fresh-process pairs`);
console.log(
  "Workload:  managed static route + app body-limit + header fast reject\n",
);

console.log("Request-time route-scale");
console.log(
  "| 1,000 routes ns/op | 5,000 routes ns/op | 5000/1000 | 1000-first | 5000-first | gate |",
);
console.log("| ---: | ---: | ---: | ---: | ---: | --- |");
console.log(
  `| ${formatNs(result.oneThousandNs)} | ${formatNs(result.fiveThousandNs)} | ${formatRatio(result.ratio)} | ${formatRatio(result.oneThousandFirstRatio)} | ${formatRatio(result.fiveThousandFirstRatio)} | ${accepted ? "PASS" : "FAIL"} |`,
);
console.log(
  `\nRoute-scale gate: ${formatRatio(result.ratio)} <= ${ROUTE_SCALE_GATE.toFixed(2)}x => ${accepted ? "PASS" : "FAIL"}`,
);
console.log(`\nP11-E11 ACCEPTANCE: ${accepted ? "PASS" : "FAIL"}`);

if (!accepted) {
  process.exitCode = 1;
}

async function runMirroredRouteCounts(): Promise<PairedResult> {
  const pairs: Array<{
    oneThousand: WorkerResult;
    fiveThousand: WorkerResult;
    oneThousandFirst: boolean;
  }> = [];

  for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
    const oneThousandFirst = sample % 2 === 0;
    const firstCount: RouteCount = oneThousandFirst ? 1_000 : 5_000;
    const secondCount: RouteCount = oneThousandFirst ? 5_000 : 1_000;

    const first = await runWorker(firstCount);
    const second = await runWorker(secondCount);

    pairs.push({
      oneThousand: oneThousandFirst ? first : second,
      fiveThousand: oneThousandFirst ? second : first,
      oneThousandFirst,
    });
  }

  const pairRatios = pairs.map(
    (pair) => pair.fiveThousand.nsPerOp / pair.oneThousand.nsPerOp,
  );
  const oneThousandFirstRatios = pairs
    .filter((pair) => pair.oneThousandFirst)
    .map((pair) => pair.fiveThousand.nsPerOp / pair.oneThousand.nsPerOp);
  const fiveThousandFirstRatios = pairs
    .filter((pair) => !pair.oneThousandFirst)
    .map((pair) => pair.fiveThousand.nsPerOp / pair.oneThousand.nsPerOp);

  return {
    oneThousandNs: median(pairs.map((pair) => pair.oneThousand.nsPerOp)),
    fiveThousandNs: median(pairs.map((pair) => pair.fiveThousand.nsPerOp)),
    ratio: median(pairRatios),
    oneThousandFirstRatio: median(oneThousandFirstRatios),
    fiveThousandFirstRatio: median(fiveThousandFirstRatios),
  };
}

async function runWorker(routeCount: RouteCount): Promise<WorkerResult> {
  const child = Bun.spawn(
    [process.execPath, WORKER, `--routes=${routeCount}`],
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
        "P11-E11 benchmark worker failed",
        `routes=${routeCount}`,
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
    throw new Error("P11-E11 benchmark worker emitted no JSON");
  }

  const parsed: unknown = JSON.parse(last);
  if (!isWorkerResult(parsed, routeCount)) {
    throw new Error(`Invalid P11-E11 worker result: ${last}`);
  }

  return parsed;
}

function isWorkerResult(
  value: unknown,
  routeCount: RouteCount,
): value is WorkerResult {
  return (
    value !== null &&
    typeof value === "object" &&
    "routeCount" in value &&
    value.routeCount === routeCount &&
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

function assertImplementationEquivalentToE10(root: string): void {
  const result = Bun.spawnSync(
    [
      "git",
      "diff",
      "--quiet",
      E10_BASE_SHA,
      "--",
      "src",
      "package.json",
      "bun.lock",
    ],
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
      "P11-E11 requires runtime, package, and lockfile state identical to accepted E10",
    );
  }

  throw new Error(new TextDecoder().decode(result.stderr));
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
    throw new Error(`P11-E11 working tree must be clean:\n${status}`);
  }
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot compute median of empty P11-E11 sample set");
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[midpoint]!
    : (sorted[midpoint - 1]! + sorted[midpoint]!) / 2;
}

function formatNs(value: number): string {
  return value.toFixed(1);
}

function formatRatio(value: number): string {
  return `${value.toFixed(4)}x`;
}
