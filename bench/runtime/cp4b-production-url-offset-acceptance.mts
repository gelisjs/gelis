import { spawnSync } from "node:child_process";
import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_BUN = "1.4.2";
const EXPECTED_BUN_REVISION = "744846f844374847c902b5e7fd59b4342a51ef99";
const PRODUCTION_SOURCE = "af4e5102046def1b163435333563b8d08f919bf5";
const CANDIDATE_SOURCE = "ca7543b46ad68b89a9d2b10d29e052993b216758";
const ROUTES = 5_000;
const SAMPLES = 11;
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, "cp4b-production-url-offset-worker.mts");
const REPOSITORY_ROOT = resolve(HERE, "../..");
const BASELINE_WORKTREE = resolve(
  REPOSITORY_ROOT,
  "..",
  `gelis-cp4b-baseline-${process.pid}-${Date.now()}`,
);
const CANDIDATE_APP = join(REPOSITORY_ROOT, "src/app.ts");
const BASELINE_APP = join(BASELINE_WORKTREE, "src/app.ts");

type Variant = "production" | "candidate";
type Cell =
  | "static-only-raw"
  | "mixed-static-raw"
  | "mixed-dynamic-raw"
  | "mixed-dynamic-json"
  | "trailing-dynamic-raw"
  | "trailing-dynamic-json"
  | "generic-dynamic-raw"
  | "collision-dynamic-raw"
  | "all-dynamic-raw";

interface Pair {
  readonly cell: Cell;
  readonly label: string;
}

interface WorkerResult {
  readonly cell: Cell;
  readonly variant: Variant;
  readonly probeOnly: boolean;
  readonly nsPerOp: number | null;
  readonly iterations: number;
  readonly warmups: number;
  readonly sink: number;
}

interface Summary {
  readonly cell: Cell;
  readonly variant: Variant;
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
  { cell: "trailing-dynamic-raw", label: "pure trailing dynamic raw" },
  { cell: "trailing-dynamic-json", label: "pure trailing dynamic JSON" },
  { cell: "generic-dynamic-raw", label: "generic dynamic raw" },
  { cell: "collision-dynamic-raw", label: "forced collision raw" },
  { cell: "all-dynamic-raw", label: "ALL dynamic raw" },
];

const probeOnly = process.argv.includes("--probe-only");
const harnessSha = git(["rev-parse", "HEAD"]);
const cpu = cpus()[0]?.model ?? "unknown";

preflight();
createBaselineWorktree();

let completed = false;
let probeCompleted = false;

try {
  printHeader();

  if (probeOnly) {
    runProbe();
    probeCompleted = true;
  } else {
    runTiming();
    completed = true;
  }
} finally {
  cleanupBaselineWorktree();
}

if (probeCompleted) {
  console.log();
  console.log(
    `CP4-B CORRECTNESS PROBE: PASS (${PAIRS.length * 2}/${PAIRS.length * 2})`,
  );
} else if (completed) {
  console.log();
  console.log("CP4-B LOCAL PRODUCTION URL-OFFSET RUN: COMPLETE");
}

function printHeader(): void {
  console.log(
    "Competitive Performance v0.1 — CP4-B production URL-offset candidate",
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
    for (const variant of ["production", "candidate"] as const) {
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

  for (const pair of PAIRS) {
    values.set(key(pair.cell, "production"), []);
    values.set(key(pair.cell, "candidate"), []);

    for (let sample = 0; sample < SAMPLES; sample++) {
      const candidateFirst = sample % 2 === 1;
      const order: readonly Variant[] = candidateFirst
        ? ["candidate", "production"]
        : ["production", "candidate"];

      for (const variant of order) {
        const result = runWorker(pair.cell, variant, false);
        if (result.nsPerOp === null) {
          throw new Error(`Missing timing metric for ${variant} ${pair.cell}`);
        }
        values.get(key(pair.cell, variant))!.push(result.nsPerOp);
      }
    }
  }

  const summaries = new Map<string, Summary>();
  for (const pair of PAIRS) {
    for (const variant of ["production", "candidate"] as const) {
      const input = values.get(key(pair.cell, variant));
      if (input === undefined || input.length !== SAMPLES) {
        throw new Error(`Incomplete timing set for ${variant} ${pair.cell}`);
      }
      summaries.set(
        key(pair.cell, variant),
        summarize(pair.cell, variant, input),
      );
    }
  }

  console.log("Production vs candidate cells");
  console.log("| cell | variant | median ns/op | p25 | p75 | min | max |");
  console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: |");
  for (const pair of PAIRS) {
    for (const variant of ["production", "candidate"] as const) {
      const summary = getSummary(summaries, pair.cell, variant);
      console.log(
        `| ${pair.cell} | ${variant} | ${summary.median.toFixed(1)} | ${summary.p25.toFixed(1)} | ${summary.p75.toFixed(1)} | ${summary.min.toFixed(1)} | ${summary.max.toFixed(1)} |`,
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
      `| ${pair.label} | ${(candidate.median / production.median).toFixed(4)}x | ${(candidate.median - production.median).toFixed(1)} ns |`,
    );
  }

  const staticOnlyRatio = ratio(summaries, "static-only-raw");
  const mixedStaticRatio = ratio(summaries, "mixed-static-raw");
  const mixedRawRatio = ratio(summaries, "mixed-dynamic-raw");
  const mixedJsonRatio = ratio(summaries, "mixed-dynamic-json");
  const mixedGeomean = Math.sqrt(mixedRawRatio * mixedJsonRatio);
  const trailingRawRatio = ratio(summaries, "trailing-dynamic-raw");
  const trailingJsonRatio = ratio(summaries, "trailing-dynamic-json");
  const genericRatio = ratio(summaries, "generic-dynamic-raw");
  const collisionRatio = ratio(summaries, "collision-dynamic-raw");
  const allRatio = ratio(summaries, "all-dynamic-raw");

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
  ] as const;

  let passed = true;

  console.log();
  console.log("Frozen CP4-B production URL-offset gates");
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
  console.log(`CP4-B PRODUCTION URL-OFFSET GATE: ${passed ? "PASS" : "FAIL"}`);
}

function runWorker(
  cell: Cell,
  variant: Variant,
  workerProbeOnly: boolean,
): WorkerResult {
  const appPath = variant === "production" ? BASELINE_APP : CANDIDATE_APP;
  const result = spawnSync(
    process.execPath,
    [
      WORKER,
      `--cell=${cell}`,
      `--variant=${variant}`,
      `--app-path=${appPath}`,
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
    throw new Error(`CP4-B requires Bun ${EXPECTED_BUN}, got ${Bun.version}`);
  }
  if (Bun.revision !== EXPECTED_BUN_REVISION) {
    throw new Error(
      `CP4-B requires Bun revision ${EXPECTED_BUN_REVISION}, got ${Bun.revision}`,
    );
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty !== "") {
    throw new Error(`CP4-B requires a clean worktree:\n${dirty}`);
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
    throw new Error(`src/** differs from frozen candidate ${CANDIDATE_SOURCE}`);
  }

  const candidateAncestor = spawnSync(
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
  if (candidateAncestor.status !== 0) {
    throw new Error(
      `Candidate source ${CANDIDATE_SOURCE} is not an ancestor of HEAD`,
    );
  }
}

function createBaselineWorktree(): void {
  const result = spawnSync(
    "git",
    [
      "-C",
      REPOSITORY_ROOT,
      "worktree",
      "add",
      "--detach",
      BASELINE_WORKTREE,
      PRODUCTION_SOURCE,
    ],
    { encoding: "utf8" },
  );

  if (result.status !== 0) {
    throw new Error(`Failed to create baseline worktree:\n${result.stderr}`);
  }

  const head = gitAt(BASELINE_WORKTREE, ["rev-parse", "HEAD"]);
  if (head !== PRODUCTION_SOURCE) {
    throw new Error(`Baseline worktree SHA mismatch: ${head}`);
  }
}

function cleanupBaselineWorktree(): void {
  const remove = spawnSync(
    "git",
    ["-C", REPOSITORY_ROOT, "worktree", "remove", BASELINE_WORKTREE],
    { encoding: "utf8" },
  );
  if (remove.status !== 0) {
    throw new Error(
      `Failed to remove CP4-B baseline worktree:\n${remove.stderr}`,
    );
  }

  const prune = spawnSync("git", ["-C", REPOSITORY_ROOT, "worktree", "prune"], {
    encoding: "utf8",
  });
  if (prune.status !== 0) {
    throw new Error(`Failed to prune worktrees:\n${prune.stderr}`);
  }

  const list = git(["worktree", "list", "--porcelain"]);
  if (list.includes(BASELINE_WORKTREE)) {
    throw new Error("CP4-B baseline worktree remained after cleanup");
  }
}

function summarize(
  cell: Cell,
  variant: Variant,
  input: readonly number[],
): Summary {
  const sorted = [...input].sort((left, right) => left - right);
  return {
    cell,
    variant,
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
  const lowerValue = sorted[lower]!;
  const upperValue = sorted[upper]!;
  if (lower === upper) return lowerValue;
  return lowerValue + (upperValue - lowerValue) * (position - lower);
}

function ratio(summaries: Map<string, Summary>, cell: Cell): number {
  return (
    getSummary(summaries, cell, "candidate").median /
    getSummary(summaries, cell, "production").median
  );
}

function getSummary(
  summaries: Map<string, Summary>,
  cell: Cell,
  variant: Variant,
): Summary {
  const summary = summaries.get(key(cell, variant));
  if (summary === undefined) {
    throw new Error(`Missing summary for ${variant} ${cell}`);
  }
  return summary;
}

function key(cell: Cell, variant: Variant): string {
  return `${cell}:${variant}`;
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

function gitAt(cwd: string, args: readonly string[]): string {
  const result = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${result.stderr}`);
  }
  return result.stdout.trim();
}
