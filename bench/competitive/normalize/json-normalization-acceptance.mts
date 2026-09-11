import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const EXPECTED_BUN = "1.4.2";
const PRODUCTION_SOURCE = "1dd5f94cf0e9ad884ca44e537ee287587cd8baab";
const SAMPLES = 11;

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, "json-normalization-worker.mts");
const REPOSITORY_ROOT = resolve(HERE, "../../..");

type PayloadKind = "static" | "dynamic";

type Strategy =
  | "response-json-default"
  | "response-json-empty-init"
  | "response-json-status200-inline"
  | "response-json-status200-shared"
  | "normalize-with-status200"
  | "normalize-current"
  | "candidate-success";

type Cell = `${PayloadKind}::${Strategy}`;

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

const PAYLOAD_KINDS: readonly PayloadKind[] = ["static", "dynamic"];
const STRATEGIES: readonly Strategy[] = [
  "response-json-default",
  "response-json-empty-init",
  "response-json-status200-inline",
  "response-json-status200-shared",
  "normalize-with-status200",
  "normalize-current",
  "candidate-success",
];

const probeOnly = process.argv.includes("--probe-only");
const harnessSha = git(["rev-parse", "HEAD"]);
const cpu = cpus()[0]?.model ?? "unknown";
const cells = PAYLOAD_KINDS.flatMap((payloadKind) =>
  STRATEGIES.map((strategy) => `${payloadKind}::${strategy}` as Cell),
);

preflight();

console.log("Competitive Performance v0.1 — CP3-B JSON normalization decomposition");
console.log(`Bun:         ${Bun.version}`);
console.log(`CPU:         ${cpu}`);
console.log(`Harness SHA: ${harnessSha}`);
console.log(`Gelis src:   ${PRODUCTION_SOURCE}`);
console.log(`Cells:       ${cells.length}`);
console.log(
  probeOnly
    ? "Mode:        correctness probe only"
    : `Samples:     ${SAMPLES} fresh worker processes/cell`,
);
console.log();

if (probeOnly) {
  for (const cell of cells) {
    const result = runWorker(cell, true);

    if (!result.probeOnly || result.cell !== cell) {
      throw new Error(`Invalid probe result for ${cell}`);
    }

    console.log(`PASS ${cell}`);
  }

  console.log();
  console.log(
    `CP3-B CORRECTNESS PROBE: PASS (${cells.length}/${cells.length})`,
  );
  process.exit(0);
}

const summaries = new Map<Cell, Summary>();

console.log("JSON response construction and normalization");
console.log("| payload | strategy | median ns/op | p25 | p75 | min | max |");
console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: |");

for (const payloadKind of PAYLOAD_KINDS) {
  for (const strategy of STRATEGIES) {
    const cell = `${payloadKind}::${strategy}` as Cell;
    const summary = measureCell(cell);
    summaries.set(cell, summary);

    console.log(
      `| ${payloadKind} | ${strategy} | ${format(summary.median)} | ${format(summary.p25)} | ${format(summary.p75)} | ${format(summary.min)} | ${format(summary.max)} |`,
    );
  }
}

console.log();
console.log(
  "Derived diagnostics — non-additive, for engineering direction only",
);
console.log("| diagnostic | value |");
console.log("| --- | ---: |");

for (const payloadKind of PAYLOAD_KINDS) {
  const direct = median(payloadKind, "response-json-default");
  const emptyInit = median(payloadKind, "response-json-empty-init");
  const inlineStatus = median(payloadKind, "response-json-status200-inline");
  const sharedStatus = median(payloadKind, "response-json-status200-shared");
  const withStatus = median(payloadKind, "normalize-with-status200");
  const current = median(payloadKind, "normalize-current");
  const candidate = median(payloadKind, "candidate-success");

  printDiagnostic(
    `${payloadKind}: Response.json({}, init={}) / default`,
    emptyInit / direct,
    "x",
  );
  printDiagnostic(
    `${payloadKind}: Response.json(status=200 inline) / default`,
    inlineStatus / direct,
    "x",
  );
  printDiagnostic(
    `${payloadKind}: Response.json(status=200 shared) / default`,
    sharedStatus / direct,
    "x",
  );
  printDiagnostic(
    `${payloadKind}: normalizeWithStatus(200) / default`,
    withStatus / direct,
    "x",
  );
  printDiagnostic(
    `${payloadKind}: current normalize / default`,
    current / direct,
    "x",
  );
  printDiagnostic(
    `${payloadKind}: candidate success / default`,
    candidate / direct,
    "x",
  );
  printDiagnostic(
    `${payloadKind}: inline status200 - default`,
    inlineStatus - direct,
    "ns",
  );
  printDiagnostic(
    `${payloadKind}: with-status - inline status200`,
    withStatus - inlineStatus,
    "ns",
  );
  printDiagnostic(
    `${payloadKind}: current - with-status`,
    current - withStatus,
    "ns",
  );
  printDiagnostic(
    `${payloadKind}: candidate - default`,
    candidate - direct,
    "ns",
  );
  printDiagnostic(
    `${payloadKind}: candidate / current`,
    candidate / current,
    "x",
  );
}

console.log();
console.log("CP3-B LOCAL NORMALIZATION RUN: COMPLETE");

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
    throw new Error(`CP3-B requires Bun ${EXPECTED_BUN}, got ${Bun.version}`);
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty !== "") {
    throw new Error(`CP3-B requires a clean worktree:\n${dirty}`);
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
    {
      encoding: "utf8",
    },
  );

  if (sourceDiff.status !== 0) {
    throw new Error(
      `src/** differs from frozen production source ${PRODUCTION_SOURCE}`,
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
  if (sorted.length === 0) {
    throw new Error("Cannot calculate empty quantile");
  }

  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower]!;
  }

  const weight = index - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

function median(payloadKind: PayloadKind, strategy: Strategy): number {
  const cell = `${payloadKind}::${strategy}` as Cell;
  const summary = summaries.get(cell);

  if (summary === undefined) {
    throw new Error(`Missing summary for ${cell}`);
  }

  return summary.median;
}

function printDiagnostic(label: string, value: number, unit: "x" | "ns"): void {
  const rendered =
    unit === "x" ? `${value.toFixed(4)}x` : `${value.toFixed(1)} ns`;

  console.log(`| ${label} | ${rendered} |`);
}

function format(value: number): string {
  return value.toFixed(1);
}
