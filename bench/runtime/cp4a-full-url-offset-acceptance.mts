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
const WORKER = join(HERE, "cp4a-full-url-offset-worker.mts");
const REPOSITORY_ROOT = resolve(HERE, "../..");

type Variant = "current" | "offset";
type Cell =
  | "current-router"
  | "offset-router"
  | "current-handler-param"
  | "offset-handler-param"
  | "current-pipeline-string-stable"
  | "offset-pipeline-string-stable"
  | "current-pipeline-string-param"
  | "offset-pipeline-string-param"
  | "current-pipeline-json-stable"
  | "offset-pipeline-json-stable"
  | "current-pipeline-json-param"
  | "offset-pipeline-json-param";

interface Pair {
  readonly label: string;
  readonly current: Cell;
  readonly offset: Cell;
}

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

const PAIRS: readonly Pair[] = [
  {
    label: "request-derived router",
    current: "current-router",
    offset: "offset-router",
  },
  {
    label: "param handler",
    current: "current-handler-param",
    offset: "offset-handler-param",
  },
  {
    label: "stable string pipeline",
    current: "current-pipeline-string-stable",
    offset: "offset-pipeline-string-stable",
  },
  {
    label: "param string pipeline",
    current: "current-pipeline-string-param",
    offset: "offset-pipeline-string-param",
  },
  {
    label: "stable JSON pipeline",
    current: "current-pipeline-json-stable",
    offset: "offset-pipeline-json-stable",
  },
  {
    label: "param JSON pipeline",
    current: "current-pipeline-json-param",
    offset: "offset-pipeline-json-param",
  },
];

const probeOnly = process.argv.includes("--probe-only");
const harnessSha = git(["rev-parse", "HEAD"]);
const cpu = cpus()[0]?.model ?? "unknown";

preflight();
printHeader();

if (probeOnly) {
  runProbe();
  console.log();
  console.log(
    `CP4-A CORRECTNESS PROBE: PASS (${PAIRS.length * 2}/${PAIRS.length * 2})`,
  );
} else {
  runTiming();
  console.log();
  console.log("CP4-A LOCAL FULL URL OFFSET VIABILITY RUN: COMPLETE");
}

function printHeader(): void {
  console.log("Competitive Performance v0.1 — CP4-A full URL offset viability");
  console.log(`Bun:         ${Bun.version}`);
  console.log(`Revision:    ${Bun.revision}`);
  console.log(`CPU:         ${cpu}`);
  console.log(`Harness SHA: ${harnessSha}`);
  console.log(`Gelis src:   ${PRODUCTION_SOURCE}`);
  console.log(`Routes:      ${ROUTES.toLocaleString("en-US")}`);
  console.log(
    probeOnly
      ? "Mode:        correctness probe only"
      : `Samples:     ${SAMPLES} mirrored fresh-worker pairs/cell pair`,
  );
  console.log();
}

function runProbe(): void {
  for (const pair of PAIRS) {
    for (const cell of [pair.current, pair.offset]) {
      const result = runWorker(cell, true);
      if (!result.probeOnly || result.cell !== cell) {
        throw new Error(`Invalid CP4-A probe result for ${cell}`);
      }
      console.log(`PASS ${cell}`);
    }
  }
}

function runTiming(): void {
  const values = new Map<Cell, number[]>();
  for (const pair of PAIRS) {
    values.set(pair.current, []);
    values.set(pair.offset, []);

    for (let sample = 0; sample < SAMPLES; sample++) {
      const offsetFirst = sample % 2 === 1;
      const order: readonly Cell[] = offsetFirst
        ? [pair.offset, pair.current]
        : [pair.current, pair.offset];

      for (const cell of order) {
        const result = runWorker(cell, false);
        if (result.nsPerOp === null) {
          throw new Error(`Missing CP4-A timing metric for ${cell}`);
        }
        values.get(cell)!.push(result.nsPerOp);
      }
    }
  }

  const summaries = new Map<Cell, Summary>();
  for (const pair of PAIRS) {
    for (const cell of [pair.current, pair.offset]) {
      const input = values.get(cell);
      if (input === undefined || input.length !== SAMPLES) {
        throw new Error(`Incomplete CP4-A timing set for ${cell}`);
      }
      summaries.set(cell, summarize(cell, input));
    }
  }

  console.log("Full URL offset viability cells");
  console.log("| cell | median ns/op | p25 | p75 | min | max |");
  console.log("| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const pair of PAIRS) {
    for (const cell of [pair.current, pair.offset]) {
      const summary = getSummary(summaries, cell);
      console.log(
        `| ${cell} | ${summary.median.toFixed(1)} | ${summary.p25.toFixed(1)} | ${summary.p75.toFixed(1)} | ${summary.min.toFixed(1)} | ${summary.max.toFixed(1)} |`,
      );
    }
  }

  console.log();
  console.log("Offset / current ratios");
  console.log("| comparison | ratio | offset advantage |");
  console.log("| --- | ---: | ---: |");
  for (const pair of PAIRS) {
    const current = getSummary(summaries, pair.current).median;
    const offset = getSummary(summaries, pair.offset).median;
    console.log(
      `| ${pair.label} | ${(offset / current).toFixed(4)}x | ${(current - offset).toFixed(1)} ns |`,
    );
  }

  const routerAdvantage = advantage(
    summaries,
    "current-router",
    "offset-router",
  );

  console.log();
  console.log("Router-win translation diagnostics");
  console.log("| boundary | offset advantage | retained vs router win |");
  console.log("| --- | ---: | ---: |");
  for (const pair of PAIRS.slice(1)) {
    const cellAdvantage = advantage(summaries, pair.current, pair.offset);
    const retention =
      routerAdvantage === 0
        ? "n/a"
        : `${(cellAdvantage / routerAdvantage).toFixed(4)}x`;
    console.log(
      `| ${pair.label} | ${cellAdvantage.toFixed(1)} ns | ${retention} |`,
    );
  }

  console.log();
  console.log("Param response penalties");
  console.log("| variant | string param - stable | JSON param - stable |");
  console.log("| --- | ---: | ---: |");
  const currentStringPenalty =
    getSummary(summaries, "current-pipeline-string-param").median -
    getSummary(summaries, "current-pipeline-string-stable").median;
  const offsetStringPenalty =
    getSummary(summaries, "offset-pipeline-string-param").median -
    getSummary(summaries, "offset-pipeline-string-stable").median;
  const currentJsonPenalty =
    getSummary(summaries, "current-pipeline-json-param").median -
    getSummary(summaries, "current-pipeline-json-stable").median;
  const offsetJsonPenalty =
    getSummary(summaries, "offset-pipeline-json-param").median -
    getSummary(summaries, "offset-pipeline-json-stable").median;
  console.log(
    `| current | ${currentStringPenalty.toFixed(1)} ns | ${currentJsonPenalty.toFixed(1)} ns |`,
  );
  console.log(
    `| full URL offset | ${offsetStringPenalty.toFixed(1)} ns | ${offsetJsonPenalty.toFixed(1)} ns |`,
  );

  console.log();
  console.log(
    "CP4-A is viability/decomposition-only: no performance acceptance threshold is applied.",
  );
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
      `CP4-A worker failed for ${cell}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }

  const line = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (line === undefined) {
    throw new Error(`CP4-A worker emitted no result for ${cell}`);
  }
  const parsed = JSON.parse(line) as WorkerResult;
  if (parsed.cell !== cell) {
    throw new Error(`CP4-A worker identity mismatch for ${cell}`);
  }
  return parsed;
}

function preflight(): void {
  if (Bun.version !== EXPECTED_BUN) {
    throw new Error(`CP4-A requires Bun ${EXPECTED_BUN}, got ${Bun.version}`);
  }
  if (Bun.revision !== EXPECTED_BUN_REVISION) {
    throw new Error(
      `CP4-A requires Bun revision ${EXPECTED_BUN_REVISION}, got ${Bun.revision}`,
    );
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty !== "") {
    throw new Error(`CP4-A requires a clean worktree:\n${dirty}`);
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

  const sourceAncestor = spawnSync(
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
  if (sourceAncestor.status !== 0) {
    throw new Error(
      `Frozen production ${PRODUCTION_SOURCE} is not an ancestor of HEAD`,
    );
  }
}

function summarize(cell: Cell, input: readonly number[]): Summary {
  const sorted = [...input].sort((left, right) => left - right);
  return {
    cell,
    median: percentile(sorted, 0.5),
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
  };
}

function percentile(sorted: readonly number[], fraction: number): number {
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  const weight = index - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

function getSummary(summaries: Map<Cell, Summary>, cell: Cell): Summary {
  const summary = summaries.get(cell);
  if (summary === undefined) throw new Error(`Missing summary for ${cell}`);
  return summary;
}

function advantage(
  summaries: Map<Cell, Summary>,
  current: Cell,
  offset: Cell,
): number {
  return (
    getSummary(summaries, current).median - getSummary(summaries, offset).median
  );
}

function git(args: readonly string[]): string {
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
