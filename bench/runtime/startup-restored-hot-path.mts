import { mkdirSync, writeFileSync } from "node:fs";

import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

import { Gelis, definePlugin } from "../../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = resolve(HERE, "results");

const ROUTES = 5000;
const SAMPLES = 9;
const TARGET_MS = 150;
const MIN_CALIBRATION_MS = 20;
const WARMUP_ITERATIONS = 20_000;
const TARGET_INDEX = ROUTES - 1;

const OK_RESPONSE = new Response("ok");

interface Variant {
  readonly name: "plain" | "startup-restored";
  readonly app: Gelis;
}

interface SampleRow {
  variant: Variant["name"];
  sample: number;
  nsPerOp: number;
}

interface AggregateRow {
  variant: Variant["name"];
  nsPerOp: number;
  opsPerSecond: number;
  cv: number;
}

mkdirSync(RESULTS_DIR, { recursive: true });

const plain = buildPlainApp();
const startupRestored = await buildStartupRestoredApp();

assertPrototypeHotPath("plain", plain);
assertPrototypeHotPath("startup-restored", startupRestored);

const request = new Request(`http://gelis.test/r/${TARGET_INDEX}`);

const variants = [
  { name: "plain", app: plain },
  { name: "startup-restored", app: startupRestored },
] as const satisfies readonly Variant[];

let sink: unknown;

for (const variant of variants) {
  const operation = createOperation(variant, request);

  for (let index = 0; index < WARMUP_ITERATIONS; index++) {
    operation();
  }
}

const calibrationOperation = createOperation(variants[0], request);
const iterations = calibrateSync(calibrationOperation);
const raw: SampleRow[] = [];

for (let sample = 0; sample < SAMPLES; sample++) {
  const order = sample % 2 === 0 ? variants : [...variants].reverse();

  for (const variant of order) {
    const operation = createOperation(variant, request);
    const elapsed = measureSync(operation, iterations);
    const nsPerOp = (elapsed * 1_000_000) / iterations;

    raw.push({
      variant: variant.name,
      sample,
      nsPerOp,
    });

    console.log(
      [
        variant.name,
        `sample ${sample + 1}/${SAMPLES}`,
        `${round(nsPerOp, 2)} ns/op`,
      ].join(" | "),
    );
  }
}

const rows = aggregate(raw);
const plainRow = requireAggregate(rows, "plain");
const restoredRow = requireAggregate(rows, "startup-restored");

const overheadNs = restoredRow.nsPerOp - plainRow.nsPerOp;
const overheadPercent = (restoredRow.nsPerOp / plainRow.nsPerOp - 1) * 100;

const metadata = {
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
};

console.log("\nGelis startup restored hot-path benchmark");
console.log(`Runtime:     ${metadata.runtime}`);
console.log(`CPU:         ${metadata.cpu}`);
console.log(`Routes:      ${ROUTES}`);
console.log(`Samples:     ${SAMPLES}`);
console.log(`Iterations:  ${iterations}\n`);

console.table(
  rows.map((row) => ({
    variant: row.variant,
    "ns/op median": round(row.nsPerOp, 2),
    "ops/s": Math.round(row.opsPerSecond).toLocaleString("en-US"),
    "cv %": round(row.cv * 100, 2),
  })),
);

console.log("\nStartup-restored delta:");
console.log(`overhead ns: ${formatSigned(overheadNs)}`);
console.log(`overhead %:  ${formatSigned(overheadPercent)}%`);

const output = {
  metadata,
  invariants: {
    plainHasOwnFetch: hasOwnFetch(plain),
    startupRestoredHasOwnFetch: hasOwnFetch(startupRestored),
  },
  comparison: {
    overheadNs,
    overheadPercent,
  },
  results: rows,
  raw,
};

writeFileSync(
  resolve(RESULTS_DIR, "latest-startup-restored-hot-path.json"),
  `${JSON.stringify(output, null, 2)}\n`,
);

console.log(
  "\nRaw results: bench/runtime/results/latest-startup-restored-hot-path.json",
);

function buildPlainApp(): Gelis {
  const app = new Gelis();
  registerRoutes(app);
  return app;
}

async function buildStartupRestoredApp(): Promise<Gelis> {
  const app = new Gelis();

  registerRoutes(app);

  app.use(
    definePlugin("startup-restored-hot-path-benchmark", (setup) => {
      setup.startup(async () => {
        await Promise.resolve();
      });
    }),
  );

  if (!hasOwnFetch(app)) {
    throw new Error(
      "startup benchmark expected a request gate before app.ready()",
    );
  }

  await app.ready();

  return app;
}

function registerRoutes(app: Gelis): void {
  for (let index = 0; index < ROUTES; index++) {
    app.get(`/r/${index}`, () => OK_RESPONSE);
  }
}

function assertPrototypeHotPath(name: Variant["name"], app: Gelis): void {
  if (hasOwnFetch(app)) {
    throw new Error(`${name} unexpectedly retains an own fetch wrapper`);
  }

  const result = app.fetch(new Request(`http://gelis.test/r/${TARGET_INDEX}`));

  if (isPromiseLike(result)) {
    throw new Error(`${name} unexpectedly became asynchronous`);
  }

  if (!(result instanceof Response) || result.status !== 200) {
    throw new Error(`${name} failed hot-path correctness validation`);
  }
}

function createOperation(variant: Variant, request: Request): () => void {
  return () => {
    const result = variant.app.fetch(request);

    if (isPromiseLike(result)) {
      throw new Error(`${variant.name} unexpectedly became asynchronous`);
    }

    sink = result;
  };
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

function aggregate(results: SampleRow[]): AggregateRow[] {
  const names: readonly Variant["name"][] = ["plain", "startup-restored"];

  return names.map((variant) => {
    const samples = results
      .filter((row) => row.variant === variant)
      .map((row) => row.nsPerOp);

    const nsPerOp = median(samples);

    return {
      variant,
      nsPerOp,
      opsPerSecond: 1_000_000_000 / nsPerOp,
      cv: coefficientOfVariation(samples),
    };
  });
}

function requireAggregate(
  rows: readonly AggregateRow[],
  variant: Variant["name"],
): AggregateRow {
  const row = rows.find((candidate) => candidate.variant === variant);

  if (!row) {
    throw new Error(`Missing aggregate row: ${variant}`);
  }

  return row;
}

function hasOwnFetch(app: Gelis): boolean {
  return Object.prototype.hasOwnProperty.call(app, "fetch");
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

function coefficientOfVariation(values: number[]): number {
  const average = mean(values);

  if (average === 0) {
    return 0;
  }

  const variance =
    values.reduce((total, value) => {
      const difference = value - average;
      return total + difference * difference;
    }, 0) / values.length;

  return Math.sqrt(variance) / average;
}

function mean(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    const value = sorted[middle];

    if (value === undefined) {
      throw new Error("Cannot compute median of an empty sample set");
    }

    return value;
  }

  const left = sorted[middle - 1];
  const right = sorted[middle];

  if (left === undefined || right === undefined) {
    throw new Error("Cannot compute median of an empty sample set");
  }

  return (left + right) / 2;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatSigned(value: number): string {
  const rounded = round(value, 2);
  return `${rounded >= 0 ? "+" : ""}${rounded}`;
}

void sink;
