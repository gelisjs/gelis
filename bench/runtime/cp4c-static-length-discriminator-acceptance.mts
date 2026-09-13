import { spawnSync } from "node:child_process";
import { cpus } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_BUN = "1.4.2";
const EXPECTED_BUN_REVISION = "744846f844374847c902b5e7fd59b4342a51ef99";
const PRODUCTION_SOURCE = "af4e5102046def1b163435333563b8d08f919bf5";
const CP4B_SOURCE = "ca7543b46ad68b89a9d2b10d29e052993b216758";
const CP4C_SOURCE = "f6a1345ca5bee07870fbaa3d42321ed84439bf67";
const ROUTES = 5_000;
const SAMPLES = 11;
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, "cp4c-static-length-discriminator-worker.mts");
const REPOSITORY_ROOT = resolve(HERE, "../..");
const PRODUCTION_WORKTREE = resolve(
  REPOSITORY_ROOT,
  "..",
  `gelis-cp4c-production-${process.pid}-${Date.now()}`,
);
const CP4B_WORKTREE = resolve(
  REPOSITORY_ROOT,
  "..",
  `gelis-cp4c-cp4b-${process.pid}-${Date.now()}`,
);

type Variant = "production" | "cp4b" | "cp4c";
type Unit = "ns/op" | "ms" | "bytes";
type Cell =
  | "static-only-raw"
  | "mixed-static-raw"
  | "mixed-dynamic-raw"
  | "mixed-dynamic-json"
  | "mixed-same-length-dynamic-raw"
  | "trailing-dynamic-raw"
  | "trailing-dynamic-json"
  | "generic-dynamic-raw"
  | "static-registration"
  | "static-memory";

interface Pair {
  readonly cell: Cell;
  readonly label: string;
}

interface WorkerResult {
  readonly cell: Cell;
  readonly variant: Variant;
  readonly probeOnly: boolean;
  readonly metric: number | null;
  readonly unit: Unit;
  readonly iterations: number;
  readonly warmups: number;
  readonly sink: number;
}

interface Summary {
  readonly cell: Cell;
  readonly variant: Variant;
  readonly unit: Unit;
  readonly median: number;
  readonly p25: number;
  readonly p75: number;
  readonly min: number;
  readonly max: number;
}

const PAIRS: readonly Pair[] = [
  { cell: "static-only-raw", label: "static-only raw" },
  { cell: "mixed-static-raw", label: "mixed static raw" },
  { cell: "mixed-dynamic-raw", label: "mixed length-miss dynamic raw" },
  { cell: "mixed-dynamic-json", label: "mixed length-miss dynamic JSON" },
  {
    cell: "mixed-same-length-dynamic-raw",
    label: "mixed same-length dynamic raw",
  },
  { cell: "trailing-dynamic-raw", label: "pure trailing dynamic raw" },
  { cell: "trailing-dynamic-json", label: "pure trailing dynamic JSON" },
  { cell: "generic-dynamic-raw", label: "generic dynamic raw" },
  { cell: "static-registration", label: "static registration" },
  { cell: "static-memory", label: "static retained heap delta" },
];

const VARIANTS: readonly Variant[] = ["production", "cp4b", "cp4c"];
const ORDERS: readonly (readonly Variant[])[] = [
  ["production", "cp4b", "cp4c"],
  ["cp4c", "cp4b", "production"],
  ["cp4b", "cp4c", "production"],
  ["production", "cp4c", "cp4b"],
  ["cp4c", "production", "cp4b"],
  ["cp4b", "production", "cp4c"],
];

const probeOnly = process.argv.includes("--probe-only");
const harnessSha = git(["rev-parse", "HEAD"]);
const cpu = cpus()[0]?.model ?? "unknown";
let productionWorktreeCreated = false;
let cp4bWorktreeCreated = false;
let completed = false;
let probeCompleted = false;

preflight();

try {
  createWorktree(PRODUCTION_WORKTREE, PRODUCTION_SOURCE);
  productionWorktreeCreated = true;
  createWorktree(CP4B_WORKTREE, CP4B_SOURCE);
  cp4bWorktreeCreated = true;

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
    `CP4-C CORRECTNESS PROBE: PASS (${PAIRS.length * VARIANTS.length}/${PAIRS.length * VARIANTS.length})`,
  );
} else if (completed) {
  console.log();
  console.log("CP4-C LOCAL STATIC LENGTH DISCRIMINATOR RUN: COMPLETE");
}

function printHeader(): void {
  console.log(
    "Competitive Performance v0.1 — CP4-C static path-length discriminator decomposition",
  );
  console.log(`Bun:            ${Bun.version}`);
  console.log(`Revision:       ${Bun.revision}`);
  console.log(`CPU:            ${cpu}`);
  console.log(`Harness SHA:    ${harnessSha}`);
  console.log(`Production src: ${PRODUCTION_SOURCE}`);
  console.log(`CP4-B src:      ${CP4B_SOURCE}`);
  console.log(`CP4-C src:      ${CP4C_SOURCE}`);
  console.log(`Routes:         ${ROUTES.toLocaleString("en-US")}`);
  console.log(
    probeOnly
      ? "Mode:           correctness probe only"
      : `Samples:        ${SAMPLES} rotated fresh-worker samples/variant/cell`,
  );
  console.log();
}

function runProbe(): void {
  for (const pair of PAIRS) {
    for (const variant of VARIANTS) {
      const result = runWorker(pair.cell, variant, true);
      if (
        !result.probeOnly ||
        result.cell !== pair.cell ||
        result.variant !== variant
      ) {
        throw new Error(`Invalid probe result for ${variant} ${pair.cell}`);
      }
      console.log(`PASS ${variant}-${pair.cell}`);
    }
  }
}

function runTiming(): void {
  const values = new Map<string, number[]>();
  const units = new Map<Cell, Unit>();

  for (const pair of PAIRS) {
    for (const variant of VARIANTS) {
      values.set(key(pair.cell, variant), []);
    }

    for (let sample = 0; sample < SAMPLES; sample++) {
      const order = ORDERS[sample % ORDERS.length]!;
      for (const variant of order) {
        const result = runWorker(pair.cell, variant, false);
        if (result.metric === null) {
          throw new Error(`Missing timing metric for ${variant} ${pair.cell}`);
        }

        const knownUnit = units.get(pair.cell);
        if (knownUnit !== undefined && knownUnit !== result.unit) {
          throw new Error(`Unit mismatch for ${pair.cell}`);
        }
        units.set(pair.cell, result.unit);
        values.get(key(pair.cell, variant))!.push(result.metric);
      }
    }
  }

  const summaries = new Map<string, Summary>();
  for (const pair of PAIRS) {
    const unit = units.get(pair.cell);
    if (unit === undefined) throw new Error(`Missing unit for ${pair.cell}`);

    for (const variant of VARIANTS) {
      const input = values.get(key(pair.cell, variant));
      if (input === undefined || input.length !== SAMPLES) {
        throw new Error(`Incomplete timing set for ${variant} ${pair.cell}`);
      }
      summaries.set(
        key(pair.cell, variant),
        summarize(pair.cell, variant, unit, input),
      );
    }
  }

  console.log("Three-source decomposition cells");
  console.log("| cell | variant | median | p25 | p75 | min | max | unit |");
  console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const pair of PAIRS) {
    for (const variant of VARIANTS) {
      const summary = getSummary(summaries, pair.cell, variant);
      console.log(
        `| ${pair.cell} | ${variant} | ${formatMetric(summary.median, summary.unit)} | ${formatMetric(summary.p25, summary.unit)} | ${formatMetric(summary.p75, summary.unit)} | ${formatMetric(summary.min, summary.unit)} | ${formatMetric(summary.max, summary.unit)} | ${summary.unit} |`,
      );
    }
  }

  console.log();
  console.log("Ratios by source transition");
  console.log(
    "| comparison | CP4-B / production | CP4-C / production | CP4-C / CP4-B | CP4-C - CP4-B |",
  );
  console.log("| --- | ---: | ---: | ---: | ---: |");
  for (const pair of PAIRS) {
    const production = getSummary(summaries, pair.cell, "production");
    const cp4b = getSummary(summaries, pair.cell, "cp4b");
    const cp4c = getSummary(summaries, pair.cell, "cp4c");
    console.log(
      `| ${pair.label} | ${(cp4b.median / production.median).toFixed(4)}x | ${(cp4c.median / production.median).toFixed(4)}x | ${(cp4c.median / cp4b.median).toFixed(4)}x | ${formatDelta(cp4c.median - cp4b.median, cp4c.unit)} |`,
    );
  }

  const mixedRawRecovery = ratioBetween(
    summaries,
    "mixed-dynamic-raw",
    "cp4c",
    "cp4b",
  );
  const mixedJsonRecovery = ratioBetween(
    summaries,
    "mixed-dynamic-json",
    "cp4c",
    "cp4b",
  );
  const mixedRecoveryGeomean = Math.sqrt(mixedRawRecovery * mixedJsonRecovery);

  console.log();
  console.log("CP4-C mechanism diagnostics (decomposition only; no gate)");
  console.log("| diagnostic | ratio | interpretation target |");
  console.log("| --- | ---: | --- |");
  console.log(
    `| mixed length-miss raw CP4-C/CP4-B | ${mixedRawRecovery.toFixed(4)}x | length discriminator recovery |`,
  );
  console.log(
    `| mixed length-miss JSON CP4-C/CP4-B | ${mixedJsonRecovery.toFixed(4)}x | length discriminator recovery |`,
  );
  console.log(
    `| mixed length-miss geomean CP4-C/CP4-B | ${mixedRecoveryGeomean.toFixed(4)}x | aggregate discriminator recovery |`,
  );
  console.log(
    `| mixed same-length raw CP4-C/CP4-B | ${ratioBetween(summaries, "mixed-same-length-dynamic-raw", "cp4c", "cp4b").toFixed(4)}x | exact-static-check fallback cost |`,
  );
  console.log(
    `| generic raw CP4-C/CP4-B | ${ratioBetween(summaries, "generic-dynamic-raw", "cp4c", "cp4b").toFixed(4)}x | generic early-fallback recovery |`,
  );
  console.log(
    `| static-only raw CP4-C/CP4-B | ${ratioBetween(summaries, "static-only-raw", "cp4c", "cp4b").toFixed(4)}x | discriminator static-hit overhead |`,
  );
  console.log(
    `| mixed static raw CP4-C/CP4-B | ${ratioBetween(summaries, "mixed-static-raw", "cp4c", "cp4b").toFixed(4)}x | discriminator mixed static-hit overhead |`,
  );
  console.log(
    `| trailing raw CP4-C/CP4-B | ${ratioBetween(summaries, "trailing-dynamic-raw", "cp4c", "cp4b").toFixed(4)}x | pure-dynamic win preservation |`,
  );
  console.log(
    `| trailing JSON CP4-C/CP4-B | ${ratioBetween(summaries, "trailing-dynamic-json", "cp4c", "cp4b").toFixed(4)}x | pure-dynamic win preservation |`,
  );
  console.log(
    `| static registration CP4-C/CP4-B | ${ratioBetween(summaries, "static-registration", "cp4c", "cp4b").toFixed(4)}x | discriminator registration cost |`,
  );
  console.log(
    `| static heap CP4-C/CP4-B | ${ratioBetween(summaries, "static-memory", "cp4c", "cp4b").toFixed(4)}x | discriminator retained-memory cost |`,
  );

  console.log();
  console.log(
    "CP4-C is decomposition-only: no performance acceptance threshold is applied.",
  );
}

function runWorker(
  cell: Cell,
  variant: Variant,
  workerProbeOnly: boolean,
): WorkerResult {
  const sourceRoot = sourceRootFor(variant);
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
      `Worker failed for ${variant} ${cell}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }

  const line = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (line === undefined) {
    throw new Error(`Worker emitted no result for ${variant} ${cell}`);
  }

  const parsed = JSON.parse(line) as WorkerResult;
  if (parsed.cell !== cell || parsed.variant !== variant) {
    throw new Error(`Worker identity mismatch for ${variant} ${cell}`);
  }
  return parsed;
}

function sourceRootFor(variant: Variant): string {
  switch (variant) {
    case "production":
      return PRODUCTION_WORKTREE;
    case "cp4b":
      return CP4B_WORKTREE;
    case "cp4c":
      return REPOSITORY_ROOT;
  }
}

function preflight(): void {
  if (Bun.version !== EXPECTED_BUN) {
    throw new Error(`CP4-C requires Bun ${EXPECTED_BUN}, got ${Bun.version}`);
  }
  if (Bun.revision !== EXPECTED_BUN_REVISION) {
    throw new Error(
      `CP4-C requires Bun revision ${EXPECTED_BUN_REVISION}, got ${Bun.revision}`,
    );
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty !== "") {
    throw new Error(`CP4-C requires a clean worktree:\n${dirty}`);
  }

  const sourceDiff = spawnSync(
    "git",
    [
      "-C",
      REPOSITORY_ROOT,
      "diff",
      "--quiet",
      CP4C_SOURCE,
      "HEAD",
      "--",
      "src",
    ],
    { encoding: "utf8" },
  );
  if (sourceDiff.status !== 0) {
    throw new Error(`src/** differs from frozen CP4-C source ${CP4C_SOURCE}`);
  }

  const sourceAncestor = spawnSync(
    "git",
    ["-C", REPOSITORY_ROOT, "merge-base", "--is-ancestor", CP4C_SOURCE, "HEAD"],
    { encoding: "utf8" },
  );
  if (sourceAncestor.status !== 0) {
    throw new Error(`CP4-C source ${CP4C_SOURCE} is not an ancestor of HEAD`);
  }
}

function createWorktree(path: string, source: string): void {
  const result = spawnSync(
    "git",
    ["-C", REPOSITORY_ROOT, "worktree", "add", "--detach", path, source],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`Failed to create worktree ${source}:\n${result.stderr}`);
  }

  const head = gitAt(path, ["rev-parse", "HEAD"]);
  if (head !== source) {
    throw new Error(`Worktree SHA mismatch for ${source}: ${head}`);
  }
}

function cleanupWorktrees(): void {
  let cleanupError: Error | undefined;

  try {
    if (cp4bWorktreeCreated) removeWorktree(CP4B_WORKTREE, "CP4-B");
  } catch (error) {
    cleanupError = error as Error;
  }

  try {
    if (productionWorktreeCreated) {
      removeWorktree(PRODUCTION_WORKTREE, "production");
    }
  } catch (error) {
    cleanupError ??= error as Error;
  }

  const prune = spawnSync("git", ["-C", REPOSITORY_ROOT, "worktree", "prune"], {
    encoding: "utf8",
  });
  if (prune.status !== 0 && cleanupError === undefined) {
    cleanupError = new Error(`Failed to prune worktrees:\n${prune.stderr}`);
  }

  const list = git(["worktree", "list", "--porcelain"]);
  if (
    (list.includes(basename(PRODUCTION_WORKTREE)) ||
      list.includes(basename(CP4B_WORKTREE))) &&
    cleanupError === undefined
  ) {
    cleanupError = new Error("CP4-C temporary worktree remained after cleanup");
  }

  if (cleanupError !== undefined) throw cleanupError;
}

function removeWorktree(path: string, label: string): void {
  const result = spawnSync(
    "git",
    ["-C", REPOSITORY_ROOT, "worktree", "remove", path],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`Failed to remove ${label} worktree:\n${result.stderr}`);
  }
}

function summarize(
  cell: Cell,
  variant: Variant,
  unit: Unit,
  input: readonly number[],
): Summary {
  const sorted = [...input].sort((left, right) => left - right);
  return {
    cell,
    variant,
    unit,
    median: percentile(sorted, 0.5),
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
  };
}

function percentile(sorted: readonly number[], fraction: number): number {
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  const weight = position - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

function getSummary(
  summaries: ReadonlyMap<string, Summary>,
  cell: Cell,
  variant: Variant,
): Summary {
  const summary = summaries.get(key(cell, variant));
  if (summary === undefined) {
    throw new Error(`Missing summary for ${variant} ${cell}`);
  }
  return summary;
}

function ratioBetween(
  summaries: ReadonlyMap<string, Summary>,
  cell: Cell,
  numerator: Variant,
  denominator: Variant,
): number {
  return (
    getSummary(summaries, cell, numerator).median /
    getSummary(summaries, cell, denominator).median
  );
}

function key(cell: Cell, variant: Variant): string {
  return `${cell}:${variant}`;
}

function formatMetric(value: number, unit: Unit): string {
  if (unit === "bytes") return value.toFixed(0);
  if (unit === "ms") return value.toFixed(3);
  return value.toFixed(1);
}

function formatDelta(value: number, unit: Unit): string {
  const sign = value >= 0 ? "+" : "";
  if (unit === "bytes") return `${sign}${value.toFixed(0)} bytes`;
  if (unit === "ms") return `${sign}${value.toFixed(3)} ms`;
  return `${sign}${value.toFixed(1)} ns`;
}

function git(args: readonly string[]): string {
  const result = spawnSync("git", ["-C", REPOSITORY_ROOT, ...args], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${result.stderr}`);
  }
  return result.stdout.trim();
}

function gitAt(path: string, args: readonly string[]): string {
  const result = spawnSync("git", ["-C", path, ...args], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed in ${path}:\n${result.stderr}`,
    );
  }
  return result.stdout.trim();
}
