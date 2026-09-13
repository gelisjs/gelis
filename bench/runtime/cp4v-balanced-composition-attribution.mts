import { spawnSync } from "node:child_process";
import { cpus } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_BUN = "1.4.2";
const EXPECTED_BUN_REVISION = "744846f844374847c902b5e7fd59b4342a51ef99";
const ROUTES = 5_000;
const SAMPLES = 12;
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, "cp4v-balanced-composition-attribution-worker.mts");
const REPOSITORY_ROOT = resolve(HERE, "../..");

type Variant = "cp4i" | "cp4q" | "cp4t" | "cp4u";
type Cell =
  | "static-only-raw"
  | "mixed-static-raw"
  | "mixed-dynamic-raw"
  | "trailing-dynamic-json"
  | "generic-dynamic-raw"
  | "collision-dynamic-raw"
  | "all-dynamic-raw";
type Unit = "ns/op" | "ms" | "bytes";

interface SourceSpec {
  readonly label: Variant;
  readonly sha: string;
}

interface CellSpec {
  readonly cell: Cell;
  readonly label: string;
  readonly limit: number;
}

interface WorkerResult {
  readonly cell: Cell;
  readonly variant: "candidate";
  readonly probeOnly: boolean;
  readonly metric: number | null;
  readonly unit: Unit;
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

const SOURCES: readonly SourceSpec[] = [
  { label: "cp4i", sha: "c18f231374d0008b7cc3e01bacbf9f81aff9a273" },
  { label: "cp4q", sha: "b268a99f58e6c055ed0255c30ea16783f85fb5f3" },
  { label: "cp4t", sha: "bc519e56c599d7b325f0db13d1c6d318801b6024" },
  { label: "cp4u", sha: "d00e9aa92bf36f59a4182d4602ca46392f5b3686" },
];

const CELLS: readonly CellSpec[] = [
  { cell: "static-only-raw", label: "static-only raw", limit: 1.02 },
  { cell: "mixed-static-raw", label: "mixed static raw", limit: 0.9963 },
  { cell: "mixed-dynamic-raw", label: "mixed dynamic raw", limit: 1.02 },
  {
    cell: "trailing-dynamic-json",
    label: "pure trailing dynamic JSON",
    limit: 1.02,
  },
  { cell: "generic-dynamic-raw", label: "generic dynamic raw", limit: 1.02 },
  { cell: "collision-dynamic-raw", label: "forced collision raw", limit: 1.02 },
  { cell: "all-dynamic-raw", label: "ALL dynamic raw", limit: 1.02 },
];

const ORDERS: readonly (readonly Variant[])[] = [
  ["cp4i", "cp4q", "cp4t", "cp4u"],
  ["cp4q", "cp4u", "cp4i", "cp4t"],
  ["cp4t", "cp4i", "cp4u", "cp4q"],
  ["cp4u", "cp4t", "cp4q", "cp4i"],
];

const probeOnly = process.argv.includes("--probe-only");
const harnessSha = git(["rev-parse", "HEAD"]);
const cpu = cpus()[0]?.model ?? "unknown";
const worktrees = new Map<Variant, string>();
const created = new Set<Variant>();
let probeCompleted = false;
let completed = false;

preflight();

try {
  for (const source of SOURCES) {
    const path = resolve(
      REPOSITORY_ROOT,
      "..",
      `gelis-cp4v-${source.label}-${process.pid}-${Date.now()}`,
    );
    createWorktree(path, source.sha);
    worktrees.set(source.label, path);
    created.add(source.label);
  }

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
    `CP4-V CORRECTNESS PROBE: PASS (${CELLS.length * SOURCES.length}/${CELLS.length * SOURCES.length})`,
  );
} else if (completed) {
  console.log();
  console.log("CP4-V LOCAL BALANCED COMPOSITION ATTRIBUTION RUN: COMPLETE");
}

function printHeader(): void {
  console.log(
    "Competitive Performance v0.1 — CP4-V balanced composition attribution",
  );
  console.log(`Bun:            ${Bun.version}`);
  console.log(`Revision:       ${Bun.revision}`);
  console.log(`CPU:            ${cpu}`);
  console.log(`Harness SHA:    ${harnessSha}`);
  for (const source of SOURCES) {
    console.log(`${source.label.padEnd(5)} src: ${source.sha}`);
  }
  console.log(`Routes:         ${ROUTES.toLocaleString("en-US")}`);
  console.log(
    probeOnly
      ? "Mode:           correctness probe only"
      : `Samples:        ${SAMPLES} balanced fresh-worker quartets/cell`,
  );
  console.log();
}

function runProbe(): void {
  for (const spec of CELLS) {
    for (const source of SOURCES) {
      const result = runWorker(spec.cell, source.label, true);
      if (!result.probeOnly || result.cell !== spec.cell) {
        throw new Error(
          `Invalid probe result for ${source.label} ${spec.cell}`,
        );
      }
      console.log(`PASS ${source.label}-${spec.cell}`);
    }
  }
}

function runTiming(): void {
  const values = new Map<string, number[]>();
  const units = new Map<Cell, Unit>();

  for (const spec of CELLS) {
    for (const source of SOURCES) {
      values.set(key(spec.cell, source.label), []);
    }

    for (let sample = 0; sample < SAMPLES; sample++) {
      const order = ORDERS[sample % ORDERS.length]!;
      for (const variant of order) {
        const result = runWorker(spec.cell, variant, false);
        if (result.metric === null) {
          throw new Error(`Missing timing metric for ${variant} ${spec.cell}`);
        }

        const knownUnit = units.get(spec.cell);
        if (knownUnit !== undefined && knownUnit !== result.unit) {
          throw new Error(`Unit mismatch for ${spec.cell}`);
        }
        units.set(spec.cell, result.unit);
        values.get(key(spec.cell, variant))!.push(result.metric);
      }
    }
  }

  const summaries = new Map<string, Summary>();
  for (const spec of CELLS) {
    const unit = units.get(spec.cell);
    if (unit === undefined) throw new Error(`Missing unit for ${spec.cell}`);

    for (const source of SOURCES) {
      const input = values.get(key(spec.cell, source.label));
      if (input === undefined || input.length !== SAMPLES) {
        throw new Error(`Incomplete timing set for ${source.label} ${spec.cell}`);
      }
      summaries.set(
        key(spec.cell, source.label),
        summarize(spec.cell, source.label, unit, input),
      );
    }
  }

  console.log("Balanced attribution cells");
  console.log("| cell | source | median | p25 | p75 | min | max | unit |");
  console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const spec of CELLS) {
    for (const source of SOURCES) {
      const summary = getSummary(summaries, spec.cell, source.label);
      console.log(
        `| ${spec.cell} | ${source.label} | ${formatMetric(summary.median, summary.unit)} | ${formatMetric(summary.p25, summary.unit)} | ${formatMetric(summary.p75, summary.unit)} | ${formatMetric(summary.min, summary.unit)} | ${formatMetric(summary.max, summary.unit)} | ${summary.unit} |`,
      );
    }
  }

  console.log();
  console.log("Direct ratios vs CP4-I");
  console.log("| comparison | CP4-Q | CP4-T | CP4-U |");
  console.log("| --- | ---: | ---: | ---: |");
  for (const spec of CELLS) {
    console.log(
      `| ${spec.label} | ${ratio(summaries, spec.cell, "cp4q", "cp4i").toFixed(4)}x | ${ratio(summaries, spec.cell, "cp4t", "cp4i").toFixed(4)}x | ${ratio(summaries, spec.cell, "cp4u", "cp4i").toFixed(4)}x |`,
    );
  }

  console.log();
  console.log("Mechanism pairwise ratios");
  console.log("| comparison | T / Q | U / Q | U / T |");
  console.log("| --- | ---: | ---: | ---: |");
  for (const spec of CELLS) {
    console.log(
      `| ${spec.label} | ${ratio(summaries, spec.cell, "cp4t", "cp4q").toFixed(4)}x | ${ratio(summaries, spec.cell, "cp4u", "cp4q").toFixed(4)}x | ${ratio(summaries, spec.cell, "cp4u", "cp4t").toFixed(4)}x |`,
    );
  }

  console.log();
  console.log(
    "Frozen acceptance-threshold projection (attribution only; does not override prior acceptance)",
  );
  console.log("| source | projected passing cells | result |");
  console.log("| --- | ---: | --- |");
  for (const variant of ["cp4q", "cp4t", "cp4u"] as const) {
    let passing = 0;
    for (const spec of CELLS) {
      if (ratio(summaries, spec.cell, variant, "cp4i") <= spec.limit) {
        passing++;
      }
    }
    const result = passing === CELLS.length ? "PROJECTED ALL PASS" : "PROJECTED FAIL";
    console.log(`| ${variant} | ${passing}/${CELLS.length} | ${result} |`);
  }
}

function runWorker(
  cell: Cell,
  variant: Variant,
  workerProbeOnly: boolean,
): WorkerResult {
  const sourceRoot = worktrees.get(variant);
  if (sourceRoot === undefined) throw new Error(`Missing worktree for ${variant}`);

  const result = spawnSync(
    process.execPath,
    [
      WORKER,
      `--cell=${cell}`,
      "--variant=candidate",
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
  if (parsed.cell !== cell || parsed.variant !== "candidate") {
    throw new Error(`Worker identity mismatch for ${variant} ${cell}`);
  }
  return parsed;
}

function preflight(): void {
  if (Bun.version !== EXPECTED_BUN) {
    throw new Error(`CP4-V requires Bun ${EXPECTED_BUN}, got ${Bun.version}`);
  }
  if (Bun.revision !== EXPECTED_BUN_REVISION) {
    throw new Error(
      `CP4-V requires Bun revision ${EXPECTED_BUN_REVISION}, got ${Bun.revision}`,
    );
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty !== "") {
    throw new Error(`CP4-V requires a clean worktree:\n${dirty}`);
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
  const failures: string[] = [];

  for (const source of [...SOURCES].reverse()) {
    if (!created.has(source.label)) continue;
    const path = worktrees.get(source.label);
    if (path === undefined) continue;

    const remove = spawnSync(
      "git",
      ["-C", REPOSITORY_ROOT, "worktree", "remove", "--force", path],
      { encoding: "utf8" },
    );
    if (remove.status !== 0) {
      failures.push(`${source.label}: ${remove.stderr.trim()}`);
    }
  }

  spawnSync("git", ["-C", REPOSITORY_ROOT, "worktree", "prune"], {
    encoding: "utf8",
  });

  if (failures.length !== 0) {
    throw new Error(`CP4-V worktree cleanup failed:\n${failures.join("\n")}`);
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
    max: sorted.at(-1)!,
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

function ratio(
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

function key(cell: Cell, variant: Variant): string {
  return `${cell}:${variant}`;
}

function formatMetric(value: number, unit: Unit): string {
  if (unit === "bytes") return value.toFixed(0);
  if (unit === "ms") return value.toFixed(3);
  return value.toFixed(1);
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
