import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const EXPECTED_BUN = "1.4.2";
const EXPECTED_BUN_REVISION = "744846f844374847c902b5e7fd59b4342a51ef99";
const PRODUCTION_SOURCE = "8e43aad09759d60378b3fc174292850057ccfba3";
const ROUTES = 5_000;
const SAMPLES = 11;
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, "cp3p-trailing-fingerprint-worker.mts");
const REPOSITORY_ROOT = resolve(HERE, "../..");

type Cell =
  | "current-trailing-stable"
  | "fingerprint-trailing-stable"
  | "current-trailing-request"
  | "fingerprint-trailing-request"
  | "current-pipeline-string"
  | "fingerprint-pipeline-string"
  | "current-pipeline-json"
  | "fingerprint-pipeline-json"
  | "current-mixed-static-request"
  | "fingerprint-mixed-static-request"
  | "current-mixed-dynamic-request"
  | "fingerprint-mixed-dynamic-request"
  | "current-collision-request"
  | "fingerprint-collision-request";

interface Pair {
  readonly label: string;
  readonly current: Cell;
  readonly candidate: Cell;
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
    label: "trailing stable pathname",
    current: "current-trailing-stable",
    candidate: "fingerprint-trailing-stable",
  },
  {
    label: "trailing request-derived pathname",
    current: "current-trailing-request",
    candidate: "fingerprint-trailing-request",
  },
  {
    label: "string pipeline",
    current: "current-pipeline-string",
    candidate: "fingerprint-pipeline-string",
  },
  {
    label: "JSON pipeline",
    current: "current-pipeline-json",
    candidate: "fingerprint-pipeline-json",
  },
  {
    label: "mixed static request",
    current: "current-mixed-static-request",
    candidate: "fingerprint-mixed-static-request",
  },
  {
    label: "mixed dynamic request",
    current: "current-mixed-dynamic-request",
    candidate: "fingerprint-mixed-dynamic-request",
  },
  {
    label: "forced fingerprint collision",
    current: "current-collision-request",
    candidate: "fingerprint-collision-request",
  },
];

const CELLS = PAIRS.flatMap((pair) => [pair.current, pair.candidate]);
const probeOnly = process.argv.includes("--probe-only");
const harnessSha = git(["rev-parse", "HEAD"]);
const cpu = cpus()[0]?.model ?? "unknown";

preflight();

console.log(
  "Competitive Performance v0.1 — CP3-P trailing-prefix fingerprint viability",
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
    `CP3-P CORRECTNESS PROBE: PASS (${CELLS.length}/${CELLS.length})`,
  );
  process.exit(0);
}

const values = new Map<Cell, number[]>();
for (const cell of CELLS) values.set(cell, []);

for (const pair of PAIRS) {
  for (let sample = 0; sample < SAMPLES; sample++) {
    const candidateFirst = sample % 2 === 1;
    const order = candidateFirst
      ? [pair.candidate, pair.current]
      : [pair.current, pair.candidate];

    for (const cell of order) {
      const result = runWorker(cell, false);
      if (result.nsPerOp === null)
        throw new Error(`Missing timing for ${cell}`);
      values.get(cell)!.push(result.nsPerOp);
    }
  }
}

const summaries = new Map<Cell, Summary>();
for (const cell of CELLS) {
  const cellValues = values.get(cell);
  if (cellValues === undefined || cellValues.length !== SAMPLES) {
    throw new Error(`Incomplete timing set for ${cell}`);
  }
  summaries.set(cell, summarize(cell, cellValues));
}

console.log("Trailing-prefix fingerprint viability cells");
console.log("| cell | median ns/op | p25 | p75 | min | max |");
console.log("| --- | ---: | ---: | ---: | ---: | ---: |");
for (const cell of CELLS) {
  const summary = summaries.get(cell)!;
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

const requestRatio = ratio(
  "fingerprint-trailing-request",
  "current-trailing-request",
);
const stringPipelineRatio = ratio(
  "fingerprint-pipeline-string",
  "current-pipeline-string",
);
const jsonPipelineRatio = ratio(
  "fingerprint-pipeline-json",
  "current-pipeline-json",
);
const pipelineGeomean = Math.sqrt(stringPipelineRatio * jsonPipelineRatio);
const mixedDynamicRatio = ratio(
  "fingerprint-mixed-dynamic-request",
  "current-mixed-dynamic-request",
);
const mixedStaticRatio = ratio(
  "fingerprint-mixed-static-request",
  "current-mixed-static-request",
);
const collisionRatio = ratio(
  "fingerprint-collision-request",
  "current-collision-request",
);
const stableRatio = ratio(
  "fingerprint-trailing-stable",
  "current-trailing-stable",
);

const gates = [
  {
    label: "request-derived dynamic",
    ratio: requestRatio,
    limit: 0.9,
  },
  {
    label: "pipeline geomean",
    ratio: pipelineGeomean,
    limit: 0.98,
  },
  {
    label: "mixed dynamic request",
    ratio: mixedDynamicRatio,
    limit: 0.93,
  },
  {
    label: "mixed static request",
    ratio: mixedStaticRatio,
    limit: 1.02,
  },
  {
    label: "forced-collision fallback",
    ratio: collisionRatio,
    limit: 1.15,
  },
] as const;

console.log();
console.log("Frozen CP3-P viability gates");
console.log("| gate | candidate/current | limit | result |");
console.log("| --- | ---: | ---: | --- |");
let passed = true;
for (const gate of gates) {
  const result = gate.ratio <= gate.limit ? "PASS" : "FAIL";
  if (result === "FAIL") passed = false;
  console.log(
    `| ${gate.label} | ${gate.ratio.toFixed(4)}x | <= ${gate.limit.toFixed(4)}x | ${result} |`,
  );
}
console.log(
  `| stable-path diagnostic (not a gate) | ${stableRatio.toFixed(4)}x | n/a | INFO |`,
);

console.log();
console.log(`CP3-P FINGERPRINT VIABILITY GATE: ${passed ? "PASS" : "FAIL"}`);
console.log("CP3-P LOCAL TRAILING FINGERPRINT VIABILITY RUN: COMPLETE");

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
  if (line === undefined)
    throw new Error(`Worker emitted no result for ${cell}`);
  const parsed = JSON.parse(line) as WorkerResult;
  if (parsed.cell !== cell) {
    throw new Error(
      `Worker cell mismatch: expected ${cell}, got ${parsed.cell}`,
    );
  }
  return parsed;
}

function summarize(cell: Cell, input: readonly number[]): Summary {
  const sorted = [...input].sort((left, right) => left - right);
  return {
    cell,
    median: quantile(sorted, 0.5),
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
    min: sorted[0]!,
    max: sorted.at(-1)!,
  };
}

function preflight(): void {
  if (Bun.version !== EXPECTED_BUN) {
    throw new Error(`CP3-P requires Bun ${EXPECTED_BUN}, got ${Bun.version}`);
  }
  if (Bun.revision !== EXPECTED_BUN_REVISION) {
    throw new Error(
      `CP3-P requires Bun revision ${EXPECTED_BUN_REVISION}, got ${Bun.revision}`,
    );
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty !== "") {
    throw new Error(`CP3-P requires a clean worktree:\n${dirty}`);
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

function median(cell: Cell): number {
  const summary = summaries.get(cell);
  if (summary === undefined) throw new Error(`Missing summary for ${cell}`);
  return summary.median;
}

function ratio(candidate: Cell, current: Cell): number {
  return median(candidate) / median(current);
}

function format(value: number): string {
  return value.toFixed(1);
}
