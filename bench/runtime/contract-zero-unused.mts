import assert from "node:assert/strict";

import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

import { Gelis, inspectContract } from "../../src/index";

const HERE = dirname(fileURLToPath(import.meta.url));

const CHILD = resolve(HERE, "contract-zero-unused.mts");

const SAMPLES = 24;

const TARGET_MS = 150;

const MIN_CALIBRATION_MS = 25;

const WARMUP_ITERATIONS = 20_000;

const REQUEST = new Request("http://gelis.test/bench");

const RAW_RESPONSE = new Response(
  null,

  {
    status: 204,
  },
);

const BENCHMARK_HANDLER = () => RAW_RESPONSE;

type WorkloadName = "plain" | "documented" | "hidden";

interface Sample {
  readonly order: readonly WorkloadName[];

  readonly plainNs: number;

  readonly documentedNs: number;

  readonly hiddenNs: number;

  readonly documentedDeltaNs: number;

  readonly documentedDeltaPercent: number;

  readonly hiddenDeltaNs: number;

  readonly hiddenDeltaPercent: number;
}

interface BenchmarkResult {
  readonly plainMedianNs: number;

  readonly documentedMedianNs: number;

  readonly hiddenMedianNs: number;

  readonly documentedMedianDeltaNs: number;

  readonly documentedMedianDeltaPercent: number;

  readonly hiddenMedianDeltaNs: number;

  readonly hiddenMedianDeltaPercent: number;

  readonly plainCv: number;

  readonly documentedCv: number;

  readonly hiddenCv: number;

  readonly documentedWins: number;

  readonly hiddenWins: number;
}

const ORDERS: readonly (readonly WorkloadName[])[] = [
  ["plain", "documented", "hidden"],

  ["plain", "hidden", "documented"],

  ["documented", "plain", "hidden"],

  ["documented", "hidden", "plain"],

  ["hidden", "plain", "documented"],

  ["hidden", "documented", "plain"],
];

let sink: Response | Promise<Response>;

if (process.argv.includes("--child")) {
  runChild();
} else {
  await runParent();
}

async function runParent(): Promise<void> {
  runCorrectnessGate();

  console.log("\nGelis contract-source zero-unused benchmark");

  console.log(`Runtime:     bun ${Bun.version}`);

  console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);

  console.log(`Samples:     ${SAMPLES}`);

  console.log("Comparison:  plain vs documented vs openapi:false");

  console.log(
    "Handler:     same function identity + same prebuilt raw Response",
  );

  console.log("Execution:   RUNTIME_ROUTE_PLAIN-equivalent workload");

  console.log("Ordering:    all 6 workload permutations");

  console.log("Isolation:   fresh child process\n");

  const child = Bun.spawn(
    [process.execPath, CHILD, "--child"],

    {
      cwd: resolve(HERE, "../.."),

      stdout: "pipe",

      stderr: "pipe",
    },
  );

  const stdoutPromise = new Response(child.stdout).text();

  const stderrPromise = new Response(child.stderr).text();

  const exitCode = await child.exited;

  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

  if (exitCode !== 0) {
    throw new Error(
      ["Contract zero-unused benchmark failed", stdout, stderr].join("\n"),
    );
  }

  const line = stdout
    .split(/\r?\n/)
    .find((value) => value.startsWith("RESULT "));

  if (line === undefined) {
    throw new Error(`Missing benchmark result\n${stdout}`);
  }

  const parsed: unknown = JSON.parse(line.slice("RESULT ".length));

  if (!isBenchmarkResult(parsed)) {
    throw new Error("Invalid benchmark result");
  }

  console.log("Results\n");

  console.table([
    {
      workload: "plain",

      "median ns/op": round(parsed.plainMedianNs, 2),

      "CV %": round(parsed.plainCv * 100, 2),
    },

    {
      workload: "documented",

      "median ns/op": round(parsed.documentedMedianNs, 2),

      "CV %": round(parsed.documentedCv * 100, 2),
    },

    {
      workload: "openapi:false",

      "median ns/op": round(parsed.hiddenMedianNs, 2),

      "CV %": round(parsed.hiddenCv * 100, 2),
    },
  ]);

  console.log("\nPaired deltas vs plain\n");

  console.table([
    {
      workload: "documented",

      "Δ ns": round(parsed.documentedMedianDeltaNs, 2),

      "Δ %": round(parsed.documentedMedianDeltaPercent, 2),

      wins: `${parsed.documentedWins}/${SAMPLES}`,
    },

    {
      workload: "openapi:false",

      "Δ ns": round(parsed.hiddenMedianDeltaNs, 2),

      "Δ %": round(parsed.hiddenMedianDeltaPercent, 2),

      wins: `${parsed.hiddenWins}/${SAMPLES}`,
    },
  ]);

  console.log("\nPositive delta means the metadata workload was slower.");

  console.log(
    "Acceptance is based on repeated paired results, variance, and absence of a stable directional regression.",
  );

  void sink;
}

function runCorrectnessGate(): void {
  const plain = createPlainApp();

  const documented = createDocumentedApp();

  const hidden = createHiddenApp();

  const plainResult = plain.fetch(REQUEST);

  const documentedResult = documented.fetch(REQUEST);

  const hiddenResult = hidden.fetch(REQUEST);

  assert.equal(plainResult, RAW_RESPONSE);

  assert.equal(documentedResult, RAW_RESPONSE);

  assert.equal(hiddenResult, RAW_RESPONSE);

  assert.ok(plainResult instanceof Response);

  assert.ok(documentedResult instanceof Response);

  assert.ok(hiddenResult instanceof Response);

  const plainContract = inspectContract(plain);

  const documentedContract = inspectContract(documented);

  const hiddenContract = inspectContract(hidden);

  assert.equal(plainContract.routes[0]?.openapi, undefined);

  assert.deepEqual(documentedContract.routes[0]?.openapi, {
    summary: "Benchmark route",

    tags: ["Benchmark"],
  });

  assert.equal(hiddenContract.routes[0]?.openapi, false);

  console.log("Correctness: PASS");
}

function runChild(): void {
  const plain = createPlainApp();

  const documented = createDocumentedApp();

  const hidden = createHiddenApp();

  const apps: Record<WorkloadName, Gelis> = {
    plain,
    documented,
    hidden,
  };

  warmup(apps.plain, WARMUP_ITERATIONS);

  warmup(apps.documented, WARMUP_ITERATIONS);

  warmup(apps.hidden, WARMUP_ITERATIONS);

  const iterations = calibrate(apps);

  const samples: Sample[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const order = ORDERS[sample % ORDERS.length]!;

    const elapsed: Partial<Record<WorkloadName, number>> = {};

    for (const workload of order) {
      elapsed[workload] = measure(apps[workload], iterations);
    }

    const plainNs = millisecondsToNsPerOp(elapsed.plain!, iterations);

    const documentedNs = millisecondsToNsPerOp(elapsed.documented!, iterations);

    const hiddenNs = millisecondsToNsPerOp(elapsed.hidden!, iterations);

    samples.push({
      order,

      plainNs,

      documentedNs,

      hiddenNs,

      documentedDeltaNs: documentedNs - plainNs,

      documentedDeltaPercent: (documentedNs / plainNs - 1) * 100,

      hiddenDeltaNs: hiddenNs - plainNs,

      hiddenDeltaPercent: (hiddenNs / plainNs - 1) * 100,
    });
  }

  const plainValues = samples.map((sample) => sample.plainNs);

  const documentedValues = samples.map((sample) => sample.documentedNs);

  const hiddenValues = samples.map((sample) => sample.hiddenNs);

  const documentedDeltaNs = samples.map((sample) => sample.documentedDeltaNs);

  const documentedDeltaPercent = samples.map(
    (sample) => sample.documentedDeltaPercent,
  );

  const hiddenDeltaNs = samples.map((sample) => sample.hiddenDeltaNs);

  const hiddenDeltaPercent = samples.map((sample) => sample.hiddenDeltaPercent);

  const result: BenchmarkResult = {
    plainMedianNs: median(plainValues),

    documentedMedianNs: median(documentedValues),

    hiddenMedianNs: median(hiddenValues),

    documentedMedianDeltaNs: median(documentedDeltaNs),

    documentedMedianDeltaPercent: median(documentedDeltaPercent),

    hiddenMedianDeltaNs: median(hiddenDeltaNs),

    hiddenMedianDeltaPercent: median(hiddenDeltaPercent),

    plainCv: coefficientOfVariation(plainValues),

    documentedCv: coefficientOfVariation(documentedValues),

    hiddenCv: coefficientOfVariation(hiddenValues),

    documentedWins: samples.filter(
      (sample) => sample.documentedNs < sample.plainNs,
    ).length,

    hiddenWins: samples.filter((sample) => sample.hiddenNs < sample.plainNs)
      .length,
  };

  console.log(`RESULT ${JSON.stringify(result)}`);

  void sink;
}

function createPlainApp(): Gelis {
  const app = new Gelis();

  app.get(
    "/bench",

    BENCHMARK_HANDLER,
  );

  return app;
}

function createDocumentedApp(): Gelis {
  const app = new Gelis();

  app.get(
    "/bench",

    {
      openapi: {
        summary: "Benchmark route",

        tags: ["Benchmark"],
      },
    },

    BENCHMARK_HANDLER,
  );

  return app;
}

function createHiddenApp(): Gelis {
  const app = new Gelis();

  app.get(
    "/bench",

    {
      openapi: false,
    },

    BENCHMARK_HANDLER,
  );

  return app;
}

function warmup(
  app: Gelis,

  iterations: number,
): void {
  for (let index = 0; index < iterations; index++) {
    sink = app.fetch(REQUEST);
  }
}

function calibrate(apps: Record<WorkloadName, Gelis>): number {
  let iterations = 1000;

  while (true) {
    let slowest = 0;

    for (const workload of ["plain", "documented", "hidden"] as const) {
      const elapsed = measure(apps[workload], iterations);

      slowest = Math.max(slowest, elapsed);
    }

    if (slowest >= MIN_CALIBRATION_MS) {
      return Math.max(
        1,

        Math.round((iterations * TARGET_MS) / Math.max(slowest, 0.001)),
      );
    }

    iterations *= 2;
  }
}

function measure(
  app: Gelis,

  iterations: number,
): number {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    sink = app.fetch(REQUEST);
  }

  return performance.now() - start;
}

function millisecondsToNsPerOp(
  elapsedMilliseconds: number,

  iterations: number,
): number {
  return (elapsedMilliseconds * 1_000_000) / iterations;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    const left = sorted[middle - 1];

    const right = sorted[middle];

    if (left === undefined || right === undefined) {
      throw new Error("Cannot compute median");
    }

    return (left + right) / 2;
  }

  const value = sorted[middle];

  if (value === undefined) {
    throw new Error("Cannot compute median");
  }

  return value;
}

function coefficientOfVariation(values: readonly number[]): number {
  const average =
    values.reduce((total, value) => total + value, 0) / values.length;

  if (average === 0) {
    return 0;
  }

  const variance =
    values.reduce((total, value) => {
      const delta = value - average;

      return total + delta * delta;
    }, 0) / values.length;

  return Math.sqrt(variance) / average;
}

function isBenchmarkResult(value: unknown): value is BenchmarkResult {
  return (
    value !== null &&
    typeof value === "object" &&
    "plainMedianNs" in value &&
    typeof value.plainMedianNs === "number" &&
    "documentedMedianNs" in value &&
    typeof value.documentedMedianNs === "number" &&
    "hiddenMedianNs" in value &&
    typeof value.hiddenMedianNs === "number" &&
    "documentedMedianDeltaPercent" in value &&
    typeof value.documentedMedianDeltaPercent === "number" &&
    "hiddenMedianDeltaPercent" in value &&
    typeof value.hiddenMedianDeltaPercent === "number"
  );
}

function round(
  value: number,

  digits: number,
): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}
