import { Gelis } from "../../src/index.ts";
import { Router } from "../../src/runtime/router.ts";
import { normalizeResponse, runtimeReply } from "../../src/runtime/response.ts";
import { pathnameFromUrl } from "../../src/runtime/url.ts";
import { RUNTIME_ROUTE_PLAIN } from "../../src/runtime/types.ts";
import type { RuntimeRouteMatch } from "../../src/runtime/router.ts";
import type {
  RuntimeRouteContext,
  RuntimeRouteHandler,
  RuntimeRouteRecord,
} from "../../src/runtime/types.ts";

const ROUTES = 5_000;
const LAST = ROUTES - 1;
const WARMUP = 20_000;
const TARGET_MS = 120;
const MIN_CALIBRATION_MS = 20;
const STATIC_PATH = `/r/${LAST}`;
const DYNAMIC_PATH = `/r/${LAST}/value-42`;
const STATIC_URL = `http://gelis.test${STATIC_PATH}`;
const DYNAMIC_URL = `http://gelis.test${DYNAMIC_PATH}`;
const staticPayload = { method: "GET", route: LAST } as const;
const dynamicPayload = { method: "GET", id: "value-42" } as const;

type Cell =
  | "router-static-consume"
  | "router-dynamic-consume"
  | "router-static-escape"
  | "router-dynamic-escape"
  | "response-json-static"
  | "response-json-dynamic"
  | "normalize-static-json"
  | "normalize-dynamic-json"
  | "pipeline-static-raw"
  | "pipeline-dynamic-raw"
  | "pipeline-static-json"
  | "pipeline-dynamic-json"
  | "app-fetch-static-raw"
  | "app-fetch-dynamic-raw"
  | "app-fetch-static-json"
  | "app-fetch-dynamic-json";

type Scenario = "static-raw" | "dynamic-raw" | "static-json" | "dynamic-json";
type Operation = () => number;

interface WorkerResult {
  readonly cell: Cell;
  readonly probeOnly: boolean;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number | null;
  readonly sink: number;
}

const CELLS = new Set<Cell>([
  "router-static-consume",
  "router-dynamic-consume",
  "router-static-escape",
  "router-dynamic-escape",
  "response-json-static",
  "response-json-dynamic",
  "normalize-static-json",
  "normalize-dynamic-json",
  "pipeline-static-raw",
  "pipeline-dynamic-raw",
  "pipeline-static-json",
  "pipeline-dynamic-json",
  "app-fetch-static-raw",
  "app-fetch-dynamic-raw",
  "app-fetch-static-json",
  "app-fetch-dynamic-json",
]);

const args = readArgs(process.argv.slice(2));
const requestedCell = required(args.cell, "--cell");
assertCell(requestedCell);
const cell = requestedCell;
const probeOnly = args.probeOnly === "true";
let escapedMatch: RuntimeRouteMatch | undefined;

const prepared = prepareCell(cell);
await prepared.assertCorrectness();

if (probeOnly) {
  const result: WorkerResult = {
    cell,
    probeOnly: true,
    iterations: 0,
    warmups: 0,
    nsPerOp: null,
    sink: escapedMatch?.route.path.length ?? 0,
  };
  console.log(JSON.stringify(result));
} else {
  let sink = 0;
  const operation = () => {
    const value = prepared.operation();
    sink = ((sink << 5) - sink + value) | 0;
  };

  for (let index = 0; index < WARMUP; index++) operation();
  const iterations = calibrate(operation);
  const elapsed = measure(operation, iterations);

  const result: WorkerResult = {
    cell,
    probeOnly: false,
    iterations,
    warmups: WARMUP,
    nsPerOp: (elapsed * 1_000_000) / iterations,
    sink: sink ^ (escapedMatch?.route.path.length ?? 0),
  };
  console.log(JSON.stringify(result));
}

function prepareCell(cell: Cell): {
  readonly operation: Operation;
  readonly assertCorrectness: () => void | Promise<void>;
} {
  switch (cell) {
    case "router-static-consume": {
      const router = buildRouter("static-json");
      return routerConsumeCell(router, STATIC_PATH, false);
    }
    case "router-dynamic-consume": {
      const router = buildRouter("dynamic-json");
      return routerConsumeCell(router, DYNAMIC_PATH, true);
    }
    case "router-static-escape": {
      const router = buildRouter("static-json");
      return routerEscapeCell(router, STATIC_PATH, false);
    }
    case "router-dynamic-escape": {
      const router = buildRouter("dynamic-json");
      return routerEscapeCell(router, DYNAMIC_PATH, true);
    }
    case "response-json-static":
      return responseFactoryCell(() => Response.json(staticPayload), "static-json");
    case "response-json-dynamic":
      return responseFactoryCell(() => Response.json(dynamicPayload), "dynamic-json");
    case "normalize-static-json":
      return responseFactoryCell(() => normalizeResponse(staticPayload), "static-json");
    case "normalize-dynamic-json":
      return responseFactoryCell(() => normalizeResponse(dynamicPayload), "dynamic-json");
    case "pipeline-static-raw":
      return pipelineCell("static-raw");
    case "pipeline-dynamic-raw":
      return pipelineCell("dynamic-raw");
    case "pipeline-static-json":
      return pipelineCell("static-json");
    case "pipeline-dynamic-json":
      return pipelineCell("dynamic-json");
    case "app-fetch-static-raw":
      return appFetchCell("static-raw");
    case "app-fetch-dynamic-raw":
      return appFetchCell("dynamic-raw");
    case "app-fetch-static-json":
      return appFetchCell("static-json");
    case "app-fetch-dynamic-json":
      return appFetchCell("dynamic-json");
  }
}

function routerConsumeCell(router: Router, pathname: string, dynamic: boolean) {
  return {
    operation: () => {
      const match = router.match("GET", pathname);
      if (match === undefined) return 0;
      return (
        match.route.path.length +
        (dynamic ? (match.params.id?.length ?? 0) : Object.keys(match.params).length)
      );
    },
    assertCorrectness: () => assertRouterMatch(router, pathname, dynamic),
  };
}

function routerEscapeCell(router: Router, pathname: string, dynamic: boolean) {
  return {
    operation: () => {
      escapedMatch = router.match("GET", pathname);
      return escapedMatch === undefined ? 0 : escapedMatch.route.path.length;
    },
    assertCorrectness: () => assertRouterMatch(router, pathname, dynamic),
  };
}

function pipelineCell(scenario: Scenario) {
  const staticRoute = isStatic(scenario);
  const pathname = staticRoute ? STATIC_PATH : DYNAMIC_PATH;
  const request = new Request(staticRoute ? STATIC_URL : DYNAMIC_URL);
  const router = buildRouter(scenario);

  const run = (): Response => {
    const path = pathnameFromUrl(request.url);
    const match = router.match("GET", path);
    if (match === undefined) throw new Error("pipeline route miss");
    const value = match.route.handler(createContext(request, match.params));
    assertSync(value, "pipeline handler");
    return normalizeResponse(value);
  };

  return {
    operation: () => run().status,
    assertCorrectness: async () => {
      assertRouterMatch(router, pathname, !staticRoute);
      await assertScenarioResponse(run(), scenario);
    },
  };
}

function appFetchCell(scenario: Scenario) {
  const request = new Request(isStatic(scenario) ? STATIC_URL : DYNAMIC_URL);
  const app = buildApp(scenario);

  return {
    operation: () => {
      const response = app.fetch(request);
      assertSync(response, "app.fetch");
      return response.status;
    },
    assertCorrectness: async () => {
      const response = app.fetch(request);
      assertSync(response, "app.fetch correctness");
      await assertScenarioResponse(response, scenario);
    },
  };
}

function responseFactoryCell(
  factory: () => Response,
  scenario: "static-json" | "dynamic-json",
) {
  return {
    operation: () => {
      const response = factory();
      return response.status + (response.headers.get("content-type")?.length ?? 0);
    },
    assertCorrectness: async () => assertScenarioResponse(factory(), scenario),
  };
}

function buildRouter(scenario: Scenario): Router {
  const router = new Router();
  for (let index = 0; index < ROUTES; index++) router.register(createRoute(scenario, index));
  return router;
}

function buildApp(scenario: Scenario): Gelis {
  const app = new Gelis();

  for (let index = 0; index < ROUTES; index++) {
    if (scenario === "static-raw") {
      app.get(`/r/${index}` as `/r/${number}`, ({ request }) => new Response(request.method));
    } else if (scenario === "dynamic-raw") {
      app.get(`/r/${index}/:id` as `/r/${number}/:id`, ({ params }) => new Response(params.id));
    } else if (scenario === "static-json") {
      app.get(`/r/${index}` as `/r/${number}`, ({ request }) => ({
        method: request.method,
        route: index,
      }));
    } else {
      app.get(`/r/${index}/:id` as `/r/${number}/:id`, ({ request, params }) => ({
        method: request.method,
        id: params.id,
      }));
    }
  }

  return app;
}

function createRoute(scenario: Scenario, index: number): RuntimeRouteRecord {
  const path = isStatic(scenario) ? `/r/${index}` : `/r/${index}/:id`;
  const handler: RuntimeRouteHandler =
    scenario === "static-raw"
      ? ({ request }) => new Response(request.method)
      : scenario === "dynamic-raw"
        ? ({ params }) => new Response(params.id)
        : scenario === "static-json"
          ? ({ request }) => ({ method: request.method, route: index })
          : ({ request, params }) => ({ method: request.method, id: params.id });

  return {
    method: "GET",
    path,
    handler,
    flags: RUNTIME_ROUTE_PLAIN,
    input: undefined,
    beforeHandle: undefined,
    afterHandle: undefined,
    responses: undefined,
  };
}

function createContext(
  request: Request,
  params: Record<string, string>,
): RuntimeRouteContext {
  return {
    request,
    params,
    query: undefined,
    body: undefined,
    reply: runtimeReply,
  };
}

function assertRouterMatch(router: Router, pathname: string, dynamic: boolean): void {
  const match = router.match("GET", pathname);
  if (match === undefined) throw new Error("router correctness miss");

  if (dynamic) {
    if (match.route.path !== `/r/${LAST}/:id`) {
      throw new Error(`dynamic route mismatch: ${match.route.path}`);
    }
    if (match.params.id !== "value-42") {
      throw new Error(`dynamic param mismatch: ${match.params.id}`);
    }
    return;
  }

  if (match.route.path !== STATIC_PATH) {
    throw new Error(`static route mismatch: ${match.route.path}`);
  }
  if (Object.keys(match.params).length !== 0) {
    throw new Error("static route unexpectedly produced params");
  }
}

async function assertScenarioResponse(response: Response, scenario: Scenario): Promise<void> {
  if (response.status !== 200) throw new Error(`response status mismatch: ${response.status}`);

  const body = await response.text();
  const expected =
    scenario === "static-raw"
      ? "GET"
      : scenario === "dynamic-raw"
        ? "value-42"
        : scenario === "static-json"
          ? JSON.stringify(staticPayload)
          : JSON.stringify(dynamicPayload);

  if (body !== expected) {
    throw new Error(`response body mismatch: expected ${expected}, got ${body}`);
  }

  if (scenario === "static-json" || scenario === "dynamic-json") {
    const mediaType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (mediaType !== "application/json") {
      throw new Error(`JSON media type mismatch: ${mediaType}`);
    }
  }
}

function isStatic(scenario: Scenario): boolean {
  return scenario === "static-raw" || scenario === "static-json";
}

function calibrate(operation: () => void): number {
  let iterations = 1_000;
  while (true) {
    const elapsed = measure(operation, iterations);
    if (elapsed >= MIN_CALIBRATION_MS) {
      return Math.max(1, Math.round((iterations * TARGET_MS) / Math.max(elapsed, 0.001)));
    }
    iterations *= 2;
  }
}

function measure(operation: () => void, iterations: number): number {
  const start = performance.now();
  for (let index = 0; index < iterations; index++) operation();
  return performance.now() - start;
}

interface ParsedArgs {
  readonly cell: string | undefined;
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
  return { cell: entries.get("cell"), probeOnly: entries.get("probe-only") };
}

function required(value: string | undefined, flag: string): string {
  if (value === undefined || value.length === 0) throw new Error(`Missing ${flag}`);
  return value;
}

function assertCell(value: string): asserts value is Cell {
  if (!CELLS.has(value as Cell)) throw new Error(`Unknown CP3-F cell: ${value}`);
}

function assertSync<T>(value: T | PromiseLike<T>, label: string): asserts value is T {
  if (isPromiseLike(value)) throw new Error(`unexpected async ${label}`);
}

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return false;
  return typeof (value as { then?: unknown }).then === "function";
}
