import { spawnSync } from "node:child_process";
import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_BUN = "1.4.2";
const EXPECTED_BUN_REVISION = "744846f844374847c902b5e7fd59b4342a51ef99";
const PRODUCTION_SOURCE = "af4e5102046def1b163435333563b8d08f919bf5";
const CANDIDATE_SOURCE = "408f9856f814184ca0204aa49d3812af8660f077";
const ROUTES = 5_000;
const SAMPLES = 12;
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, "cp4ae-kind-only-production-acceptance-worker.mts");
const REPOSITORY_ROOT = resolve(HERE, "../..");
const PRODUCTION_WORKTREE = resolve(
  REPOSITORY_ROOT,
  "..",
  `gelis-cp4ae-production-${process.pid}-${Date.now()}`,
);

type Variant = "production" | "candidate";
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
  | "collision-dynamic-raw"
  | "all-dynamic-raw"
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
  { cell: "mixed-dynamic-raw", label: "mixed dynamic raw" },
  { cell: "mixed-dynamic-json", label: "mixed dynamic JSON" },
  {
    cell: "mixed-same-length-dynamic-raw",
    label: "mixed same-length dynamic raw",
  },
  { cell: "trailing-dynamic-raw", label: "pure trailing dynamic raw" },
  { cell: "trailing-dynamic-json", label: "pure trailing dynamic JSON" },
  { cell: "generic-dynamic-raw", label: "generic dynamic raw" },
  { cell: "collision-dynamic-raw", label: "forced collision raw" },
  { cell: "all-dynamic-raw", label: "ALL dynamic raw" },
  { cell: "static-registration", label: "static registration" },
  { cell: "static-memory", label: "static retained heap delta" },
];

const VARIANTS: readonly Variant[] = ["production", "candidate"];
const ORDERS: readonly (readonly Variant[])[] = [
  ["production", "candidate"],
  ["candidate", "production"],
];

const probeOnly = process.argv.includes("--probe-only");
const harnessSha = git(["rev-parse", "HEAD"]);
const cpu = cpus()[0]?.model ?? "unknown";
let productionWorktreeCreated = false;
let completed = false;
let probeCompleted = false;

preflight();

try {
  createWorktree(PRODUCTION_WORKTREE, PRODUCTION_SOURCE);
  productionWorktreeCreated = true;

  printHeader();

  if (probeOnly) {
    runProbe();
    probeCompleted = true;
  } else {
    runTiming();
    completed = true;
  }
} finally {
  cleanupWorktree();
}

if (probeCompleted) {
  console.log();
  console.log(
    `CP4-AE CORRECTNESS PROBE: PASS (${PAIRS.length * VARIANTS.length}/${PAIRS.length * VARIANTS.length})`,
  );
} else if (completed) {
  console.log();
  console.log("CP4-AE LOCAL KIND-ONLY PRODUCTION ACCEPTANCE RUN: COMPLETE");
}

function printHeader(): void {
  console.log(
    "Competitive Performance v0.1 — CP4-AE KIND-only direct production acceptance",
  );
  console.log(`Bun:            ${Bun.version}`);
  console.log(`Revision:       ${Bun.revision}`);
  console.log(`CPU:            ${cpu}`);
  console.log(`Harness SHA:    ${harnessSha}`);
  console.log(`Production src: ${PRODUCTION_SOURCE}`);
  console.log(`Candidate src:  ${CANDIDATE_SOURCE}`);
  console.log(`Routes:         ${ROUTES.toLocaleString("en-US")}`);
  console.log(
    probeOnly
      ? "Mode:           correctness probe only"
      : `Samples:        ${SAMPLES} mirrored fresh-worker pairs/cell pair`,
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

  console.log("Production vs candidate cells");
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
  console.log("Candidate / production ratios");
  console.log("| comparison | ratio | candidate delta |");
  console.log("| --- | ---: | ---: |");
  for (const pair of PAIRS) {
    const production = getSummary(summaries, pair.cell, "production");
    const candidate = getSummary(summaries, pair.cell, "candidate");
    console.log(
      `| ${pair.label} | ${(candidate.median / production.median).toFixed(4)}x | ${formatDelta(candidate.median - production.median, candidate.unit)} |`,
    );
  }

  const staticOnlyRatio = ratio(summaries, "static-only-raw");
  const mixedStaticRatio = ratio(summaries, "mixed-static-raw");
  const mixedRawRatio = ratio(summaries, "mixed-dynamic-raw");
  const mixedJsonRatio = ratio(summaries, "mixed-dynamic-json");
  const mixedGeomean = Math.sqrt(mixedRawRatio * mixedJsonRatio);
  const sameLengthRatio = ratio(summaries, "mixed-same-length-dynamic-raw");
  const trailingRawRatio = ratio(summaries, "trailing-dynamic-raw");
  const trailingJsonRatio = ratio(summaries, "trailing-dynamic-json");
  const genericRatio = ratio(summaries, "generic-dynamic-raw");
  const collisionRatio = ratio(summaries, "collision-dynamic-raw");
  const allRatio = ratio(summaries, "all-dynamic-raw");
  const registrationRatio = ratio(summaries, "static-registration");
  const memoryRatio = ratio(summaries, "static-memory");

  const gates = [
    { label: "static-only raw", value: staticOnlyRatio, limit: 1.02 },
    { label: "mixed static raw", value: mixedStaticRatio, limit: 1.02 },
    {
      label: "mixed dynamic raw guard",
      value: mixedRawRatio,
      limit: 1.02,
    },
    {
      label: "mixed dynamic JSON guard",
      value: mixedJsonRatio,
      limit: 1.02,
    },
    {
      label: "mixed dynamic geomean",
      value: mixedGeomean,
      limit: 0.98,
    },
    {
      label: "mixed same-length dynamic raw",
      value: sameLengthRatio,
      limit: 1.02,
    },
    {
      label: "pure trailing dynamic raw",
      value: trailingRawRatio,
      limit: 0.94,
    },
    {
      label: "pure trailing dynamic JSON",
      value: trailingJsonRatio,
      limit: 0.95,
    },
    { label: "generic dynamic raw", value: genericRatio, limit: 1.03 },
    { label: "forced collision raw", value: collisionRatio, limit: 1.15 },
    { label: "ALL dynamic raw", value: allRatio, limit: 1.05 },
    { label: "static registration", value: registrationRatio, limit: 1.05 },
    { label: "static retained heap", value: memoryRatio, limit: 1.05 },
  ] as const;

  let passed = true;

  console.log();
  console.log("Frozen CP4-AE KIND-only direct production acceptance gates");
  console.log("| gate | candidate/production | limit | result |");
  console.log("| --- | ---: | ---: | --- |");
  for (const gate of gates) {
    const result = gate.value <= gate.limit ? "PASS" : "FAIL";
    if (result === "FAIL") passed = false;
    console.log(
      `| ${gate.label} | ${gate.value.toFixed(4)}x | <= ${gate.limit.toFixed(4)}x | ${result} |`,
    );
  }

  console.log();
  console.log(
    `CP4-AE KIND-ONLY DIRECT PRODUCTION ACCEPTANCE GATE: ${passed ? "PASS" : "FAIL"}`,
  );
}

function runWorker(
  cell: Cell,
  variant: Variant,
  workerProbeOnly: boolean,
): WorkerResult {
  const sourceRoot =
    variant === "production" ? PRODUCTION_WORKTREE : REPOSITORY_ROOT;
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

function preflight(): void {
  if (Bun.version !== EXPECTED_BUN) {
    throw new Error(`CP4-AE requires Bun ${EXPECTED_BUN}, got ${Bun.version}`);
  }
  if (Bun.revision !== EXPECTED_BUN_REVISION) {
    throw new Error(
      `CP4-AE requires Bun revision ${EXPECTED_BUN_REVISION}, got ${Bun.revision}`,
    );
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty !== "") {
    throw new Error(`CP4-AE requires a clean worktree:\n${dirty}`);
  }

  const sourceDiff = spawnSync(
    "git",
    [
      "-C",
      REPOSITORY_ROOT,
      "diff",
      "--quiet",
      CANDIDATE_SOURCE,
      "HEAD",
      "--",
      "src",
    ],
    { encoding: "utf8" },
  );
  if (sourceDiff.status !== 0) {
    throw new Error(
      `src/** differs from frozen CP4-AE source ${CANDIDATE_SOURCE}`,
    );
  }

  const sourceAncestor = spawnSync(
    "git",
    [
      "-C",
      REPOSITORY_ROOT,
      "merge-base",
      "--is-ancestor",
      CANDIDATE_SOURCE,
      "HEAD",
    ],
    { encoding: "utf8" },
  );
  if (sourceAncestor.status !== 0) {
    throw new Error(
      `CP4-AE source ${CANDIDATE_SOURCE} is not an ancestor of HEAD`,
    );
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

function cleanupWorktree(): void {
  if (!productionWorktreeCreated) return;
  spawnSync(
    "git",
    [
      "-C",
      REPOSITORY_ROOT,
      "worktree",
      "remove",
      "--force",
      PRODUCTION_WORKTREE,
    ],
    { encoding: "utf8" },
  );
}

function git(args: string[]): string {
  return gitAt(REPOSITORY_ROOT, args);
}

function gitAt(cwd: string, args: string[]): string {
  const result = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

function key(cell: Cell, variant: Variant): string {
  return `${cell}:${variant}`;
}

function summarize(
  cell: Cell,
  variant: Variant,
  unit: Unit,
  input: readonly number[],
): Summary {
  const sorted = [...input].sort((a, b) => a - b);
  return {
    cell,
    variant,
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
  variant: Variant,
): Summary {
  const summary = summaries.get(key(cell, variant));
  if (summary === undefined) {
    throw new Error(`Missing summary for ${variant} ${cell}`);
  }
  return summary;
}

function ratio(summaries: ReadonlyMap<string, Summary>, cell: Cell): number {
  const production = getSummary(summaries, cell, "production").median;
  const candidate = getSummary(summaries, cell, "candidate").median;
  return candidate / production;
}

function formatMetric(value: number, unit: Unit): string {
  if (unit === "ms") return value.toFixed(3);
  if (unit === "bytes") return value.toFixed(0);
  return value.toFixed(1);
}

function formatDelta(value: number, unit: Unit): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${formatMetric(value, unit)} ${unit}`;
}
