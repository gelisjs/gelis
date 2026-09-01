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

const BEFORE_SYNC = {
  beforeHandle: () => undefined,
};

const AFTER_SYNC = {
  afterHandle: () => undefined,
};

const BEFORE_AFTER_SYNC = {
  beforeHandle: () => undefined,

  afterHandle: () => undefined,
};

const BEFORE_ASYNC = {
  beforeHandle: () => Promise.resolve(undefined),
};

const AFTER_ASYNC = {
  afterHandle: () => Promise.resolve(undefined),
};

const EARLY_RETURN = {
  beforeHandle: () => EARLY_RESPONSE,
};

const VALIDATION_OPTIONS = {
  query: querySyncSchema,
};

const VALIDATION_BEFORE = {
  beforeHandle: () => undefined,
};

const benchmarkCases = [
  {
    name: "plain-sync",

    mode: "sync",

    requestUrl: `http://gelis.test/r/${TARGET_INDEX}`,
  },

  {
    name: "before-sync",

    mode: "sync",

    requestUrl: `http://gelis.test/r/${TARGET_INDEX}`,
  },

  {
    name: "after-sync",

    mode: "sync",

    requestUrl: `http://gelis.test/r/${TARGET_INDEX}`,
  },

  {
    name: "before-after-sync",

    mode: "sync",

    requestUrl: `http://gelis.test/r/${TARGET_INDEX}`,
  },

  {
    name: "early-return",

    mode: "sync",

    requestUrl: `http://gelis.test/r/${TARGET_INDEX}`,
  },

  {
    name: "validation-only",

    mode: "sync",

    requestUrl: `http://gelis.test/r/${TARGET_INDEX}?page=42&q=gelis`,
  },

  {
    name: "validation-before",

    mode: "sync",

    requestUrl: `http://gelis.test/r/${TARGET_INDEX}?page=42&q=gelis`,
  },

  {
    name: "plain-async-handler",

    mode: "async",

    requestUrl: `http://gelis.test/r/${TARGET_INDEX}`,
  },

  {
    name: "before-async",

    mode: "async",

    requestUrl: `http://gelis.test/r/${TARGET_INDEX}`,
  },

  {
    name: "after-async",

    mode: "async",

    requestUrl: `http://gelis.test/r/${TARGET_INDEX}`,
  },
];

mkdirSync(RESULTS_DIR, {
  recursive: true,
});

const rows = [];

let sink;

for (const benchmarkCase of benchmarkCases) {
  const app = buildApp(benchmarkCase.name);

  const request = new Request(benchmarkCase.requestUrl);

  if (benchmarkCase.mode === "sync") {
    rows.push(benchmarkSyncCase(benchmarkCase.name, app, request));

    continue;
  }

  rows.push(await benchmarkAsyncCase(benchmarkCase.name, app, request));
}

const enrichedRows = addOverhead(rows);

const metadata = {
  generatedAt: new Date().toISOString(),

  runtime: `bun ${Bun.version}`,

  platform: process.platform,

  arch: process.arch,

  cpu: cpus()[0]?.model ?? "unknown",

  logicalCpus: cpus().length,

  routes: ROUTES,

  samples: SAMPLES,

  targetMilliseconds: TARGET_MS,
};

console.log("\nGelis lifecycle runtime benchmark");

console.log(`Runtime:     ${metadata.runtime}`);

console.log(`CPU:         ${metadata.cpu}`);

console.log(`Routes:      ${ROUTES}`);

console.log(`Samples:     ${SAMPLES}\n`);

console.table(
  enrichedRows.map((row) => ({
    scenario: row.scenario,

    mode: row.mode,

    "ns/op": Math.round(row.nsPerOp),

    "ops/s": Math.round(row.opsPerSecond).toLocaleString("en-US"),

    baseline: row.baseline ?? "-",

    "overhead ns": row.overheadNs === null ? "-" : Math.round(row.overheadNs),

    "overhead %":
      row.overheadPercent === null ? "-" : round(row.overheadPercent, 2),
  })),
);

writeFileSync(
  resolve(RESULTS_DIR, "latest-lifecycle.json"),

  `${JSON.stringify(
    {
      metadata,

      benchmarks: enrichedRows,
    },
    null,
    2,
  )}\n`,
);

console.log("\nRaw results: " + "bench/runtime/results/latest-lifecycle.json");

function buildApp(scenario) {
  const app = new Gelis();

  for (let index = 0; index < ROUTES; index++) {
    const path = `/r/${index}`;

    switch (scenario) {
      case "plain-sync": {
        app.get(
          path,

          () => OK_RESPONSE,
        );

        break;
      }

      case "before-sync": {
        app.get(
          path,

          () => OK_RESPONSE,

          BEFORE_SYNC,
        );

        break;
      }

      case "after-sync": {
        app.get(
          path,

          () => OK_RESPONSE,

          AFTER_SYNC,
        );

        break;
      }

      case "before-after-sync": {
        app.get(
          path,

          () => OK_RESPONSE,

          BEFORE_AFTER_SYNC,
        );

        break;
      }

      case "early-return": {
        app.get(
          path,

          () => {
            throw new Error("early-return handler must not execute");
          },

          EARLY_RETURN,
        );

        break;
      }

      case "validation-only": {
        app.get(
          path,

          VALIDATION_OPTIONS,

          () => OK_RESPONSE,
        );

        break;
      }

      case "validation-before": {
        app.get(
          path,

          VALIDATION_OPTIONS,

          () => OK_RESPONSE,

          VALIDATION_BEFORE,
        );

        break;
      }

      case "plain-async-handler": {
        app.get(
          path,

          () => Promise.resolve(OK_RESPONSE),
        );

        break;
      }

      case "before-async": {
        app.get(
          path,

          () => OK_RESPONSE,

          BEFORE_ASYNC,
        );

        break;
      }

      case "after-async": {
        app.get(
          path,

          () => OK_RESPONSE,

          AFTER_ASYNC,
        );

        break;
      }

      default:
        throw new Error(`Unknown lifecycle runtime scenario: ${scenario}`);
    }
  }

  return app;
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

function addOverhead(rows) {
  const byScenario = new Map(rows.map((row) => [row.scenario, row]));

  const baselines = {
    "plain-sync": null,

    "before-sync": "plain-sync",

    "after-sync": "plain-sync",

    "before-after-sync": "plain-sync",

    "early-return": null,

    "validation-only": null,

    "validation-before": "validation-only",

    "plain-async-handler": null,

    "before-async": "plain-async-handler",

    "after-async": "plain-async-handler",
  };

  return rows.map((row) => {
    const baseline = baselines[row.scenario];

    if (!baseline) {
      return {
        ...row,

        baseline: null,

        overheadNs: null,

        overheadPercent: null,
      };
    }

    const baselineRow = byScenario.get(baseline);

    if (!baselineRow) {
      throw new Error(`Missing lifecycle baseline: ${baseline}`);
    }

    const overheadNs = row.nsPerOp - baselineRow.nsPerOp;

    const overheadPercent = (row.nsPerOp / baselineRow.nsPerOp - 1) * 100;

    return {
      ...row,

      baseline,

      overheadNs,

      overheadPercent,
    };
  });
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
