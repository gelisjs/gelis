import { mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Gelis } from "../../src/index.ts";
import type { StandardSchemaV1 } from "../../src/index.ts";
import {
  RUNTIME_INPUT_QUERY,
  isJsonContentType,
  parseQueryFromUrl,
  validationErrorResponse,
} from "../../src/runtime/input.ts";
import { runtimeReply } from "../../src/runtime/response.ts";
import type { RuntimeRouteContext } from "../../src/runtime/types.ts";
import {
  bodySyncSchema,
  queryAsyncSchema,
  querySyncSchema,
} from "../http/validation/schemas.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = resolve(HERE, "results");
const CHILD = resolve(HERE, "validation-decomposition.mts");

const ROUTES = 5_000;
const SAMPLES = 21;
const TARGET_MS = 150;
const MIN_CALIBRATION_MS = 25;
const WARMUP_MS = 250;

const QUERY_URL = "http://gelis.test/r/4999?page=42&q=gelis";
const PLAIN_URL = "http://gelis.test/r/4999";
const BODY_URL = "http://gelis.test/r/4999";
const QUERY_BODY_URL = `${BODY_URL}?page=42&q=gelis`;
const BODY_TEXT = JSON.stringify({ name: "Gelis", count: 42 });

const RAW_QUERY: Record<string, string | string[]> = {
  page: "42",
  q: "gelis",
};

const RAW_BODY = {
  name: "Gelis",
  count: 42,
};

const VALIDATED_QUERY = {
  page: 42,
  q: "gelis",
};

const EMPTY_PARAMS = Object.create(null) as Record<string, string>;
const OK_RESPONSE = new Response("ok");

const QUERY_ISSUES: readonly StandardSchemaV1.Issue[] = [
  {
    message: "page is required",
    path: ["page"],
  },
];

const invalidQuerySchema = {
  "~standard": {
    version: 1,
    vendor: "gelis-validation-decomposition",
    validate() {
      return {
        issues: QUERY_ISSUES,
      };
    },
  },
} as StandardSchemaV1<Record<string, string | string[]>>;

const scenarios = [
  "input-plan-lookup",
  "query-parse",
  "query-schema-sync",
  "query-dispatch-sync",
  "query-schema-async",
  "query-dispatch-async",
  "value-propagation-replica",
  "validation-error-response",
  "plain-fetch",
  "query-sync-fetch",
  "query-invalid-fetch",
  "query-async-fetch",
  "content-type",
  "body-request-json",
  "body-schema-sync",
  "body-sync-fetch",
  "query-body-fetch",
  "query-lifecycle-fetch",
] as const;

type Scenario = (typeof scenarios)[number];
type BenchmarkKind = "sync" | "async";

type SyncOperation = () => void;
type AsyncOperation = () => Promise<void>;

interface ScenarioDefinition {
  readonly kind: BenchmarkKind;
  readonly operation: SyncOperation | AsyncOperation;
  readonly verify: () => void | Promise<void>;
  readonly prepare?: (iterations: number) => void | Promise<void>;
}

interface ScenarioResult {
  readonly scenario: Scenario;
  readonly kind: BenchmarkKind;
  readonly iterations: number;
  readonly medianNs: number;
  readonly minNs: number;
  readonly maxNs: number;
  readonly cv: number;
  readonly samples: readonly number[];
}

let sink: unknown;

const requestedScenario = readScenario();

if (requestedScenario !== undefined) {
  await runChild(requestedScenario);
} else {
  await runParent();
}

async function runParent(): Promise<void> {
  console.log("\nGelis P7-A validation cost decomposition");
  console.log(`Runtime:     bun ${Bun.version}`);
  console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);
  console.log(`Routes:      ${ROUTES}`);
  console.log(`Samples:     ${SAMPLES}`);
  console.log(`Target:      ${TARGET_MS} ms/sample`);
  console.log("Isolation:   fresh process per stage\n");

  const results: ScenarioResult[] = [];

  for (let index = 0; index < scenarios.length; index++) {
    const scenario = scenarios[index];

    if (scenario === undefined) {
      continue;
    }

    console.log(`[${index + 1}/${scenarios.length}] ${scenario}`);
    results.push(await runIsolatedScenario(scenario));
  }

  console.log("\nResults\n");
  console.table(
    results.map((result) => ({
      stage: result.scenario,
      kind: result.kind,
      "ns/op median": round(result.medianNs, 2),
      "ns/op min": round(result.minNs, 2),
      "ns/op max": round(result.maxNs, 2),
      "cv %": round(result.cv * 100, 2),
      iterations: result.iterations,
    })),
  );

  const metadata = {
    generatedAt: new Date().toISOString(),
    runtime: `bun ${Bun.version}`,
    cpu: cpus()[0]?.model ?? "unknown",
    routes: ROUTES,
    samples: SAMPLES,
    targetMs: TARGET_MS,
    warmupMs: WARMUP_MS,
    isolation: "fresh process per stage",
  };

  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(
    resolve(RESULTS_DIR, "validation-decomposition-latest.json"),
    `${JSON.stringify({ metadata, results }, null, 2)}\n`,
  );

  console.log(
    "\nRaw results: bench/runtime/results/validation-decomposition-latest.json",
  );
  console.log(
    "Do not sum isolated stage timings as an exact request cost. Use them only to localize material work.",
  );

  void sink;
}

async function runIsolatedScenario(
  scenario: Scenario,
): Promise<ScenarioResult> {
  const child = Bun.spawn([process.execPath, CHILD, `--scenario=${scenario}`], {
    cwd: resolve(HERE, "../.."),
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdoutPromise = new Response(child.stdout).text();
  const stderrPromise = new Response(child.stderr).text();
  const exitCode = await child.exited;
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

  if (exitCode !== 0) {
    throw new Error(
      [`Validation decomposition failed: ${scenario}`, stdout, stderr].join(
        "\n",
      ),
    );
  }

  const line = stdout
    .split(/\r?\n/)
    .find((value) => value.startsWith("RESULT "));

  if (!line) {
    throw new Error(`Missing result: ${scenario}\n${stdout}`);
  }

  const parsed: unknown = JSON.parse(line.slice("RESULT ".length));

  if (!isScenarioResult(parsed)) {
    throw new Error(`Invalid result: ${scenario}`);
  }

  return parsed;
}

async function runChild(scenario: Scenario): Promise<void> {
  const definition = createScenario(scenario);

  await definition.verify();

  let result: ScenarioResult;

  if (definition.kind === "sync") {
    const operation = definition.operation as SyncOperation;

    warmupSync(operation);
    const iterations = calibrateSync(operation);
    const samples = measureSyncSamples(operation, iterations);

    result = createResult(scenario, "sync", iterations, samples);
  } else {
    const operation = definition.operation as AsyncOperation;

    await warmupAsync(definition, operation);
    const iterations = await calibrateAsync(definition, operation);
    const samples = await measureAsyncSamples(
      definition,
      operation,
      iterations,
    );

    result = createResult(scenario, "async", iterations, samples);
  }

  console.log(`RESULT ${JSON.stringify(result)}`);
  void sink;
}

function createScenario(scenario: Scenario): ScenarioDefinition {
  switch (scenario) {
    case "input-plan-lookup": {
      const plans = Array.from({ length: 128 }, () => ({
        kind: RUNTIME_INPUT_QUERY,
        query: querySyncSchema,
        body: undefined,
      }));
      let cursor = 0;

      return syncScenario(
        () => {
          const input = plans[cursor & 127];
          cursor++;

          if (input === undefined || input.kind !== RUNTIME_INPUT_QUERY) {
            throw new Error("Invalid input plan fixture");
          }

          sink = input.query;
        },
        () => {
          if (plans.length !== 128 || plans[0]?.query !== querySyncSchema) {
            throw new Error("Input plan fixture mismatch");
          }
        },
      );
    }

    case "query-parse":
      return syncScenario(
        () => {
          sink = parseQueryFromUrl(QUERY_URL);
        },
        () => {
          const parsed = parseQueryFromUrl(QUERY_URL);

          if (parsed.page !== "42" || parsed.q !== "gelis") {
            throw new Error("Query parser fixture mismatch");
          }
        },
      );

    case "query-schema-sync":
      return syncScenario(
        () => {
          sink = querySyncSchema["~standard"].validate(RAW_QUERY);
        },
        () => {
          const result = querySyncSchema["~standard"].validate(RAW_QUERY);

          if (isPromiseLike(result) || result.issues !== undefined) {
            throw new Error("Expected synchronous valid query schema");
          }
        },
      );

    case "query-dispatch-sync":
      return syncScenario(
        () => {
          const validation = querySyncSchema["~standard"].validate(RAW_QUERY);

          if (isPromiseLike(validation)) {
            throw new Error("Sync schema returned a Promise");
          }

          sink =
            validation.issues === undefined
              ? validation.value
              : validation.issues;
        },
        () => {
          const validation = querySyncSchema["~standard"].validate(RAW_QUERY);

          if (isPromiseLike(validation) || validation.issues !== undefined) {
            throw new Error("Expected synchronous query validation success");
          }
        },
      );

    case "query-schema-async":
      return asyncScenario(
        async () => {
          sink = await queryAsyncSchema["~standard"].validate(RAW_QUERY);
        },
        async () => {
          const result =
            await queryAsyncSchema["~standard"].validate(RAW_QUERY);

          if (result.issues !== undefined) {
            throw new Error("Expected asynchronous query validation success");
          }
        },
      );

    case "query-dispatch-async":
      return asyncScenario(
        async () => {
          const validation = queryAsyncSchema["~standard"].validate(RAW_QUERY);

          if (!isPromiseLike(validation)) {
            throw new Error("Async schema did not return a Promise");
          }

          const result = await Promise.resolve(validation);

          sink = result.issues === undefined ? result.value : result.issues;
        },
        async () => {
          const validation = queryAsyncSchema["~standard"].validate(RAW_QUERY);

          if (!isPromiseLike(validation)) {
            throw new Error("Expected asynchronous query validation");
          }

          const result = await Promise.resolve(validation);

          if (result.issues !== undefined) {
            throw new Error("Expected asynchronous query validation success");
          }
        },
      );

    case "value-propagation-replica": {
      const request = new Request(QUERY_URL);
      const handler = (context: RuntimeRouteContext): Response => {
        sink = context.query;
        return OK_RESPONSE;
      };

      return syncScenario(
        () => {
          sink = handler({
            request,
            params: EMPTY_PARAMS,
            query: VALIDATED_QUERY,
            body: undefined,
            reply: runtimeReply,
          });
        },
        () => {
          const response = handler({
            request,
            params: EMPTY_PARAMS,
            query: VALIDATED_QUERY,
            body: undefined,
            reply: runtimeReply,
          });

          if (response !== OK_RESPONSE) {
            throw new Error("Value propagation fixture mismatch");
          }
        },
      );
    }

    case "validation-error-response":
      return syncScenario(
        () => {
          const response = validationErrorResponse("query", QUERY_ISSUES);
          sink = response.status;
        },
        () => {
          const response = validationErrorResponse("query", QUERY_ISSUES);

          if (response.status !== 422) {
            throw new Error("Validation error response mismatch");
          }
        },
      );

    case "plain-fetch": {
      const app = createPlainApp();
      const request = new Request(PLAIN_URL);

      return syncScenario(
        () => {
          const result = app.fetch(request);

          if (!(result instanceof Response)) {
            throw new Error("Plain fetch became asynchronous");
          }

          sink = result.status;
        },
        () => verifySyncResponse(app.fetch(request), 200),
      );
    }

    case "query-sync-fetch": {
      const app = createQuerySyncApp();
      const request = new Request(QUERY_URL);

      return syncScenario(
        () => {
          const result = app.fetch(request);

          if (!(result instanceof Response)) {
            throw new Error("Sync query fetch became asynchronous");
          }

          sink = result.status;
        },
        () => verifySyncResponse(app.fetch(request), 200),
      );
    }

    case "query-invalid-fetch": {
      const app = createQueryInvalidApp();
      const request = new Request(QUERY_URL);

      return syncScenario(
        () => {
          const result = app.fetch(request);

          if (!(result instanceof Response)) {
            throw new Error("Invalid query fetch became asynchronous");
          }

          sink = result.status;
        },
        () => verifySyncResponse(app.fetch(request), 422),
      );
    }

    case "query-async-fetch": {
      const app = createQueryAsyncApp();
      const request = new Request(QUERY_URL);

      return asyncScenario(
        async () => {
          const response = await app.fetch(request);
          sink = response.status;
        },
        async () => {
          const result = app.fetch(request);

          if (!(result instanceof Promise)) {
            throw new Error("Async query fetch did not return a Promise");
          }

          const response = await result;

          if (response.status !== 200) {
            throw new Error("Unexpected async query response");
          }
        },
      );
    }

    case "content-type": {
      const request = createBodyRequest(BODY_URL);

      return syncScenario(
        () => {
          sink = isJsonContentType(request);
        },
        () => {
          if (!isJsonContentType(request)) {
            throw new Error("JSON content type fixture mismatch");
          }
        },
      );
    }

    case "body-request-json": {
      const requestPool = createRequestPool(BODY_URL);

      return asyncScenario(
        async () => {
          sink = await requestPool.next().json();
        },
        async () => {
          const body = (await createBodyRequest(BODY_URL).json()) as {
            name?: unknown;
            count?: unknown;
          };

          if (body.name !== "Gelis" || body.count !== 42) {
            throw new Error("Request.json fixture mismatch");
          }
        },
        requestPool.prepare,
      );
    }

    case "body-schema-sync":
      return syncScenario(
        () => {
          sink = bodySyncSchema["~standard"].validate(RAW_BODY);
        },
        () => {
          const result = bodySyncSchema["~standard"].validate(RAW_BODY);

          if (isPromiseLike(result) || result.issues !== undefined) {
            throw new Error("Expected synchronous valid body schema");
          }
        },
      );

    case "body-sync-fetch": {
      const app = createBodySyncApp();
      const requestPool = createRequestPool(BODY_URL);

      return asyncScenario(
        async () => {
          const response = await app.fetch(requestPool.next());
          sink = response.status;
        },
        async () => {
          const response = await app.fetch(createBodyRequest(BODY_URL));

          if (response.status !== 200) {
            throw new Error("Unexpected body response");
          }
        },
        requestPool.prepare,
      );
    }

    case "query-body-fetch": {
      const app = createQueryBodyApp();
      const requestPool = createRequestPool(QUERY_BODY_URL);

      return asyncScenario(
        async () => {
          const response = await app.fetch(requestPool.next());
          sink = response.status;
        },
        async () => {
          const response = await app.fetch(createBodyRequest(QUERY_BODY_URL));

          if (response.status !== 200) {
            throw new Error("Unexpected query+body response");
          }
        },
        requestPool.prepare,
      );
    }

    case "query-lifecycle-fetch": {
      const app = createQueryLifecycleApp();
      const request = new Request(QUERY_URL);

      return syncScenario(
        () => {
          const result = app.fetch(request);

          if (!(result instanceof Response)) {
            throw new Error("Query lifecycle fetch became asynchronous");
          }

          sink = result.status;
        },
        () => verifySyncResponse(app.fetch(request), 200),
      );
    }
  }
}

function createPlainApp(): Gelis {
  const app = new Gelis();

  for (let index = 0; index < ROUTES; index++) {
    app.get(`/r/${index}`, () => OK_RESPONSE);
  }

  return app;
}

function createQuerySyncApp(): Gelis {
  const app = new Gelis();

  for (let index = 0; index < ROUTES; index++) {
    app.get(`/r/${index}`, { query: querySyncSchema }, ({ query }) => {
      sink = query.page;
      return OK_RESPONSE;
    });
  }

  return app;
}

function createQueryInvalidApp(): Gelis {
  const app = new Gelis();

  for (let index = 0; index < ROUTES; index++) {
    app.get(`/r/${index}`, { query: invalidQuerySchema }, () => OK_RESPONSE);
  }

  return app;
}

function createQueryAsyncApp(): Gelis {
  const app = new Gelis();

  for (let index = 0; index < ROUTES; index++) {
    app.get(`/r/${index}`, { query: queryAsyncSchema }, ({ query }) => {
      sink = query.page;
      return OK_RESPONSE;
    });
  }

  return app;
}

function createBodySyncApp(): Gelis {
  const app = new Gelis();

  for (let index = 0; index < ROUTES; index++) {
    app.post(`/r/${index}`, { body: bodySyncSchema }, ({ body }) => {
      sink = body.count;
      return OK_RESPONSE;
    });
  }

  return app;
}

function createQueryBodyApp(): Gelis {
  const app = new Gelis();

  for (let index = 0; index < ROUTES; index++) {
    app.post(
      `/r/${index}`,
      {
        query: querySyncSchema,
        body: bodySyncSchema,
      },
      ({ query, body }) => {
        sink = query.page + body.count;
        return OK_RESPONSE;
      },
    );
  }

  return app;
}

function createQueryLifecycleApp(): Gelis {
  const app = new Gelis();

  for (let index = 0; index < ROUTES; index++) {
    app.get(
      `/r/${index}`,
      { query: querySyncSchema },
      ({ query }) => {
        sink = query.page;
        return OK_RESPONSE;
      },
      {
        beforeHandle: () => undefined,
        afterHandle: () => undefined,
      },
    );
  }

  return app;
}

function createBodyRequest(url: string): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: BODY_TEXT,
  });
}

function createRequestPool(url: string): {
  readonly prepare: (iterations: number) => void;
  readonly next: () => Request;
} {
  let requests: Request[] = [];
  let cursor = 0;

  return {
    prepare(iterations) {
      requests = new Array<Request>(iterations);

      for (let index = 0; index < iterations; index++) {
        requests[index] = createBodyRequest(url);
      }

      cursor = 0;
    },

    next() {
      const request = requests[cursor];
      cursor++;

      if (request === undefined) {
        throw new Error("Body request pool exhausted");
      }

      return request;
    },
  };
}

function syncScenario(
  operation: SyncOperation,
  verify: () => void,
): ScenarioDefinition {
  return {
    kind: "sync",
    operation,
    verify,
  };
}

function asyncScenario(
  operation: AsyncOperation,
  verify: () => Promise<void>,
  prepare?: (iterations: number) => void | Promise<void>,
): ScenarioDefinition {
  return {
    kind: "async",
    operation,
    verify,
    ...(prepare === undefined ? {} : { prepare }),
  };
}

function verifySyncResponse(
  result: Response | Promise<Response>,
  expectedStatus: number,
): void {
  if (!(result instanceof Response)) {
    throw new Error("Expected synchronous Response");
  }

  if (result.status !== expectedStatus) {
    throw new Error(
      `Unexpected response status: ${result.status}, expected ${expectedStatus}`,
    );
  }
}

function warmupSync(operation: SyncOperation): void {
  const start = performance.now();

  do {
    operation();
  } while (performance.now() - start < WARMUP_MS);
}

async function warmupAsync(
  definition: ScenarioDefinition,
  operation: AsyncOperation,
): Promise<void> {
  const batch = 512;
  const start = performance.now();

  do {
    await definition.prepare?.(batch);

    for (let index = 0; index < batch; index++) {
      await operation();
    }
  } while (performance.now() - start < WARMUP_MS);
}

function calibrateSync(operation: SyncOperation): number {
  let iterations = 1_000;

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

async function calibrateAsync(
  definition: ScenarioDefinition,
  operation: AsyncOperation,
): Promise<number> {
  let iterations = 100;

  while (true) {
    await definition.prepare?.(iterations);
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

function measureSyncSamples(
  operation: SyncOperation,
  iterations: number,
): number[] {
  const samples: number[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    samples.push(
      millisecondsToNsPerOp(measureSync(operation, iterations), iterations),
    );
  }

  return samples;
}

async function measureAsyncSamples(
  definition: ScenarioDefinition,
  operation: AsyncOperation,
  iterations: number,
): Promise<number[]> {
  const samples: number[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    await definition.prepare?.(iterations);

    samples.push(
      millisecondsToNsPerOp(
        await measureAsync(operation, iterations),
        iterations,
      ),
    );
  }

  return samples;
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

function createResult(
  scenario: Scenario,
  kind: BenchmarkKind,
  iterations: number,
  samples: readonly number[],
): ScenarioResult {
  return {
    scenario,
    kind,
    iterations,
    medianNs: median(samples),
    minNs: Math.min(...samples),
    maxNs: Math.max(...samples),
    cv: coefficientOfVariation(samples),
    samples,
  };
}

function millisecondsToNsPerOp(
  elapsedMilliseconds: number,
  iterations: number,
): number {
  return (elapsedMilliseconds * 1_000_000) / iterations;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const value = sorted[Math.floor(sorted.length / 2)];

  if (value === undefined) {
    throw new Error("Cannot compute median of empty samples");
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

function readScenario(): Scenario | undefined {
  const prefix = "--scenario=";
  const argument = process.argv.find((value) => value.startsWith(prefix));

  if (!argument) {
    return undefined;
  }

  const value = argument.slice(prefix.length);

  if (!scenarios.includes(value as Scenario)) {
    throw new Error(`Unknown validation decomposition scenario: ${value}`);
  }

  return value as Scenario;
}

function isScenarioResult(value: unknown): value is ScenarioResult {
  return (
    value !== null &&
    typeof value === "object" &&
    "scenario" in value &&
    typeof value.scenario === "string" &&
    scenarios.includes(value.scenario as Scenario) &&
    "medianNs" in value &&
    typeof value.medianNs === "number" &&
    "iterations" in value &&
    typeof value.iterations === "number"
  );
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
