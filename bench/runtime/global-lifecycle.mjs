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

const LOCAL_BEFORE = {
  beforeHandle: () => undefined,
};

const LOCAL_AFTER = {
  afterHandle: () => undefined,
};

const SYNC_BEFORE = () => undefined;

const SYNC_AFTER = () => undefined;

const ASYNC_BEFORE = () => Promise.resolve(undefined);

const ASYNC_AFTER = () => Promise.resolve(undefined);

const VALIDATION_OPTIONS = {
  query: querySyncSchema,
};

const benchmarkCases = [
  {
    name: "plain-sync",
    mode: "sync",
    query: false,
  },

  /*
   * Local references.
   *
   * These let us compare the global compiler
   * against the already-accepted local path
   * in the exact same benchmark process.
   */
  {
    name: "local-before-sync",
    mode: "sync",
    query: false,
  },

  {
    name: "local-after-sync",
    mode: "sync",
    query: false,
  },

  /*
   * One global hook should compile to a direct
   * function reference rather than a loop.
   */
  {
    name: "global-before-sync",
    mode: "sync",
    query: false,
  },

  {
    name: "global-after-sync",
    mode: "sync",
    query: false,
  },

  {
    name: "global-before-after-sync",
    mode: "sync",
    query: false,
  },

  /*
   * Global + local produces the specialized
   * two-hook executor.
   */
  {
    name: "global-local-before-sync",
    mode: "sync",
    query: false,
  },

  {
    name: "global-local-after-sync",
    mode: "sync",
    query: false,
  },

  /*
   * Explicitly exercise 2-hook specialization
   * and 3+ generic plan.
   */
  {
    name: "two-global-before-sync",
    mode: "sync",
    query: false,
  },

  {
    name: "three-global-before-sync",
    mode: "sync",
    query: false,
  },

  {
    name: "two-global-after-sync",
    mode: "sync",
    query: false,
  },

  {
    name: "three-global-after-sync",
    mode: "sync",
    query: false,
  },

  /*
   * Registration order must not affect the
   * request-time plan.
   */
  {
    name: "late-global-before-sync",
    mode: "sync",
    query: false,
  },

  {
    name: "late-global-after-sync",
    mode: "sync",
    query: false,
  },

  {
    name: "validation-only",
    mode: "sync",
    query: true,
  },

  {
    name: "validation-global-before",
    mode: "sync",
    query: true,
  },

  /*
   * Promise-aware global paths.
   */
  {
    name: "plain-async-handler",
    mode: "async",
    query: false,
  },

  {
    name: "global-before-async",
    mode: "async",
    query: false,
  },

  {
    name: "global-after-async",
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
          throw new Error(`Unknown global lifecycle benchmark case: ${name}`);
        }

        return benchmarkCase;
      });

const selectedCaseNames = selectedCases.map(
  (benchmarkCase) => benchmarkCase.name,
);

const resultFileName =
  requestedCases.length === 0
    ? "latest-global-lifecycle.json"
    : `latest-global-lifecycle-${selectedCaseNames.join("-")}.json`;

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

const configurationRows =
  requestedCases.length === 0 ? benchmarkConfiguration() : [];

const comparisons = createComparisons(runtimeRows);

const metadata = {
  generatedAt: new Date().toISOString(),

  runtime: `bun ${Bun.version}`,

  cpu: cpus()[0]?.model ?? "unknown",

  logicalCpus: cpus().length,

  routes: ROUTES,

  samples: SAMPLES,

  targetMilliseconds: TARGET_MS,
};

console.log("\nGelis global lifecycle runtime benchmark");

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

console.log("\nConfiguration-time lifecycle compilation\n");

console.table(
  configurationRows.map((row) => ({
    scenario: row.scenario,

    routes: row.routes,

    "median ms": round(row.milliseconds, 3),

    "ns/route": Math.round(row.nanosecondsPerRoute),
  })),
);

writeFileSync(
  resolve(RESULTS_DIR, resultFileName),

  `${JSON.stringify(
    {
      metadata,

      runtime: runtimeRows,

      comparisons,

      configuration: configurationRows,
    },
    null,
    2,
  )}\n`,
);

console.log(`\nRaw results: bench/runtime/results/${resultFileName}`);

function buildApp(scenario) {
  const app = new Gelis();

  configureEarlyGlobals(app, scenario);

  for (let index = 0; index < ROUTES; index++) {
    const path = `/r/${index}`;

    if (
      scenario === "validation-only" ||
      scenario === "validation-global-before"
    ) {
      app.get(
        path,

        VALIDATION_OPTIONS,

        () => OK_RESPONSE,
      );

      continue;
    }

    if (scenario === "local-before-sync") {
      app.get(
        path,

        () => OK_RESPONSE,

        LOCAL_BEFORE,
      );

      continue;
    }

    if (scenario === "local-after-sync") {
      app.get(
        path,

        () => OK_RESPONSE,

        LOCAL_AFTER,
      );

      continue;
    }

    if (scenario === "global-local-before-sync") {
      app.get(
        path,

        () => OK_RESPONSE,

        LOCAL_BEFORE,
      );

      continue;
    }

    if (scenario === "global-local-after-sync") {
      app.get(
        path,

        () => OK_RESPONSE,

        LOCAL_AFTER,
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

    app.get(
      path,

      () => OK_RESPONSE,
    );
  }

  configureLateGlobals(app, scenario);

  return app;
}

function configureEarlyGlobals(app, scenario) {
  switch (scenario) {
    case "global-before-sync":
    case "global-local-before-sync":
    case "validation-global-before":
      app.onBeforeHandle(SYNC_BEFORE);

      return;

    case "global-after-sync":
    case "global-local-after-sync":
      app.onAfterHandle(SYNC_AFTER);

      return;

    case "global-before-after-sync":
      app.onBeforeHandle(SYNC_BEFORE).onAfterHandle(SYNC_AFTER);

      return;

    case "two-global-before-sync":
      app.onBeforeHandle(SYNC_BEFORE).onBeforeHandle(SYNC_BEFORE);

      return;

    case "three-global-before-sync":
      app
        .onBeforeHandle(SYNC_BEFORE)
        .onBeforeHandle(SYNC_BEFORE)
        .onBeforeHandle(SYNC_BEFORE);

      return;

    case "two-global-after-sync":
      app.onAfterHandle(SYNC_AFTER).onAfterHandle(SYNC_AFTER);

      return;

    case "three-global-after-sync":
      app
        .onAfterHandle(SYNC_AFTER)
        .onAfterHandle(SYNC_AFTER)
        .onAfterHandle(SYNC_AFTER);

      return;

    case "global-before-async":
      app.onBeforeHandle(ASYNC_BEFORE);

      return;

    case "global-after-async":
      app.onAfterHandle(ASYNC_AFTER);

      return;
  }
}

function configureLateGlobals(app, scenario) {
  if (scenario === "late-global-before-sync") {
    app.onBeforeHandle(SYNC_BEFORE);

    return;
  }

  if (scenario === "late-global-after-sync") {
    app.onAfterHandle(SYNC_AFTER);
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

function benchmarkConfiguration() {
  return [
    measureLateCompile("late-first-global-before", "before", 0),

    measureLateCompile("late-second-global-before", "before", 1),

    measureLateCompile("late-third-global-before", "before", 2),

    measureLateCompile("late-first-global-after", "after", 0),

    measureLateCompile("late-second-global-after", "after", 1),

    measureLateCompile("late-third-global-after", "after", 2),
  ];
}

function measureLateCompile(scenario, phase, existingHooks) {
  /*
   * Warm the JIT on a smaller app first.
   */
  {
    const warm = buildConfigurationApp(100, phase, existingHooks);

    registerGlobalHook(warm, phase);
  }

  const samples = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const app = buildConfigurationApp(ROUTES, phase, existingHooks);

    const start = performance.now();

    registerGlobalHook(app, phase);

    samples.push(performance.now() - start);
  }

  const milliseconds = median(samples);

  return {
    scenario,

    routes: ROUTES,

    milliseconds,

    nanosecondsPerRoute: (milliseconds * 1_000_000) / ROUTES,
  };
}

function buildConfigurationApp(routes, phase, existingHooks) {
  const app = new Gelis();

  for (let index = 0; index < existingHooks; index++) {
    registerGlobalHook(app, phase);
  }

  for (let index = 0; index < routes; index++) {
    app.get(
      `/config/${index}`,

      () => OK_RESPONSE,
    );
  }

  return app;
}

function registerGlobalHook(app, phase) {
  if (phase === "before") {
    app.onBeforeHandle(SYNC_BEFORE);

    return;
  }

  app.onAfterHandle(SYNC_AFTER);
}

function createComparisons(rows) {
  const byScenario = new Map(rows.map((row) => [row.scenario, row]));

  const pairs = [
    ["global-before-sync", "local-before-sync"],

    ["global-after-sync", "local-after-sync"],

    ["late-global-before-sync", "global-before-sync"],

    ["late-global-after-sync", "global-after-sync"],

    ["global-local-before-sync", "local-before-sync"],

    ["global-local-after-sync", "local-after-sync"],

    ["two-global-before-sync", "global-before-sync"],

    ["three-global-before-sync", "global-before-sync"],

    ["two-global-after-sync", "global-after-sync"],

    ["three-global-after-sync", "global-after-sync"],

    ["validation-global-before", "validation-only"],

    ["global-before-async", "plain-async-handler"],

    ["global-after-async", "plain-async-handler"],
  ];

  const comparisons = [];

  for (const [scenarioName, referenceName] of pairs) {
    const scenario = byScenario.get(scenarioName);

    const reference = byScenario.get(referenceName);

    /*
     * Filtered benchmarks intentionally
     * contain only a subset of scenarios.
     */
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

void sink;

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
