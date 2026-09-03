import assert from "node:assert/strict";

import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

import { Gelis, inspectContract } from "../../src/index";

import type {
  ApplicationContractSnapshot,
  OpenAPIRouteMetadata,
  ResponseContractMap,
  StandardSchemaV1,
} from "../../src/index";

const HERE = dirname(fileURLToPath(import.meta.url));

const CHILD = resolve(HERE, "contract-inspection.mts");

const SIZES = [100, 1_000, 5_000] as const;

const WORKLOADS = ["plain", "shared-contract", "metadata-rich"] as const;

type Workload = (typeof WORKLOADS)[number];

const SAMPLES = 15;

const TARGET_MS = 100;

const MIN_CALIBRATION_MS = 20;

const WARMUP_ITERATIONS = 20;

const RAW_RESPONSE = new Response(
  null,

  {
    status: 204,
  },
);

const BENCHMARK_HANDLER = () => RAW_RESPONSE;

interface BenchmarkResult {
  readonly workload: Workload;

  readonly routes: number;

  readonly iterations: number;

  readonly medianMs: number;

  readonly medianUsPerRoute: number;

  readonly routesPerSecond: number;

  readonly cv: number;
}

let sink: ApplicationContractSnapshot;

const childWorkload = readArgument("--workload");

const childSize = readIntegerArgument("--size");

if (childWorkload !== undefined || childSize !== undefined) {
  if (
    !isWorkload(childWorkload) ||
    childSize === undefined ||
    !SIZES.includes(childSize as (typeof SIZES)[number])
  ) {
    throw new Error("Invalid contract inspection child arguments");
  }

  runChild(childWorkload, childSize);
} else {
  await runParent();
}

async function runParent(): Promise<void> {
  runCorrectnessGate();

  console.log("\nGelis contract inspection scaling benchmark");

  console.log(`Runtime:   bun ${Bun.version}`);

  console.log(`CPU:       ${cpus()[0]?.model ?? "unknown"}`);

  console.log(`Samples:   ${SAMPLES} per workload/size`);

  console.log(`Sizes:     ${SIZES.join(", ")}`);

  console.log(`Workloads: ${WORKLOADS.join(", ")}`);

  console.log("Scope:     inspectContract(app) only");

  console.log("Setup:     application construction excluded");

  console.log("Isolation: fresh child per workload/size\n");

  const results: BenchmarkResult[] = [];

  for (const workload of WORKLOADS) {
    for (const size of SIZES) {
      results.push(await runBenchmarkChild(workload, size));
    }
  }

  console.log("Results\n");

  console.table(
    results.map((result) => ({
      workload: result.workload,

      routes: result.routes,

      iterations: result.iterations,

      "median ms": round(result.medianMs, 3),

      "µs / route": round(result.medianUsPerRoute, 3),

      "routes / sec": Math.round(result.routesPerSecond),

      "CV %": round(result.cv * 100, 2),
    })),
  );

  console.log("\nScaling relative to 1,000 routes\n");

  console.table(
    WORKLOADS.map((workload) => {
      const thousand = findResult(results, workload, 1_000);

      const fiveThousand = findResult(results, workload, 5_000);

      return {
        workload,

        "1k ms": round(thousand.medianMs, 3),

        "5k ms": round(fiveThousand.medianMs, 3),

        "5k / 1k": round(fiveThousand.medianMs / thousand.medianMs, 2),

        "5k µs / route": round(fiveThousand.medianUsPerRoute, 3),

        "5k < 50 ms": fiveThousand.medianMs < 50 ? "PASS" : "FAIL",
      };
    }),
  );

  console.log("\nInterpretation:");

  console.log(
    "- Primary local budget: 5,000-route inspection should remain below ~50 ms median.",
  );

  console.log("- Scaling shape matters more than the exact absolute number.");

  console.log(
    "- A 5x route increase should remain approximately linear, allowing fixed-cost and GC noise.",
  );

  void sink;
}

function runCorrectnessGate(): void {
  let validations = 0;

  const SharedSchema = createSchema<
    {
      raw: string;
    },
    {
      normalized: string;
    }
  >((value) => {
    validations++;

    return {
      value: value as {
        normalized: string;
      },
    };
  });

  const responses = {
    200: SharedSchema,
  } satisfies ResponseContractMap;

  const app = new Gelis();

  app.get(
    "/plain",

    () => "plain",
  );

  app.post(
    "/shared",

    {
      query: SharedSchema,

      body: SharedSchema,

      responses,
    },

    () => ({
      normalized: "shared",
    }),
  );

  app.get(
    "/documented/:id",

    {
      openapi: createMetadata(2),
    },

    () => "documented",
  );

  const snapshot = inspectContract(app);

  assert.equal(validations, 0);

  assert.equal(snapshot.routes.length, 3);

  assert.equal(snapshot.routes[0]?.path, "/plain");

  assert.equal(snapshot.routes[1]?.query, SharedSchema);

  assert.equal(snapshot.routes[1]?.body, SharedSchema);

  assert.equal(snapshot.routes[1]?.responses, responses);

  const openapi = snapshot.routes[2]?.openapi;

  assert.ok(openapi !== undefined && openapi !== false);

  assert.equal(openapi.operationId, "route2");

  console.log("Correctness: PASS");
}

async function runBenchmarkChild(
  workload: Workload,

  size: number,
): Promise<BenchmarkResult> {
  const child = Bun.spawn(
    [process.execPath, CHILD, "--workload", workload, "--size", String(size)],

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
      [
        `Contract inspection child failed: ${workload}/${size}`,
        stdout,
        stderr,
      ].join("\n"),
    );
  }

  const line = stdout
    .split(/\r?\n/)
    .find((value) => value.startsWith("RESULT "));

  if (line === undefined) {
    throw new Error(`Missing benchmark result: ${workload}/${size}\n${stdout}`);
  }

  const parsed: unknown = JSON.parse(line.slice("RESULT ".length));

  if (!isBenchmarkResult(parsed)) {
    throw new Error(`Invalid benchmark result: ${workload}/${size}`);
  }

  return parsed;
}

function runChild(
  workload: Workload,

  size: number,
): void {
  const { app, validations } = createBenchmarkApp(workload, size);

  const initial = inspectContract(app);

  assert.equal(initial.routes.length, size);

  assert.equal(validations(), 0);

  for (let index = 0; index < WARMUP_ITERATIONS; index++) {
    sink = inspectContract(app);
  }

  const iterations = calibrate(app);

  const samples: number[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    samples.push(measure(app, iterations));
  }

  assert.equal(validations(), 0);

  const medianElapsedMs = median(samples);

  const medianMs = medianElapsedMs / iterations;

  const medianUsPerRoute = (medianMs * 1_000) / size;

  const routesPerSecond = size / (medianMs / 1_000);

  const normalizedSamples = samples.map((elapsed) => elapsed / iterations);

  const result: BenchmarkResult = {
    workload,

    routes: size,

    iterations,

    medianMs,

    medianUsPerRoute,

    routesPerSecond,

    cv: coefficientOfVariation(normalizedSamples),
  };

  console.log(`RESULT ${JSON.stringify(result)}`);

  void sink;
}

function createBenchmarkApp(
  workload: Workload,

  size: number,
): {
  readonly app: Gelis;

  readonly validations: () => number;
} {
  let validationCount = 0;

  const SharedSchema = createSchema<
    Record<string, unknown>,
    Record<string, unknown>
  >((value) => {
    validationCount++;

    return {
      value: value as Record<string, unknown>,
    };
  });

  const responses = {
    200: SharedSchema,
  } satisfies ResponseContractMap;

  const app = new Gelis();

  for (let index = 0; index < size; index++) {
    const path = `/route-${index}` as const;

    switch (workload) {
      case "plain": {
        app.get(
          path,

          BENCHMARK_HANDLER,
        );

        break;
      }

      case "shared-contract": {
        app.post(
          path,

          {
            query: SharedSchema,

            body: SharedSchema,

            responses,
          },

          BENCHMARK_HANDLER,
        );

        break;
      }

      case "metadata-rich": {
        app.post(
          `${path}/:id`,

          {
            query: SharedSchema,

            body: SharedSchema,

            responses,

            openapi: createMetadata(index),
          },

          BENCHMARK_HANDLER,
        );

        break;
      }
    }
  }

  return {
    app,

    validations: () => validationCount,
  };
}

function createMetadata(index: number): OpenAPIRouteMetadata {
  return {
    summary: `Route ${index}`,

    description: "Contract inspection benchmark route.",

    operationId: `route${index}`,

    tags: ["Benchmark", "Contract"],

    request: {
      params: {
        id: {
          description: "Route identifier",

          schema: {
            type: "string",
          },
        },
      },

      query: {
        parameters: [
          {
            name: "include",

            description: "Optional related resources",

            schema: {
              type: "string",
            },
          },

          {
            name: "limit",

            description: "Maximum result count",

            schema: {
              type: "integer",

              minimum: 1,
            },
          },
        ],
      },

      body: {
        description: "Request body",

        schema: {
          type: "object",
        },
      },
    },

    responses: {
      200: {
        description: "Successful response",

        schema: {
          type: "object",
        },
      },

      404: {
        description: "Not found",

        schema: {
          type: "object",
        },
      },

      default: {
        description: "Unexpected response",

        opaque: true,
      },
    },
  };
}

function calibrate(app: Gelis): number {
  let iterations = 1;

  while (true) {
    const elapsed = measure(app, iterations);

    if (elapsed >= MIN_CALIBRATION_MS) {
      return Math.max(
        1,

        Math.round((iterations * TARGET_MS) / Math.max(elapsed, 0.001)),
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
    sink = inspectContract(app);
  }

  return performance.now() - start;
}

function createSchema<Input = unknown, Output = Input>(
  validate: (
    value: unknown,
  ) =>
    | StandardSchemaV1.Result<Output>
    | Promise<StandardSchemaV1.Result<Output>> = (value) => ({
    value: value as Output,
  }),
): StandardSchemaV1<Input, Output> {
  return {
    "~standard": {
      version: 1,

      vendor: "gelis-contract-bench",

      validate,
    },
  };
}

function findResult(
  results: readonly BenchmarkResult[],

  workload: Workload,

  routes: number,
): BenchmarkResult {
  const result = results.find(
    (candidate) =>
      candidate.workload === workload && candidate.routes === routes,
  );

  if (result === undefined) {
    throw new Error(`Missing result: ${workload}/${routes}`);
  }

  return result;
}

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function readIntegerArgument(name: string): number | undefined {
  const value = readArgument(name);

  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

function isWorkload(value: string | undefined): value is Workload {
  return (
    value === "plain" ||
    value === "shared-contract" ||
    value === "metadata-rich"
  );
}

function isBenchmarkResult(value: unknown): value is BenchmarkResult {
  return (
    value !== null &&
    typeof value === "object" &&
    "workload" in value &&
    typeof value.workload === "string" &&
    "routes" in value &&
    typeof value.routes === "number" &&
    "iterations" in value &&
    typeof value.iterations === "number" &&
    "medianMs" in value &&
    typeof value.medianMs === "number" &&
    "medianUsPerRoute" in value &&
    typeof value.medianUsPerRoute === "number" &&
    "routesPerSecond" in value &&
    typeof value.routesPerSecond === "number" &&
    "cv" in value &&
    typeof value.cv === "number"
  );
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

function round(
  value: number,

  digits: number,
): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}
