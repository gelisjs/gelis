import { spawnSync } from "node:child_process";
import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_BUN = "1.4.2";
const EXPECTED_BUN_REVISION = "744846f844374847c902b5e7fd59b4342a51ef99";
const PRODUCTION_SOURCE = "af4e5102046def1b163435333563b8d08f919bf5";
const ROUTES = 5_000;
const SAMPLES = 11;
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, "cp3z-post-promotion-dynamic-residual-worker.mts");
const REPOSITORY_ROOT = resolve(HERE, "../..");

type Cell =
  | "pathname-request-dynamic"
  | "router-literal-dynamic"
  | "router-request-dynamic"
  | "handler-string-stable"
  | "handler-string-param"
  | "handler-json-stable"
  | "handler-json-param"
  | "pipeline-string-stable"
  | "pipeline-string-param"
  | "pipeline-json-stable"
  | "pipeline-json-param"
  | "app-string-stable"
  | "app-string-param"
  | "app-json-stable"
  | "app-json-param";

interface WorkerResult {
  readonly cell: Cell;
  readonly probeOnly: boolean;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number | null;
  readonly sink: number;
}

interface Summary {
  readonly cell: Cell;
  readonly median: number;
  readonly p25: number;
  readonly p75: number;
  readonly min: number;
  readonly max: number;
}

const CELLS: readonly Cell[] = [
  "pathname-request-dynamic",
  "router-literal-dynamic",
  "router-request-dynamic",
  "handler-string-stable",
  "handler-string-param",
  "handler-json-stable",
  "handler-json-param",
  "pipeline-string-stable",
  "pipeline-string-param",
  "pipeline-json-stable",
  "pipeline-json-param",
  "app-string-stable",
  "app-string-param",
  "app-json-stable",
  "app-json-param",
];

const probeOnly = process.argv.includes("--probe-only");
const harnessSha = git(["rev-parse", "HEAD"]);
const cpu = cpus()[0]?.model ?? "unknown";

preflight();
printHeader();

if (probeOnly) {
  for (const cell of CELLS) {
    const result = runWorker(cell, true);
    if (!result.probeOnly || result.cell !== cell) {
      throw new Error(`Invalid probe result for ${cell}`);
    }
    console.log(`PASS ${cell}`);
  }

  console.log();
  console.log(
    `CP3-Z CORRECTNESS PROBE: PASS (${CELLS.length}/${CELLS.length})`,
  );
  process.exit(0);
}

const summaries = new Map<Cell, Summary>();

console.log("Post-promotion dynamic residual cells");
console.log("| cell | median ns/op | p25 | p75 | min | max |");
console.log("| --- | ---: | ---: | ---: | ---: | ---: |");

for (const cell of CELLS) {
  const summary = measureCell(cell);
  summaries.set(cell, summary);
  console.log(
    `| ${cell} | ${format(summary.median)} | ${format(summary.p25)} | ${format(summary.p75)} | ${format(summary.min)} | ${format(summary.max)} |`,
  );
}

console.log();
console.log("Derived diagnostics — non-additive, engineering direction only");
console.log("| diagnostic | value |");
console.log("| --- | ---: |");
printRatio(
  "router request-derived / literal",
  "router-request-dynamic",
  "router-literal-dynamic",
);
printDelta(
  "router request-derived - literal",
  "router-request-dynamic",
  "router-literal-dynamic",
);
printDelta(
  "router request-derived - pathname only",
  "router-request-dynamic",
  "pathname-request-dynamic",
);
printDelta(
  "handler stable string - request router",
  "handler-string-stable",
  "router-request-dynamic",
);
printDelta(
  "handler param string - stable string",
  "handler-string-param",
  "handler-string-stable",
);
printDelta(
  "handler stable JSON - request router",
  "handler-json-stable",
  "router-request-dynamic",
);
printDelta(
  "handler param JSON - stable JSON",
  "handler-json-param",
  "handler-json-stable",
);
printDelta(
  "normalize stable string",
  "pipeline-string-stable",
  "handler-string-stable",
);
printDelta(
  "normalize param string",
  "pipeline-string-param",
  "handler-string-param",
);
printDelta(
  "normalize stable JSON",
  "pipeline-json-stable",
  "handler-json-stable",
);
printDelta("normalize param JSON", "pipeline-json-param", "handler-json-param");
printDelta(
  "app.fetch stable string - pipeline",
  "app-string-stable",
  "pipeline-string-stable",
);
printDelta(
  "app.fetch param string - pipeline",
  "app-string-param",
  "pipeline-string-param",
);
printDelta(
  "app.fetch stable JSON - pipeline",
  "app-json-stable",
  "pipeline-json-stable",
);
printDelta(
  "app.fetch param JSON - pipeline",
  "app-json-param",
  "pipeline-json-param",
);
printDelta(
  "param penalty at string handler",
  "handler-string-param",
  "handler-string-stable",
);
printDelta(
  "param penalty at string pipeline",
  "pipeline-string-param",
  "pipeline-string-stable",
);
printDelta(
  "param penalty at string app.fetch",
  "app-string-param",
  "app-string-stable",
);
printDelta(
  "param penalty at JSON handler",
  "handler-json-param",
  "handler-json-stable",
);
printDelta(
  "param penalty at JSON pipeline",
  "pipeline-json-param",
  "pipeline-json-stable",
);
printDelta(
  "param penalty at JSON app.fetch",
  "app-json-param",
  "app-json-stable",
);

console.log();
console.log(
  "CP3-Z is decomposition-only: no performance acceptance threshold is applied.",
);
console.log();
console.log("CP3-Z LOCAL DYNAMIC RESIDUAL DECOMPOSITION RUN: COMPLETE");

function printHeader(): void {
  console.log(
    "Competitive Performance v0.1 — CP3-Z post-promotion dynamic residual decomposition",
  );
  console.log(`Bun:         ${Bun.version}`);
  console.log(`Revision:    ${Bun.revision}`);
  console.log(`CPU:         ${cpu}`);
  console.log(`Harness SHA: ${harnessSha}`);
  console.log(`Gelis src:   ${PRODUCTION_SOURCE}`);
  console.log(`Routes:      ${ROUTES.toLocaleString("en-US")}`);
  console.log(
    probeOnly
      ? "Mode:        correctness probe only"
      : `Samples:     ${SAMPLES} fresh worker processes/cell`,
  );
  console.log();
}

function measureCell(cell: Cell): Summary {
  const values: number[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const result = runWorker(cell, false);
    if (result.nsPerOp === null) {
      throw new Error(`Missing timing for ${cell}`);
    }
    values.push(result.nsPerOp);
  }

  values.sort((left, right) => left - right);

  return {
    cell,
    median: quantile(values, 0.5),
    p25: quantile(values, 0.25),
    p75: quantile(values, 0.75),
    min: values[0]!,
    max: values.at(-1)!,
  };
}

function runWorker(cell: Cell, workerProbeOnly: boolean): WorkerResult {
  const result = spawnSync(
    process.execPath,
    [
      WORKER,
      `--cell=${cell}`,
      `--probe-only=${workerProbeOnly ? "true" : "false"}`,
    ],
    {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      env: process.env,
      maxBuffer: 1024 * 1024,
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `Worker failed for ${cell}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }

  const line = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (line === undefined) {
    throw new Error(`Worker emitted no result for ${cell}`);
  }

  const parsed = JSON.parse(line) as WorkerResult;
  if (parsed.cell !== cell) {
    throw new Error(
      `Worker cell mismatch: expected ${cell}, got ${parsed.cell}`,
    );
  }
  return parsed;
}

function preflight(): void {
  if (Bun.version !== EXPECTED_BUN) {
    throw new Error(`CP3-Z requires Bun ${EXPECTED_BUN}, got ${Bun.version}`);
  }
  if (Bun.revision !== EXPECTED_BUN_REVISION) {
    throw new Error(
      `CP3-Z requires Bun revision ${EXPECTED_BUN_REVISION}, got ${Bun.revision}`,
    );
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty !== "") {
    throw new Error(`CP3-Z requires a clean worktree:\n${dirty}`);
  }

  const sourceDiff = spawnSync(
    "git",
    [
      "-C",
      REPOSITORY_ROOT,
      "diff",
      "--quiet",
      PRODUCTION_SOURCE,
      "HEAD",
      "--",
      "src",
    ],
    { encoding: "utf8" },
  );
  if (sourceDiff.status !== 0) {
    throw new Error(
      `src/** differs from frozen production ${PRODUCTION_SOURCE}`,
    );
  }

  const ancestor = spawnSync(
    "git",
    [
      "-C",
      REPOSITORY_ROOT,
      "merge-base",
      "--is-ancestor",
      PRODUCTION_SOURCE,
      "HEAD",
    ],
    { encoding: "utf8" },
  );
  if (ancestor.status !== 0) {
    throw new Error(
      `Frozen production ${PRODUCTION_SOURCE} is not an ancestor of HEAD`,
    );
  }
}

function git(args: readonly string[]): string {
  const result = spawnSync("git", ["-C", REPOSITORY_ROOT, ...args], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function quantile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) throw new Error("Cannot calculate empty quantile");
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  const weight = index - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

function median(cell: Cell): number {
  const summary = summaries.get(cell);
  if (summary === undefined) {
    throw new Error(`Missing summary for ${cell}`);
  }
  return summary.median;
}

function printRatio(label: string, numerator: Cell, denominator: Cell): void {
  console.log(
    `| ${label} | ${(median(numerator) / median(denominator)).toFixed(4)}x |`,
  );
}

function printDelta(label: string, left: Cell, right: Cell): void {
  console.log(`| ${label} | ${(median(left) - median(right)).toFixed(1)} ns |`);
}

function format(value: number): string {
  return value.toFixed(1);
}
