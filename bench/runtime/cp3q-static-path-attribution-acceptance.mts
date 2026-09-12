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
const WORKER = join(HERE, "cp3q-static-path-attribution-worker.mts");
const REPOSITORY_ROOT = resolve(HERE, "../..");

type Cell =
  | "production-mixed-static-request"
  | "shared-current-mixed-static-request"
  | "shared-fingerprint-mixed-static-request"
  | "production-mixed-dynamic-request"
  | "shared-current-mixed-dynamic-request"
  | "shared-fingerprint-mixed-dynamic-request"
  | "shared-current-pipeline-string"
  | "shared-fingerprint-pipeline-string"
  | "shared-current-pipeline-json"
  | "shared-fingerprint-pipeline-json"
  | "shared-current-collision-request"
  | "shared-fingerprint-collision-request";

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

const GROUPS: readonly (readonly Cell[])[] = [
  [
    "production-mixed-static-request",
    "shared-current-mixed-static-request",
    "shared-fingerprint-mixed-static-request",
  ],
  [
    "production-mixed-dynamic-request",
    "shared-current-mixed-dynamic-request",
    "shared-fingerprint-mixed-dynamic-request",
  ],
  ["shared-current-pipeline-string", "shared-fingerprint-pipeline-string"],
  ["shared-current-pipeline-json", "shared-fingerprint-pipeline-json"],
  ["shared-current-collision-request", "shared-fingerprint-collision-request"],
];

const CELLS = [...new Set(GROUPS.flat())];
const probeOnly = process.argv.includes("--probe-only");
const harnessSha = git(["rev-parse", "HEAD"]);
const cpu = cpus()[0]?.model ?? "unknown";

preflight();

console.log("Competitive Performance v0.1 — CP3-Q static-path attribution");
console.log(`Bun:         ${Bun.version}`);
console.log(`Revision:    ${Bun.revision}`);
console.log(`CPU:         ${cpu}`);
console.log(`Harness SHA: ${harnessSha}`);
console.log(`Gelis src:   ${PRODUCTION_SOURCE}`);
console.log(`Routes:      ${ROUTES.toLocaleString("en-US")}`);
console.log(
  probeOnly
    ? "Mode:        correctness probe only"
    : `Samples:     ${SAMPLES} fresh-worker samples/cell with rotated group order`,
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
    `CP3-Q CORRECTNESS PROBE: PASS (${CELLS.length}/${CELLS.length})`,
  );
  process.exit(0);
}

const values = new Map<Cell, number[]>();
for (const cell of CELLS) values.set(cell, []);

for (const group of GROUPS) {
  for (let sample = 0; sample < SAMPLES; sample++) {
    const offset = sample % group.length;
    const order = [...group.slice(offset), ...group.slice(0, offset)];

    for (const cell of order) {
      const result = runWorker(cell, false);
      if (result.nsPerOp === null) {
        throw new Error(`Missing timing for ${cell}`);
      }
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

console.log("Static-path attribution cells");
console.log("| cell | median ns/op | p25 | p75 | min | max |");
console.log("| --- | ---: | ---: | ---: | ---: | ---: |");
for (const cell of CELLS) {
  const summary = summaries.get(cell)!;
  console.log(
    `| ${cell} | ${format(summary.median)} | ${format(summary.p25)} | ${format(summary.p75)} | ${format(summary.min)} | ${format(summary.max)} |`,
  );
}

const staticCandidateRatio = ratio(
  "shared-fingerprint-mixed-static-request",
  "shared-current-mixed-static-request",
);
const dynamicCandidateRatio = ratio(
  "shared-fingerprint-mixed-dynamic-request",
  "shared-current-mixed-dynamic-request",
);
const stringPipelineRatio = ratio(
  "shared-fingerprint-pipeline-string",
  "shared-current-pipeline-string",
);
const jsonPipelineRatio = ratio(
  "shared-fingerprint-pipeline-json",
  "shared-current-pipeline-json",
);
const pipelineGeomean = Math.sqrt(stringPipelineRatio * jsonPipelineRatio);
const collisionRatio = ratio(
  "shared-fingerprint-collision-request",
  "shared-current-collision-request",
);
const staticFidelity = ratio(
  "shared-current-mixed-static-request",
  "production-mixed-static-request",
);
const dynamicFidelity = ratio(
  "shared-current-mixed-dynamic-request",
  "production-mixed-dynamic-request",
);

console.log();
console.log("Derived ratios");
console.log("| comparison | ratio |");
console.log("| --- | ---: |");
console.log(`| shared fingerprint/current static | ${staticCandidateRatio.toFixed(4)}x |`);
console.log(`| shared fingerprint/current dynamic | ${dynamicCandidateRatio.toFixed(4)}x |`);
console.log(`| shared fingerprint/current string pipeline | ${stringPipelineRatio.toFixed(4)}x |`);
console.log(`| shared fingerprint/current JSON pipeline | ${jsonPipelineRatio.toFixed(4)}x |`);
console.log(`| shared pipeline geomean | ${pipelineGeomean.toFixed(4)}x |`);
console.log(`| shared forced-collision fallback | ${collisionRatio.toFixed(4)}x |`);
console.log(`| shared-current / production static fidelity | ${staticFidelity.toFixed(4)}x |`);
console.log(`| shared-current / production dynamic fidelity | ${dynamicFidelity.toFixed(4)}x |`);

const gates = [
  {
    label: "shared fingerprint/current static",
    pass: staticCandidateRatio <= 1.02,
    value: `${staticCandidateRatio.toFixed(4)}x`,
    limit: "<= 1.0200x",
  },
  {
    label: "shared fingerprint/current dynamic",
    pass: dynamicCandidateRatio <= 0.9,
    value: `${dynamicCandidateRatio.toFixed(4)}x`,
    limit: "<= 0.9000x",
  },
  {
    label: "shared pipeline geomean",
    pass: pipelineGeomean <= 0.98,
    value: `${pipelineGeomean.toFixed(4)}x`,
    limit: "<= 0.9800x",
  },
  {
    label: "shared forced-collision fallback",
    pass: collisionRatio <= 1.15,
    value: `${collisionRatio.toFixed(4)}x`,
    limit: "<= 1.1500x",
  },
  {
    label: "shared-current / production static fidelity",
    pass: staticFidelity >= 0.9 && staticFidelity <= 1.1,
    value: `${staticFidelity.toFixed(4)}x`,
    limit: "0.9000x .. 1.1000x",
  },
  {
    label: "shared-current / production dynamic fidelity",
    pass: dynamicFidelity >= 0.9 && dynamicFidelity <= 1.1,
    value: `${dynamicFidelity.toFixed(4)}x`,
    limit: "0.9000x .. 1.1000x",
  },
] as const;

console.log();
console.log("Frozen CP3-Q attribution gates");
console.log("| gate | value | limit | result |");
console.log("| --- | ---: | ---: | --- |");
let passed = true;
for (const gate of gates) {
  if (!gate.pass) passed = false;
  console.log(
    `| ${gate.label} | ${gate.value} | ${gate.limit} | ${gate.pass ? "PASS" : "FAIL"} |`,
  );
}

console.log();
console.log(`CP3-Q STATIC-PATH ATTRIBUTION GATE: ${passed ? "PASS" : "FAIL"}`);
console.log("CP3-Q LOCAL STATIC-PATH ATTRIBUTION RUN: COMPLETE");

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
    throw new Error(`CP3-Q requires Bun ${EXPECTED_BUN}, got ${Bun.version}`);
  }
  if (Bun.revision !== EXPECTED_BUN_REVISION) {
    throw new Error(
      `CP3-Q requires Bun revision ${EXPECTED_BUN_REVISION}, got ${Bun.revision}`,
    );
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty !== "") {
    throw new Error(`CP3-Q requires a clean worktree:\n${dirty}`);
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

function ratio(numerator: Cell, denominator: Cell): number {
  return median(numerator) / median(denominator);
}

function format(value: number): string {
  return value.toFixed(1);
}
