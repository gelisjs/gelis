import { mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Gelis } from "../../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = resolve(HERE, "results");

const ROUTES = 5000;
const SAMPLES = 9;
const TARGET_MS = 120;
const MIN_CALIBRATION_MS = 20;
const SYNC_WARMUP_ITERATIONS = 20_000;
const ASYNC_WARMUP_ITERATIONS = 5_000;
const TARGET_INDEX = ROUTES - 1;

const OK_RESPONSE = new Response("ok");

const ERROR_RESPONSE = new Response("handled", {
  status: 500,
});

const HANDLER_ERROR = new Error("benchmark handler error");
const REQUEST_ERROR = new Error("benchmark onRequest error");

const HANDLE_ERROR = () => ERROR_RESPONSE;
const UNHANDLED_ERROR = () => undefined;
const ASYNC_HANDLE_ERROR = () => Promise.resolve(ERROR_RESPONSE);

const THROW_ON_REQUEST = () => {
  throw REQUEST_ERROR;
};

const CIRCULAR_RESULT: Record<string, unknown> = {};
CIRCULAR_RESULT.self = CIRCULAR_RESULT;

const benchmarkCases = [
  {
    name: "plain-sync",
    mode: "sync",
  },
  {
    name: "on-error-unused-sync",
    mode: "sync",
  },
  {
    name: "two-on-error-unused-sync",
    mode: "sync",
  },
  {
    name: "three-on-error-unused-sync",
    mode: "sync",
  },
  {
    name: "handler-error-handled-sync",
    mode: "sync",
  },
  {
    name: "handler-error-unhandled-sync",
    mode: "sync-throw",
  },
  {
    name: "handler-error-async-on-error",
    mode: "async",
  },
  {
    name: "plain-async-handler",
    mode: "async",
  },
  {
    name: "on-error-unused-async-handler",
    mode: "async",
  },
  {
    name: "async-handler-error-handled",
    mode: "async",
  },
  {
    name: "on-request-error-handled",
    mode: "sync",
  },
  {
    name: "normalization-error-handled",
    mode: "sync",
  },
] as const;

type OnErrorCase = (typeof benchmarkCases)[number];

type OnErrorCaseName = OnErrorCase["name"];

const requestedCases = readListArgument("--cases");

const selectedCases =
  requestedCases.length === 0
    ? benchmarkCases
    : requestedCases.map((name) => {
        const benchmarkCase = benchmarkCases.find(
          (candidate) => candidate.name === name,
        );

        if (!benchmarkCase) {
          throw new Error(`Unknown onError benchmark case: ${name}`);
        }

        return benchmarkCase;
      });

const selectedCaseNames = selectedCases.map(
  (benchmarkCase) => benchmarkCase.name,
);

const resultFileName =
  requestedCases.length === 0
    ? "latest-on-error.json"
    : `latest-on-error-${selectedCaseNames.join("-")}.json`;

mkdirSync(RESULTS_DIR, {
  recursive: true,
});

console.log(`Selected cases: ${selectedCaseNames.join(", ")}`);

console.log(
  requestedCases.length === 0
    ? "Benchmark mode: full"
    : "Benchmark mode: filtered",
);

console.log("");

let sink: unknown;

const runtimeRows: RuntimeResultRow[] = [];

for (const benchmarkCase of selectedCases) {
  const app = buildApp(benchmarkCase.name);

  const request = new Request(`http://gelis.test/r/${TARGET_INDEX}`);

  switch (benchmarkCase.mode) {
    case "sync":
      runtimeRows.push(benchmarkSyncCase(benchmarkCase.name, app, request));
      break;

    case "sync-throw":
      runtimeRows.push(
        benchmarkSyncThrowCase(benchmarkCase.name, app, request),
      );
      break;

    case "async":
      runtimeRows.push(
        await benchmarkAsyncCase(benchmarkCase.name, app, request),
      );
      break;

    default:
      throw new Error("Unknown benchmark mode");
  }
}

const comparisons = createComparisons(runtimeRows);

const metadata = {
  generatedAt: new Date().toISOString(),
  runtime: `bun ${Bun.version}`,
  cpu: cpus()[0]?.model ?? "unknown",
  logicalCpus: cpus().length,
  routes: ROUTES,
  samples: SAMPLES,
  targetMilliseconds: TARGET_MS,
  cases: selectedCaseNames,
};

console.log("\nGelis onError runtime benchmark");
console.log(`Runtime:     ${metadata.runtime}`);
console.log(`CPU:         ${metadata.cpu}`);
console.log(`Routes:      ${ROUTES}`);
console.log(`Samples:     ${SAMPLES}\n`);

console.log("Runtime\n");

console.table(
  runtimeRows.map((row) => ({
    scenario: row.scenario,
    mode: row.mode,
    "ns/op": Math.round(row.nsPerOp),
    "ops/s": Math.round(row.opsPerSecond).toLocaleString("en-US"),
  })),
);

console.log("\nPlan comparisons\n");

console.table(
  comparisons.map((comparison) => ({
    scenario: comparison.scenario,
    reference: comparison.reference,
    "scenario ns": Math.round(comparison.scenarioNs),
    "reference ns": Math.round(comparison.referenceNs),
    "delta ns": Math.round(comparison.deltaNs),
    "delta %": round(comparison.deltaPercent, 2),
  })),
);

writeFileSync(
  resolve(RESULTS_DIR, resultFileName),
  `${JSON.stringify(
    {
      metadata,
      runtime: runtimeRows,
      comparisons,
    },
    null,
    2,
  )}\n`,
);

console.log(`\nRaw results: bench/runtime/results/${resultFileName}`);

function buildApp(scenario: OnErrorCaseName): Gelis {
  const app = new Gelis();

  configureApplicationHooks(app, scenario);

  for (let index = 0; index < ROUTES; index++) {
    const path = `/r/${index}`;

    switch (scenario) {
      case "handler-error-handled-sync":
      case "handler-error-unhandled-sync":
      case "handler-error-async-on-error":
        app.get(path, () => {
          throw HANDLER_ERROR;
        });
        continue;

      case "plain-async-handler":
      case "on-error-unused-async-handler":
        app.get(path, () => Promise.resolve(OK_RESPONSE));
        continue;

      case "async-handler-error-handled":
        app.get(path, () => Promise.reject(HANDLER_ERROR));
        continue;

      case "normalization-error-handled":
        app.get(path, () => CIRCULAR_RESULT);
        continue;
    }

    app.get(path, () => OK_RESPONSE);
  }

  return app;
}

function configureApplicationHooks(
  app: Gelis,
  scenario: OnErrorCaseName,
): void {
  switch (scenario) {
    case "on-error-unused-sync":
    case "on-error-unused-async-handler":
    case "handler-error-handled-sync":
    case "async-handler-error-handled":
    case "normalization-error-handled":
      app.onError(HANDLE_ERROR);
      return;

    case "two-on-error-unused-sync":
      app.onError(HANDLE_ERROR).onError(HANDLE_ERROR);
      return;

    case "three-on-error-unused-sync":
      app.onError(HANDLE_ERROR).onError(HANDLE_ERROR).onError(HANDLE_ERROR);
      return;

    case "handler-error-unhandled-sync":
      app.onError(UNHANDLED_ERROR);
      return;

    case "handler-error-async-on-error":
      app.onError(ASYNC_HANDLE_ERROR);
      return;

    case "on-request-error-handled":
      /*
       * Register onError first intentionally.
       *
       * Runtime composition must still compile to:
       *
       * onError
       * -> onRequest
       * -> routed fetch
       */
      app.onError(HANDLE_ERROR).onRequest(THROW_ON_REQUEST);
      return;
  }
}

function benchmarkSyncCase(
  scenario: string,
  app: Gelis,
  request: Request,
): RuntimeResultRow {
  const operation = () => {
    const result = app.fetch(request);

    if (isPromiseLike(result)) {
      throw new Error(`${scenario} unexpectedly became asynchronous`);
    }

    sink = result;
  };

  for (let index = 0; index < SYNC_WARMUP_ITERATIONS; index++) {
    operation();
  }

  const iterations = calibrateSync(operation);

  const samples: number[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const elapsed = measureSync(operation, iterations);

    samples.push((elapsed * 1_000_000) / iterations);
  }

  const nsPerOp = median(samples);

  return {
    scenario,
    mode: "sync",
    iterations,
    nsPerOp,
    opsPerSecond: 1_000_000_000 / nsPerOp,
    samples,
  };
}

function benchmarkSyncThrowCase(
  scenario: string,
  app: Gelis,
  request: Request,
): RuntimeResultRow {
  const operation = () => {
    try {
      app.fetch(request);
    } catch (error) {
      sink = error;
      return;
    }

    throw new Error(`${scenario} unexpectedly completed without throwing`);
  };

  for (let index = 0; index < SYNC_WARMUP_ITERATIONS; index++) {
    operation();
  }

  const iterations = calibrateSync(operation);

  const samples: number[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const elapsed = measureSync(operation, iterations);

    samples.push((elapsed * 1_000_000) / iterations);
  }

  const nsPerOp = median(samples);

  return {
    scenario,
    mode: "sync-throw",
    iterations,
    nsPerOp,
    opsPerSecond: 1_000_000_000 / nsPerOp,
    samples,
  };
}

async function benchmarkAsyncCase(
  scenario: string,
  app: Gelis,
  request: Request,
): Promise<RuntimeResultRow> {
  const operation = async () => {
    sink = await app.fetch(request);
  };

  for (let index = 0; index < ASYNC_WARMUP_ITERATIONS; index++) {
    await operation();
  }

  const iterations = await calibrateAsync(operation);

  const samples: number[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const elapsed = await measureAsync(operation, iterations);

    samples.push((elapsed * 1_000_000) / iterations);
  }

  const nsPerOp = median(samples);

  return {
    scenario,
    mode: "async",
    iterations,
    nsPerOp,
    opsPerSecond: 1_000_000_000 / nsPerOp,
    samples,
  };
}

function createComparisons(rows: RuntimeResultRow[]): RuntimeComparisonRow[] {
  const byScenario = new Map(rows.map((row) => [row.scenario, row]));

  const pairs: Array<readonly [string, string]> = [
    ["on-error-unused-sync", "plain-sync"],
    ["two-on-error-unused-sync", "on-error-unused-sync"],
    ["three-on-error-unused-sync", "two-on-error-unused-sync"],
    ["handler-error-async-on-error", "handler-error-handled-sync"],
    ["on-error-unused-async-handler", "plain-async-handler"],
  ];

  const comparisons: RuntimeComparisonRow[] = [];

  for (const [scenarioName, referenceName] of pairs) {
    const scenario = byScenario.get(scenarioName);

    const reference = byScenario.get(referenceName);

    if (!scenario || !reference) {
      continue;
    }

    const deltaNs = scenario.nsPerOp - reference.nsPerOp;

    comparisons.push({
      scenario: scenarioName,
      reference: referenceName,
      scenarioNs: scenario.nsPerOp,
      referenceNs: reference.nsPerOp,
      deltaNs,
      deltaPercent: (scenario.nsPerOp / reference.nsPerOp - 1) * 100,
    });
  }

  return comparisons;
}

function calibrateSync(operation: SyncOperation): number {
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

async function calibrateAsync(operation: AsyncOperation): Promise<number> {
  let iterations = 100;

  while (true) {
    const elapsed = await measureAsync(operation, iterations);

    if (elapsed >= MIN_CALIBRATION_MS) {
      return Math.max(
        1,
        Math.round((iterations * TARGET_MS) / Math.max(elapsed, 0.001)),
      );
    }

    iterations *= 2;
  }
}

function measureSync(operation: SyncOperation, iterations: number): number {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    operation();
  }

  return performance.now() - start;
}

async function measureAsync(
  operation: AsyncOperation,
  iterations: number,
): Promise<number> {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    await operation();
  }

  return performance.now() - start;
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

function readListArgument(name: string): string[] {
  const prefix = `${name}=`;

  const argument = process.argv.find((value) => value.startsWith(prefix));

  if (!argument) {
    return [];
  }

  return argument
    .slice(prefix.length)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

void sink;
