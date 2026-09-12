import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const EXPECTED_BUN = "1.4.2";
const EXPECTED_BUN_REVISION = "744846f844374847c902b5e7fd59b4342a51ef99";
const PRODUCTION_SOURCE = "8e43aad09759d60378b3fc174292850057ccfba3";
const ROUTES = 5_000;
const SAMPLES = 11;
const REQUEST_RATIO_LIMIT = 0.85;
const PIPELINE_GEOMEAN_LIMIT = 0.97;
const MIXED_DYNAMIC_RATIO_LIMIT = 0.9;
const MIXED_STATIC_RATIO_LIMIT = 1.02;
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, "cp3o-trailing-radix-worker.mts");
const REPOSITORY_ROOT = resolve(HERE, "../..");

type Cell =
  | "current-trailing-stable"
  | "radix-trailing-stable"
  | "current-trailing-request"
  | "radix-trailing-request"
  | "current-pipeline-string"
  | "radix-pipeline-string"
  | "current-pipeline-json"
  | "radix-pipeline-json"
  | "current-mixed-static-request"
  | "radix-mixed-static-request"
  | "current-mixed-dynamic-request"
  | "radix-mixed-dynamic-request";

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

interface Pair {
  readonly label: string;
  readonly current: Cell;
  readonly candidate: Cell;
}

const PAIRS: readonly Pair[] = [
  {
    label: "trailing stable pathname",
    current: "current-trailing-stable",
    candidate: "radix-trailing-stable",
  },
  {
    label: "trailing request-derived pathname",
    current: "current-trailing-request",
    candidate: "radix-trailing-request",
  },
  {
    label: "string pipeline",
    current: "current-pipeline-string",
    candidate: "radix-pipeline-string",
  },
  {
    label: "JSON pipeline",
    current: "current-pipeline-json",
    candidate: "radix-pipeline-json",
  },
  {
    label: "mixed static request",
    current: "current-mixed-static-request",
    candidate: "radix-mixed-static-request",
  },
  {
    label: "mixed dynamic request",
    current: "current-mixed-dynamic-request",
    candidate: "radix-mixed-dynamic-request",
  },
];

const CELLS: readonly Cell[] = PAIRS.flatMap((pair) => [
  pair.current,
  pair.candidate,
]);

const probeOnly = process.argv.includes("--probe-only");
const harnessSha = git(["rev-parse", "HEAD"]);
const cpu = cpus()[0]?.model ?? "unknown";

preflight();

console.log(
  "Competitive Performance v0.1 — CP3-O trailing-prefix radix viability",
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
    : `Samples:     ${SAMPLES} mirrored fresh-worker pairs/cell pair`,
);
console.log();

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
    `CP3-O CORRECTNESS PROBE: PASS (${CELLS.length}/${CELLS.length})`,
  );
  process.exit(0);
}

const summaries = new Map<Cell, Summary>();

for (const pair of PAIRS) {
  const [current, candidate] = measurePair(pair.current, pair.candidate);
  summaries.set(pair.current, current);
  summaries.set(pair.candidate, candidate);
}

console.log("Trailing-prefix radix viability cells");
console.log("| cell | median ns/op | p25 | p75 | min | max |");
console.log("| --- | ---: | ---: | ---: | ---: | ---: |");

for (const cell of CELLS) {
  const summary = summaryFor(cell);
  console.log(
    `| ${cell} | ${format(summary.median)} | ${format(summary.p25)} | ${format(summary.p75)} | ${format(summary.min)} | ${format(summary.max)} |`,
  );
}

console.log();
console.log("Candidate/current ratios");
console.log("| comparison | ratio | delta ns |");
console.log("| --- | ---: | ---: |");

for (const pair of PAIRS) {
  const current = median(pair.current);
  const candidate = median(pair.candidate);
  console.log(
    `| ${pair.label} | ${(candidate / current).toFixed(4)}x | ${(candidate - current).toFixed(1)} |`,
  );
}

const stableRatio = ratio(
  "radix-trailing-stable",
  "current-trailing-stable",
);
const requestRatio = ratio(
  "radix-trailing-request",
  "current-trailing-request",
);
const stringPipelineRatio = ratio(
  "radix-pipeline-string",
  "current-pipeline-string",
);
const jsonPipelineRatio = ratio(
  "radix-pipeline-json",
  "current-pipeline-json",
);
const pipelineGeomean = Math.sqrt(
  stringPipelineRatio * jsonPipelineRatio,
);
const mixedStaticRatio = ratio(
  "radix-mixed-static-request",
  "current-mixed-static-request",
);
const mixedDynamicRatio = ratio(
  "radix-mixed-dynamic-request",
  "current-mixed-dynamic-request",
);

const gates = [
  {
    label: "request-derived dynamic",
    value: requestRatio,
    limit: REQUEST_RATIO_LIMIT,
  },
  {
    label: "pipeline geomean",
    value: pipelineGeomean,
    limit: PIPELINE_GEOMEAN_LIMIT,
  },
  {
    label: "mixed dynamic request",
    value: mixedDynamicRatio,
    limit: MIXED_DYNAMIC_RATIO_LIMIT,
  },
  {
    label: "mixed static request",
    value: mixedStaticRatio,
    limit: MIXED_STATIC_RATIO_LIMIT,
  },
] as const;

console.log();
console.log("Frozen CP3-O viability gates");
console.log("| gate | candidate/current | limit | result |");
console.log("| --- | ---: | ---: | --- |");
for (const gate of gates) {
  console.log(
    `| ${gate.label} | ${gate.value.toFixed(4)}x | <= ${gate.limit.toFixed(4)}x | ${gate.value <= gate.limit ? "PASS" : "FAIL"} |`,
  );
}
console.log(
  `| stable-path diagnostic (not a gate) | ${stableRatio.toFixed(4)}x | n/a | INFO |`,
);

const passed = gates.every((gate) => gate.value <= gate.limit);

console.log();
console.log(`CP3-O RADIX VIABILITY GATE: ${passed ? "PASS" : "FAIL"}`);
console.log("CP3-O LOCAL TRAILING RADIX VIABILITY RUN: COMPLETE");

function measurePair(
  currentCell: Cell,
  candidateCell: Cell,
): readonly [Summary, Summary] {
  const currentValues: number[] = [];
  const candidateValues: number[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const currentFirst = sample % 2 === 0;
    const order = currentFirst
      ? ([currentCell, candidateCell] as const)
      : ([candidateCell, currentCell] as const);

    for (const cell of order) {
      const result = runWorker(cell, false);
      if (result.nsPerOp === null) {
        throw new Error(`Missing timing for ${cell}`);
      }
      if (cell === currentCell) currentValues.push(result.nsPerOp);
      else candidateValues.push(result.nsPerOp);
    }
  }

  return [summarize(currentCell, currentValues), summarize(candidateCell, candidateValues)];
}

function summarize(cell: Cell, values: number[]): Summary {
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
    throw new Error(`CP3-O requires Bun ${EXPECTED_BUN}, got ${Bun.version}`);
  }

  if (Bun.revision !== EXPECTED_BUN_REVISION) {
    throw new Error(
      `CP3-O requires Bun revision ${EXPECTED_BUN_REVISION}, got ${Bun.revision}`,
    );
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty !== "") {
    throw new Error(`CP3-O requires a clean worktree:\n${dirty}`);
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
  if (sorted.length === 0) throw new Error("Cannot calculate empty quantile");
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  const weight = index - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

function summaryFor(cell: Cell): Summary {
  const summary = summaries.get(cell);
  if (summary === undefined) throw new Error(`Missing summary for ${cell}`);
  return summary;
}

function median(cell: Cell): number {
  return summaryFor(cell).median;
}

function ratio(candidate: Cell, current: Cell): number {
  return median(candidate) / median(current);
}

function format(value: number): string {
  return value.toFixed(1);
}
