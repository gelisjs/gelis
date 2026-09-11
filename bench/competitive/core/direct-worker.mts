import { Gelis } from "../../../src";
import { Elysia } from "elysia";
import { Elysia as ElysiaNext } from "elysia-v2";
import { Hono } from "hono";

const WARMUP_SYNC = 20_000;
const WARMUP_ASYNC = 2_000;
const TARGET_MS = 120;
const MIN_CALIBRATION_MS = 20;

type Framework =
  | "gelis"
  | "hono"
  | "elysia-stable"
  | "elysia-stable-precompile"
  | "elysia-next";

type Scenario =
  | "static-raw"
  | "dynamic-raw"
  | "static-json"
  | "dynamic-json";

type CompletionMode = "sync" | "async";

interface TimedWorkerResult {
  readonly kind: "timed";
  readonly framework: Framework;
  readonly scenario: Scenario;
  readonly routes: number;
  readonly completion: CompletionMode;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number;
  readonly sink: number;
}

interface ProbeWorkerResult {
  readonly kind: "probe";
  readonly framework: Framework;
  readonly scenario: Scenario;
  readonly routes: number;
  readonly completion: CompletionMode;
}

type WorkerResult = TimedWorkerResult | ProbeWorkerResult;

type FetchLike = (request: Request) => Response | Promise<Response>;

type BenchmarkParams = { id: string };

const args = readArgs(process.argv.slice(2));
const framework = required(args.framework, "--framework") as Framework;
const scenario = required(args.scenario, "--scenario") as Scenario;
const routes = Number(required(args.routes, "--routes"));
const probeOnly = args.probeOnly === "true";

assertFramework(framework);
assertScenario(scenario);
assertRouteCount(routes);

console.log(JSON.stringify(await run(framework, scenario, routes, probeOnly)));

async function run(
  framework: Framework,
  scenario: Scenario,
  routes: number,
  probeOnly: boolean,
): Promise<WorkerResult> {
  const fetch = buildFetch(framework, scenario, routes);
  const last = routes - 1;
  const path =
    scenario === "static-raw" || scenario === "static-json"
      ? `/r/${last}`
      : `/r/${last}/value-42`;
  const request = new Request(`http://gelis.test${path}`);

  const first = fetch(request);
  const firstIsAsync = isPromiseLike(first);
  const completion: CompletionMode = firstIsAsync ? "async" : "sync";
  const firstResponse = firstIsAsync ? await first : first;

  await assertResponse(firstResponse, scenario, last);

  if (probeOnly) {
    return {
      kind: "probe",
      framework,
      scenario,
      routes,
      completion,
    };
  }

  let sink = 0;

  if (completion === "sync") {
    const operation = () => {
      const response = fetch(request);
      if (isPromiseLike(response)) {
        throw new Error(`${framework}/${scenario} changed completion mode to async`);
      }
      if (!(response instanceof Response) || response.status !== 200) {
        throw new Error(`${framework}/${scenario} timed response was invalid`);
      }
      sink ^= response.status;
    };

    for (let index = 0; index < WARMUP_SYNC; index++) {
      operation();
    }

    const iterations = calibrateSync(operation);
    const elapsed = measureSync(operation, iterations);

    return {
      kind: "timed",
      framework,
      scenario,
      routes,
      completion,
      iterations,
      warmups: WARMUP_SYNC,
      nsPerOp: (elapsed * 1_000_000) / iterations,
      sink,
    };
  }

  const operation = async () => {
    const response = await fetch(request);
    if (!(response instanceof Response) || response.status !== 200) {
      throw new Error(`${framework}/${scenario} timed response was invalid`);
    }
    sink ^= response.status;
  };

  for (let index = 0; index < WARMUP_ASYNC; index++) {
    await operation();
  }

  const iterations = await calibrateAsync(operation);
  const elapsed = await measureAsync(operation, iterations);

  return {
    kind: "timed",
    framework,
    scenario,
    routes,
    completion,
    iterations,
    warmups: WARMUP_ASYNC,
    nsPerOp: (elapsed * 1_000_000) / iterations,
    sink,
  };
}

function buildFetch(
  framework: Framework,
  scenario: Scenario,
  routes: number,
): FetchLike {
  switch (framework) {
    case "gelis":
      return buildGelis(scenario, routes);
    case "hono":
      return buildHono(scenario, routes);
    case "elysia-stable":
      return buildElysiaStable(scenario, routes, false);
    case "elysia-stable-precompile":
      return buildElysiaStable(scenario, routes, true);
    case "elysia-next":
      return buildElysiaNext(scenario, routes);
  }
}

function buildGelis(scenario: Scenario, routes: number): FetchLike {
  const app = new Gelis();

  registerRoutes(
    scenario,
    routes,
    (path, index) => {
      app.get(path as `/r/${number}`, ({ request }) =>
        scenario === "static-raw"
          ? new Response(request.method)
          : { method: request.method, route: index },
      );
    },
    (path) => {
      app.get(path as `/r/${number}/:id`, ({ request, params }) =>
        scenario === "dynamic-raw"
          ? new Response(params.id)
          : { method: request.method, id: params.id },
      );
    },
  );

  return (request) => app.fetch(request);
}

function buildHono(scenario: Scenario, routes: number): FetchLike {
  const app = new Hono();

  registerRoutes(
    scenario,
    routes,
    (path, index) => {
      app.get(path, (context) =>
        scenario === "static-raw"
          ? new Response(context.req.raw.method)
          : context.json({ method: context.req.raw.method, route: index }),
      );
    },
    (path) => {
      app.get(path, (context) =>
        scenario === "dynamic-raw"
          ? new Response(context.req.param("id"))
          : context.json({
              method: context.req.raw.method,
              id: context.req.param("id"),
            }),
      );
    },
  );

  return (request) => app.fetch(request);
}

function buildElysiaStable(
  scenario: Scenario,
  routes: number,
  precompile: boolean,
): FetchLike {
  const app = new Elysia({ precompile });

  registerRoutes(
    scenario,
    routes,
    (path, index) => {
      app.get(path, ({ request }) =>
        scenario === "static-raw"
          ? new Response(request.method)
          : { method: request.method, route: index },
      );
    },
    (path) => {
      app.get(path, ({ request, params }) => {
        const typedParams = params as BenchmarkParams;
        return scenario === "dynamic-raw"
          ? new Response(typedParams.id)
          : { method: request.method, id: typedParams.id };
      });
    },
  );

  return (request) => app.fetch(request);
}

function buildElysiaNext(scenario: Scenario, routes: number): FetchLike {
  const app = new ElysiaNext();

  registerRoutes(
    scenario,
    routes,
    (path, index) => {
      app.get(path, ({ request }) =>
        scenario === "static-raw"
          ? new Response(request.method)
          : { method: request.method, route: index },
      );
    },
    (path) => {
      app.get(path, ({ request, params }) => {
        const typedParams = params as BenchmarkParams;
        return scenario === "dynamic-raw"
          ? new Response(typedParams.id)
          : { method: request.method, id: typedParams.id };
      });
    },
  );

  return (request) => app.fetch(request);
}

function registerRoutes(
  scenario: Scenario,
  routes: number,
  registerStatic: (path: string, index: number) => void,
  registerDynamic: (path: string, index: number) => void,
): void {
  for (let index = 0; index < routes; index++) {
    if (scenario === "static-raw" || scenario === "static-json") {
      registerStatic(`/r/${index}`, index);
    } else {
      registerDynamic(`/r/${index}/:id`, index);
    }
  }
}

async function assertResponse(
  response: Response,
  scenario: Scenario,
  routeIndex: number,
): Promise<void> {
  if (!(response instanceof Response) || response.status !== 200) {
    throw new Error(`${scenario} correctness status failed`);
  }

  const body = await response.text();
  const mediaType =
    response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ??
    "";

  const expectedBody =
    scenario === "static-raw"
      ? "GET"
      : scenario === "dynamic-raw"
        ? "value-42"
        : scenario === "static-json"
          ? JSON.stringify({ method: "GET", route: routeIndex })
          : JSON.stringify({ method: "GET", id: "value-42" });
  const expectedMediaType =
    scenario === "static-raw" || scenario === "dynamic-raw"
      ? "text/plain"
      : "application/json";

  if (body !== expectedBody) {
    throw new Error(
      `${scenario} correctness body failed: expected ${expectedBody}, got ${body}`,
    );
  }

  if (mediaType !== expectedMediaType) {
    throw new Error(
      `${scenario} correctness media type failed: expected ${expectedMediaType}, got ${mediaType}`,
    );
  }

  if (response.headers.get("content-encoding") !== null) {
    throw new Error(`${scenario} unexpectedly applied content encoding`);
  }
}

function calibrateSync(operation: () => void): number {
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

async function calibrateAsync(operation: () => Promise<void>): Promise<number> {
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

function measureSync(operation: () => void, iterations: number): number {
  const start = performance.now();
  for (let index = 0; index < iterations; index++) {
    operation();
  }
  return performance.now() - start;
}

async function measureAsync(
  operation: () => Promise<void>,
  iterations: number,
): Promise<number> {
  const start = performance.now();
  for (let index = 0; index < iterations; index++) {
    await operation();
  }
  return performance.now() - start;
}

interface ParsedArgs {
  readonly framework: string | undefined;
  readonly scenario: string | undefined;
  readonly routes: string | undefined;
  readonly probeOnly: string | undefined;
}

function readArgs(values: readonly string[]): ParsedArgs {
  const entries = new Map<string, string>();
  for (const value of values) {
    if (!value.startsWith("--")) continue;
    const separator = value.indexOf("=");
    if (separator === -1) continue;
    entries.set(value.slice(2, separator), value.slice(separator + 1));
  }
  return {
    framework: entries.get("framework"),
    scenario: entries.get("scenario"),
    routes: entries.get("routes"),
    probeOnly: entries.get("probe-only"),
  };
}

function required(value: string | undefined, flag: string): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing ${flag}`);
  }
  return value;
}

function assertFramework(value: string): asserts value is Framework {
  if (
    value !== "gelis" &&
    value !== "hono" &&
    value !== "elysia-stable" &&
    value !== "elysia-stable-precompile" &&
    value !== "elysia-next"
  ) {
    throw new Error(`Unknown framework: ${value}`);
  }
}

function assertScenario(value: string): asserts value is Scenario {
  if (
    value !== "static-raw" &&
    value !== "dynamic-raw" &&
    value !== "static-json" &&
    value !== "dynamic-json"
  ) {
    throw new Error(`Unknown scenario: ${value}`);
  }
}

function assertRouteCount(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 5_000) {
    throw new Error(`Invalid route count: ${value}`);
  }
}

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return false;
  }
  return typeof (value as { then?: unknown }).then === "function";
}
