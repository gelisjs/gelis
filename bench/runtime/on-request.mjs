import { mkdirSync, writeFileSync } from "node:fs";

import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

import { Gelis } from "../../src/index.ts";

import { querySyncSchema } from "../http/validation/schemas.ts";

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

const EARLY_RESPONSE = new Response("early");

const SYNC_REQUEST = () => undefined;

const ASYNC_REQUEST = () => Promise.resolve(undefined);

const SYNC_EARLY_REQUEST = () => EARLY_RESPONSE;

const ASYNC_EARLY_REQUEST = () => Promise.resolve(EARLY_RESPONSE);

const VALIDATION_OPTIONS = {
  query: querySyncSchema,
};

const benchmarkCases = [
  {
    name: "plain-sync",

    mode: "sync",

    query: false,
  },

  {
    name: "on-request-sync",

    mode: "sync",

    query: false,
  },

  {
    name: "two-on-request-sync",

    mode: "sync",

    query: false,
  },

  {
    name: "three-on-request-sync",

    mode: "sync",

    query: false,
  },

  {
    name: "late-on-request-sync",

    mode: "sync",

    query: false,
  },

  {
    name: "early-return",

    mode: "sync",

    query: false,
  },

  {
    name: "validation-only",

    mode: "sync",

    query: true,
  },

  {
    name: "validation-on-request",

    mode: "sync",

    query: true,
  },

  {
    name: "plain-async-handler",

    mode: "async",

    query: false,
  },

  {
    name: "on-request-async",

    mode: "async",

    query: false,
  },

  {
    name: "async-early-return",

    mode: "async",

    query: false,
  },
];

const requestedCases = readListArgument("--cases");

const selectedCases =
  requestedCases.length === 0
    ? benchmarkCases
    : requestedCases.map((name) => {
        const benchmarkCase = benchmarkCases.find(
          (candidate) => candidate.name === name,
        );

        if (!benchmarkCase) {
          throw new Error(`Unknown onRequest benchmark case: ${name}`);
        }

        return benchmarkCase;
      });

const selectedCaseNames = selectedCases.map(
  (benchmarkCase) => benchmarkCase.name,
);

const resultFileName =
  requestedCases.length === 0
    ? "latest-on-request.json"
    : `latest-on-request-${selectedCaseNames.join("-")}.json`;

mkdirSync(
  RESULTS_DIR,

  {
    recursive: true,
  },
);

console.log(`Selected cases: ${selectedCaseNames.join(", ")}`);

console.log(
  requestedCases.length === 0
    ? "Benchmark mode: full"
    : "Benchmark mode: filtered",
);

console.log("");

let sink;

const runtimeRows = [];

for (const benchmarkCase of selectedCases) {
  const app = buildApp(benchmarkCase.name);

  const query = benchmarkCase.query ? "?page=42&q=gelis" : "";

  const request = new Request(`http://gelis.test/r/${TARGET_INDEX}${query}`);

  if (benchmarkCase.mode === "sync") {
    runtimeRows.push(benchmarkSyncCase(benchmarkCase.name, app, request));

    continue;
  }

  runtimeRows.push(await benchmarkAsyncCase(benchmarkCase.name, app, request));
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

console.log("\nGelis onRequest runtime benchmark");

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

function buildApp(scenario) {
  const app = new Gelis();

  configureEarlyOnRequest(app, scenario);

  for (let index = 0; index < ROUTES; index++) {
    const path = `/r/${index}`;

    if (
      scenario === "validation-only" ||
      scenario === "validation-on-request"
    ) {
      app.get(
        path,

        VALIDATION_OPTIONS,

        () => OK_RESPONSE,
      );

      continue;
    }

    if (scenario === "plain-async-handler") {
      app.get(
        path,

        () => Promise.resolve(OK_RESPONSE),
      );

      continue;
    }

    if (scenario === "early-return" || scenario === "async-early-return") {
      app.get(
        path,

        () => {
          throw new Error(`${scenario} handler must not run`);
        },
      );

      continue;
    }

    app.get(
      path,

      () => OK_RESPONSE,
    );
  }

  if (scenario === "late-on-request-sync") {
    app.onRequest(SYNC_REQUEST);
  }

  return app;
}

function configureEarlyOnRequest(app, scenario) {
  switch (scenario) {
    case "on-request-sync":
    case "validation-on-request":
      app.onRequest(SYNC_REQUEST);

      return;

    case "two-on-request-sync":
      app.onRequest(SYNC_REQUEST).onRequest(SYNC_REQUEST);

      return;

    case "three-on-request-sync":
      app
        .onRequest(SYNC_REQUEST)
        .onRequest(SYNC_REQUEST)
        .onRequest(SYNC_REQUEST);

      return;

    case "early-return":
      app.onRequest(SYNC_EARLY_REQUEST);

      return;

    case "on-request-async":
      app.onRequest(ASYNC_REQUEST);

      return;

    case "async-early-return":
      app.onRequest(ASYNC_EARLY_REQUEST);

      return;
  }
}

function benchmarkSyncCase(scenario, app, request) {
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

  const samples = [];

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

async function benchmarkAsyncCase(scenario, app, request) {
  const operation = async () => {
    sink = await app.fetch(request);
  };

  for (let index = 0; index < ASYNC_WARMUP_ITERATIONS; index++) {
    await operation();
  }

  const iterations = await calibrateAsync(operation);

  const samples = [];

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

function createComparisons(rows) {
  const byScenario = new Map(rows.map((row) => [row.scenario, row]));

  const pairs = [
    ["on-request-sync", "plain-sync"],

    ["two-on-request-sync", "on-request-sync"],

    ["three-on-request-sync", "two-on-request-sync"],

    ["late-on-request-sync", "on-request-sync"],

    ["validation-on-request", "validation-only"],

    ["on-request-async", "plain-async-handler"],

    ["async-early-return", "on-request-async"],
  ];

  const comparisons = [];

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

function calibrateSync(operation) {
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

async function calibrateAsync(operation) {
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

function measureSync(operation, iterations) {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    operation();
  }

  return performance.now() - start;
}

async function measureAsync(operation, iterations) {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    await operation();
  }

  return performance.now() - start;
}

function isPromiseLike(value) {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return false;
  }

  return typeof value.then === "function";
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function round(value, digits) {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function readListArgument(name) {
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
