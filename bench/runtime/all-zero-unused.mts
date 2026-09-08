import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

import { Gelis } from "../../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = resolve(HERE, "results");

const ROUTES = 5000;
const SAMPLES = 9;
const TARGET_MS = 150;
const MIN_CALIBRATION_MS = 20;
const WARMUP_ITERATIONS = 20_000;
const TARGET_INDEX = ROUTES - 1;

const MAX_CV = 0.05;
const MAX_OVERHEAD_PERCENT = 3;

const label = readLabel(process.argv.slice(2));

mkdirSync(RESULTS_DIR, { recursive: true });

const app = new Gelis();

for (let index = 0; index < ROUTES; index++) {
  app.get(`/r/${index}`, () => "ok");
}

const request = new Request(`http://gelis.test/r/${TARGET_INDEX}`);

let sink: unknown;

const operation = () => {
  const result = app.fetch(request);

  if (isPromiseLike(result)) {
    throw new Error("plain route unexpectedly became asynchronous");
  }

  if (!(result instanceof Response) || result.status !== 200) {
    throw new Error("plain route correctness validation failed");
  }

  sink = result;
};

for (let index = 0; index < WARMUP_ITERATIONS; index++) {
  operation();
}

const iterations = calibrateSync(operation);
const samples: number[] = [];

for (let sample = 0; sample < SAMPLES; sample++) {
  const elapsed = measureSync(operation, iterations);
  const nsPerOp = (elapsed * 1_000_000) / iterations;

  samples.push(nsPerOp);

  console.log(
    `${label} | sample ${sample + 1}/${SAMPLES} | ${round(nsPerOp, 2)} ns/op`,
  );
}

const nsPerOp = median(samples);
const cv = coefficientOfVariation(samples);

const result = {
  metadata: {
    label,
    generatedAt: new Date().toISOString(),
    runtime: `bun ${Bun.version}`,
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model ?? "unknown",
    logicalCpus: cpus().length,
    routes: ROUTES,
    samples: SAMPLES,
    iterations,
    targetMilliseconds: TARGET_MS,
  },

  result: {
    nsPerOp,
    opsPerSecond: 1_000_000_000 / nsPerOp,
    cv,
  },
};

const outputPath = resolve(RESULTS_DIR, `all-zero-unused-${label}.json`);

console.log("");
console.log("P9-C ALL zero-unused plain-route benchmark");
console.log(`Label:       ${label}`);
console.log(`Runtime:     ${result.metadata.runtime}`);
console.log(`CPU:         ${result.metadata.cpu}`);
console.log(`Routes:      ${ROUTES}`);
console.log(`Samples:     ${SAMPLES}`);
console.log(`Iterations:  ${iterations}`);
console.log(`Median:      ${round(nsPerOp, 2)} ns/op`);
console.log(
  `Ops/s:       ${Math.round(result.result.opsPerSecond).toLocaleString("en-US")}`,
);
console.log(`CV:          ${round(cv * 100, 2)}%`);

if (cv > MAX_CV) {
  throw new Error(`Benchmark invalid: CV ${round(cv * 100, 2)}% exceeds 5%`);
}

writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);

if (label === "candidate") {
  const baselinePath = resolve(RESULTS_DIR, "all-zero-unused-baseline.json");

  const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as {
    readonly result: {
      readonly nsPerOp: number;
      readonly cv: number;
    };
  };

  const overheadPercent = (nsPerOp / baseline.result.nsPerOp - 1) * 100;

  console.log("");
  console.log(`Baseline:    ${round(baseline.result.nsPerOp, 2)} ns/op`);
  console.log(`Delta:       ${formatSigned(overheadPercent)}%`);
  console.log(`Gate:        <= +${MAX_OVERHEAD_PERCENT}%`);

  if (baseline.result.cv > MAX_CV) {
    throw new Error("Stored baseline is invalid because CV exceeds 5%");
  }

  if (overheadPercent > MAX_OVERHEAD_PERCENT) {
    throw new Error(
      `Zero-unused gate failed: ${formatSigned(overheadPercent)}%`,
    );
  }

  console.log("Verdict:     PASS");
}

console.log("");
console.log(`Raw result: ${outputPath}`);

void sink;

function readLabel(args: readonly string[]): "baseline" | "candidate" {
  const value = args.find((argument) => argument.startsWith("--label="));

  const label = value?.slice("--label=".length);

  if (label === "baseline" || label === "candidate") {
    return label;
  }

  throw new Error("Expected --label=baseline or --label=candidate");
}

function calibrateSync(operation: () => void): number {
  let iterations = 1000;

  while (true) {
    const elapsed = measureSync(operation, iterations);

    if (elapsed >= MIN_CALIBRATION_MS) {
      return Math.max(
        1,
        Math.round((iterations * TARGET_MS) / Math.max(elapsed, 0.001)),
      );
    }

    iterations *= 2;
  }
}

function measureSync(operation: () => void, iterations: number): number {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    operation();
  }

  return performance.now() - start;
}

function coefficientOfVariation(values: readonly number[]): number {
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;

  const variance =
    values.reduce((sum, value) => {
      const difference = value - average;

      return sum + difference * difference;
    }, 0) / values.length;

  return Math.sqrt(variance) / average;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle]!;
  }

  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function formatSigned(value: number): string {
  const rounded = round(value, 2);

  return `${rounded >= 0 ? "+" : ""}${rounded}`;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return false;
  }

  return (
    typeof (
      value as {
        then?: unknown;
      }
    ).then === "function"
  );
}
