import { spawnSync } from "node:child_process";
import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_BUN = "1.4.2";
const EXPECTED_BUN_REVISION = "744846f844374847c902b5e7fd59b4342a51ef99";
const PRODUCTION_SOURCE = "af4e5102046def1b163435333563b8d08f919bf5";
const CP4X_SOURCE = "efaa228231c920fee78053edeb5c8c094f324aca";
const CP4Z_SOURCE = "1b4057ad9d12bc28d2ab2ca7917924368fe99444";
const ROUTES = 5_000;
const SAMPLES = 12;
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, "cp4aa-production-x-z-attribution-worker.mts");
const REPOSITORY_ROOT = resolve(HERE, "../..");
const RUN_TOKEN = `${process.pid}-${Date.now()}`;
const PRODUCTION_WORKTREE = resolve(
  REPOSITORY_ROOT,
  "..",
  `gelis-cp4aa-production-${RUN_TOKEN}`,
);
const CP4X_WORKTREE = resolve(
  REPOSITORY_ROOT,
  "..",
  `gelis-cp4aa-cp4x-${RUN_TOKEN}`,
);

type Source = "production" | "cp4x" | "cp4z";
type WorkerVariant = "production" | "candidate";
type Unit = "ns/op" | "ms" | "bytes";
type Cell =
  | "static-only-raw"
  | "mixed-static-raw"
  | "mixed-dynamic-raw"
  | "trailing-dynamic-raw"
  | "generic-dynamic-raw"
  | "all-dynamic-raw"
  | "static-registration";

interface CellSpec {
  readonly cell: Cell;
  readonly label: string;
}

interface WorkerResult {
  readonly cell: Cell;
  readonly variant: WorkerVariant;
  readonly probeOnly: boolean;
  readonly metric: number | null;
  readonly unit: Unit;
  readonly iterations: number;
  readonly warmups: number;
  readonly sink: number;
}

interface Summary {
  readonly cell: Cell;
  readonly source: Source;
  readonly unit: Unit;
  readonly median: number;
  readonly p25: number;
  readonly p75: number;
  readonly min: number;
  readonly max: number;
}

const CELLS: readonly CellSpec[] = [
  { cell: "static-only-raw", label: "static-only raw" },
  { cell: "mixed-static-raw", label: "mixed static raw" },
  { cell: "mixed-dynamic-raw", label: "mixed dynamic raw" },
  { cell: "trailing-dynamic-raw", label: "pure trailing dynamic raw" },
  { cell: "generic-dynamic-raw", label: "generic dynamic raw" },
  { cell: "all-dynamic-raw", label: "ALL dynamic raw" },
  { cell: "static-registration", label: "static registration" },
];

const SOURCES: readonly Source[] = ["production", "cp4x", "cp4z"];
const ORDERS: readonly (readonly Source[])[] = [
  ["production", "cp4x", "cp4z"],
  ["production", "cp4z", "cp4x"],
  ["cp4x", "production", "cp4z"],
  ["cp4x", "cp4z", "production"],
  ["cp4z", "production", "cp4x"],
  ["cp4z", "cp4x", "production"],
];

const probeOnly = process.argv.includes("--probe-only");
const harnessSha = git(["rev-parse", "HEAD"]);
const cpu = cpus()[0]?.model ?? "unknown";
let productionWorktreeCreated = false;
let cp4xWorktreeCreated = false;
let probeCompleted = false;
let completed = false;

preflight();

try {
  createWorktree(PRODUCTION_WORKTREE, PRODUCTION_SOURCE);
  productionWorktreeCreated = true;
  createWorktree(CP4X_WORKTREE, CP4X_SOURCE);
  cp4xWorktreeCreated = true;

  printHeader();

  if (probeOnly) {
    runProbe();
    probeCompleted = true;
  } else {
    runTiming();
    completed = true;
  }
} finally {
  cleanupWorktrees();
}

if (probeCompleted) {
  console.log();
  console.log(
    `CP4-AA CORRECTNESS PROBE: PASS (${CELLS.length * SOURCES.length}/${CELLS.length * SOURCES.length})`,
  );
} else if (completed) {
  console.log();
  console.log("CP4-AA LOCAL PRODUCTION-X-Z ATTRIBUTION RUN: COMPLETE");
}

function printHeader(): void {
  console.log(
    "Competitive Performance v0.1 — CP4-AA production/X/Z balanced attribution",
  );
  console.log(`Bun:            ${Bun.version}`);
  console.log(`Revision:       ${Bun.revision}`);
  console.log(`CPU:            ${cpu}`);
  console.log(`Harness SHA:    ${harnessSha}`);
  console.log(`production src: ${PRODUCTION_SOURCE}`);
  console.log(`cp4x       src: ${CP4X_SOURCE}`);
  console.log(`cp4z       src: ${CP4Z_SOURCE}`);
  console.log(`Routes:         ${ROUTES.toLocaleString("en-US")}`);
  console.log(
    probeOnly
      ? "Mode:           correctness probe only"
      : `Samples:        ${SAMPLES} balanced fresh-worker triplets/cell`,
  );
  console.log();
}

function runProbe(): void {
  for (const spec of CELLS) {
    for (const source of SOURCES) {
      const result = runWorker(spec.cell, source, true);
      if (!result.probeOnly || result.cell !== spec.cell) {
        throw new Error(`Invalid probe result for ${source} ${spec.cell}`);
      }
      console.log(`PASS ${source}-${spec.cell}`);
    }
  }
}

function runTiming(): void {
  const values = new Map<string, number[]>();
  const units = new Map<Cell, Unit>();

  for (const spec of CELLS) {
    for (const source of SOURCES) {
      values.set(key(spec.cell, source), []);
    }

    for (let sample = 0; sample < SAMPLES; sample++) {
      const order = ORDERS[sample % ORDERS.length]!;
      for (const source of order) {
        const result = runWorker(spec.cell, source, false);
        if (result.metric === null) {
          throw new Error(`Missing metric for ${source} ${spec.cell}`);
        }
        const knownUnit = units.get(spec.cell);
        if (knownUnit !== undefined && knownUnit !== result.unit) {
          throw new Error(`Unit mismatch for ${spec.cell}`);
        }
        units.set(spec.cell, result.unit);
        values.get(key(spec.cell, source))!.push(result.metric);
      }
    }
  }

  const summaries = new Map<string, Summary>();
  for (const spec of CELLS) {
    const unit = units.get(spec.cell);
    if (unit === undefined) throw new Error(`Missing unit for ${spec.cell}`);

    for (const source of SOURCES) {
      const input = values.get(key(spec.cell, source));
      if (input === undefined || input.length !== SAMPLES) {
        throw new Error(`Incomplete timing set for ${source} ${spec.cell}`);
      }
      summaries.set(
        key(spec.cell, source),
        summarize(spec.cell, source, unit, input),
      );
    }
  }

  console.log("Balanced attribution cells");
  console.log("| cell | source | median | p25 | p75 | min | max | unit |");
  console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const spec of CELLS) {
    for (const source of SOURCES) {
      const summary = getSummary(summaries, spec.cell, source);
      console.log(
        `| ${spec.cell} | ${source} | ${formatMetric(summary.median, summary.unit)} | ${formatMetric(summary.p25, summary.unit)} | ${formatMetric(summary.p75, summary.unit)} | ${formatMetric(summary.min, summary.unit)} | ${formatMetric(summary.max, summary.unit)} | ${summary.unit} |`,
      );
    }
  }

  console.log();
  console.log("Direct ratios vs production");
  console.log("| comparison | CP4-X | CP4-Z | Z / X |");
  console.log("| --- | ---: | ---: | ---: |");
  for (const spec of CELLS) {
    const production = getSummary(summaries, spec.cell, "production").median;
    const cp4x = getSummary(summaries, spec.cell, "cp4x").median;
    const cp4z = getSummary(summaries, spec.cell, "cp4z").median;
    console.log(
      `| ${spec.label} | ${(cp4x / production).toFixed(4)}x | ${(cp4z / production).toFixed(4)}x | ${(cp4z / cp4x).toFixed(4)}x |`,
    );
  }

  console.log();
  console.log(
    "CP4-AA ATTRIBUTION ONLY: prior CP4-X/CP4-Z acceptance classifications remain unchanged.",
  );
}

function runWorker(
  cell: Cell,
  source: Source,
  workerProbeOnly: boolean,
): WorkerResult {
  const sourceRoot =
    source === "production"
      ? PRODUCTION_WORKTREE
      : source === "cp4x"
        ? CP4X_WORKTREE
        : REPOSITORY_ROOT;
  const variant: WorkerVariant =
    source === "production" ? "production" : "candidate";

  const result = spawnSync(
    process.execPath,
    [
      WORKER,
      `--cell=${cell}`,
      `--variant=${variant}`,
      `--source-root=${sourceRoot}`,
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
      `Worker failed for ${source} ${cell}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }

  const line = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (line === undefined) {
    throw new Error(`Worker emitted no result for ${source} ${cell}`);
  }
  const parsed = JSON.parse(line) as WorkerResult;
  if (parsed.cell !== cell || parsed.variant !== variant) {
    throw new Error(`Worker identity mismatch for ${source} ${cell}`);
  }
  return parsed;
}

function preflight(): void {
  if (Bun.version !== EXPECTED_BUN) {
    throw new Error(`CP4-AA requires Bun ${EXPECTED_BUN}, got ${Bun.version}`);
  }
  if (Bun.revision !== EXPECTED_BUN_REVISION) {
    throw new Error(
      `CP4-AA requires Bun revision ${EXPECTED_BUN_REVISION}, got ${Bun.revision}`,
    );
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty !== "") {
    throw new Error(`CP4-AA requires a clean worktree:\n${dirty}`);
  }

  const sourceDiff = spawnSync(
    "git",
    ["-C", REPOSITORY_ROOT, "diff", "--quiet", CP4Z_SOURCE, "HEAD", "--", "src"],
    { encoding: "utf8" },
  );
  if (sourceDiff.status !== 0) {
    throw new Error(`src/** differs from frozen CP4-Z source ${CP4Z_SOURCE}`);
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
      `Unable to create worktree for ${source}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
}

function cleanupWorktrees(): void {
  if (cp4xWorktreeCreated) removeWorktree(CP4X_WORKTREE);
  if (productionWorktreeCreated) removeWorktree(PRODUCTION_WORKTREE);
}

function removeWorktree(path: string): void {
  spawnSync(
    "git",
    ["-C", REPOSITORY_ROOT, "worktree", "remove", "--force", path],
    { encoding: "utf8" },
  );
}

function git(args: string[]): string {
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

function key(cell: Cell, source: Source): string {
  return `${cell}:${source}`;
}

function summarize(
  cell: Cell,
  source: Source,
  unit: Unit,
  input: readonly number[],
): Summary {
  const sorted = [...input].sort((a, b) => a - b);
  return {
    cell,
    source,
    unit,
    median: percentile(sorted, 0.5),
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
    min: sorted[0]!,
    max: sorted.at(-1)!,
  };
}

function percentile(sorted: readonly number[], p: number): number {
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  const weight = position - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

function getSummary(
  summaries: ReadonlyMap<string, Summary>,
  cell: Cell,
  source: Source,
): Summary {
  const summary = summaries.get(key(cell, source));
  if (summary === undefined) {
    throw new Error(`Missing summary for ${source} ${cell}`);
  }
  return summary;
}

function formatMetric(value: number, unit: Unit): string {
  return unit === "ms" ? value.toFixed(3) : value.toFixed(1);
}
