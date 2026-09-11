import { Gelis } from "../../../src";
import { Router } from "../../../src/runtime/router";
import { normalizeResponse, runtimeReply } from "../../../src/runtime/response";
import { RUNTIME_ROUTE_PLAIN } from "../../../src/runtime/types";
import { pathnameFromUrl } from "../../../src/runtime/url";

import type {
  RuntimeRouteContext,
  RuntimeRouteHandler,
  RuntimeRouteRecord,
} from "../../../src/runtime/types";

const ROUTES = 5_000;
const LAST = ROUTES - 1;
const WARMUP = 20_000;
const TARGET_MS = 120;
const MIN_CALIBRATION_MS = 20;

const STATIC_PATH = `/r/${LAST}`;
const DYNAMIC_PATH = `/r/${LAST}/value-42`;
const STATIC_URL = `http://gelis.test${STATIC_PATH}`;
const DYNAMIC_URL = `http://gelis.test${DYNAMIC_PATH}`;
const JSON_HEADERS = { "content-type": "application/json" } as const;
const EMPTY_PARAMS = Object.freeze({}) as Record<string, string>;
const DYNAMIC_PARAMS = Object.freeze({ id: "value-42" }) as Record<
  string,
  string
>;

const staticPayload = { method: "GET", route: LAST } as const;
const dynamicPayload = { method: "GET", id: "value-42" } as const;
const staticJson = JSON.stringify(staticPayload);
const dynamicJson = JSON.stringify(dynamicPayload);

type Scenario =
  | "static-raw"
  | "dynamic-raw"
  | "static-json"
  | "dynamic-json";

type Stage =
  | "url-router"
  | "url-router-handler"
  | "url-router-handler-normalize"
  | "app-fetch";

type PrimitiveCell =
  | "pathname"
  | "router-static"
  | "router-dynamic"
  | "handler-static-json"
  | "handler-dynamic-json"
  | "json-stringify-static"
  | "json-stringify-dynamic"
  | "response-json-static"
  | "response-json-dynamic"
  | "response-preserialized-static"
  | "response-preserialized-dynamic"
  | "normalize-static-json"
  | "normalize-dynamic-json"
  | "response-raw-static"
  | "response-raw-dynamic"
  | "normalize-existing-response";

type Cell = PrimitiveCell | `${Scenario}::${Stage}`;
type Operation = () => number;

interface WorkerResult {
  readonly cell: Cell;
  readonly probeOnly: boolean;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number | null;
  readonly sink: number;
}

interface ResponseSnapshot {
  readonly status: number;
  readonly body: string;
  readonly mediaType: string;
}

const PRIMITIVE_CELLS = new Set<PrimitiveCell>([
  "pathname",
  "router-static",
  "router-dynamic",
  "handler-static-json",
  "handler-dynamic-json",
  "json-stringify-static",
  "json-stringify-dynamic",
  "response-json-static",
  "response-json-dynamic",
  "response-preserialized-static",
  "response-preserialized-dynamic",
  "normalize-static-json",
  "normalize-dynamic-json",
  "response-raw-static",
  "response-raw-dynamic",
  "normalize-existing-response",
]);

const SCENARIOS = new Set<Scenario>([
  "static-raw",
  "dynamic-raw",
  "static-json",
  "dynamic-json",
]);

const STAGES = new Set<Stage>([
  "url-router",
  "url-router-handler",
  "url-router-handler-normalize",
  "app-fetch",
]);

const args = readArgs(process.argv.slice(2));
const requestedCell = required(args.cell, "--cell");
assertCell(requestedCell);
const cell = requestedCell;
const probeOnly = args.probeOnly === "true";

const prepared = prepareCell(cell);
await prepared.assertCorrectness();

if (probeOnly) {
  const result: WorkerResult = {
    cell,
    probeOnly: true,
    iterations: 0,
    warmups: 0,
    nsPerOp: null,
    sink: 0,
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
    sink,
  };
  console.log(JSON.stringify(result));
}

function prepareCell(cell: Cell): {
  readonly operation: Operation;
  readonly assertCorrectness: () => void | Promise<void>;
} {
  if (isIntegratedCell(cell)) {
    const [scenario, stage] = cell.split("::") as [Scenario, Stage];
    return prepareIntegrated(scenario, stage);
  }

  switch (cell) {
    case "pathname":
      return {
        operation: () => pathnameFromUrl(DYNAMIC_URL).length,
        assertCorrectness: () => {
          const pathname = pathnameFromUrl(DYNAMIC_URL);
          if (pathname !== DYNAMIC_PATH) {
            throw new Error(`pathname mismatch: ${pathname}`);
          }
        },
      };

    case "router-static": {
      const router = buildRouter("static-json");
      return {
        operation: () => {
          const match = router.match("GET", STATIC_PATH);
          return match === undefined
            ? 0
            : match.route.path.length + Object.keys(match.params).length;
        },
        assertCorrectness: () => assertRouterMatch(router, "static-json"),
      };
    }

    case "router-dynamic": {
      const router = buildRouter("dynamic-json");
      return {
        operation: () => {
          const match = router.match("GET", DYNAMIC_PATH);
          return match === undefined
            ? 0
            : match.route.path.length + (match.params.id?.length ?? 0);
        },
        assertCorrectness: () => assertRouterMatch(router, "dynamic-json"),
      };
    }

    case "handler-static-json": {
      const request = new Request(STATIC_URL);
      const handler: RuntimeRouteHandler = ({ request }) => ({
        method: request.method,
        route: LAST,
      });
      return {
        operation: () => {
          const value = handler(createContext(request, EMPTY_PARAMS));
          assertSync(value, "handler-static-json");
          return (value as { route: number }).route;
        },
        assertCorrectness: () => {
          const value = handler(createContext(request, EMPTY_PARAMS));
          assertSync(value, "handler-static-json");
          assertJsonPayload(value, "static-json");
        },
      };
    }

    case "handler-dynamic-json": {
      const request = new Request(DYNAMIC_URL);
      const handler: RuntimeRouteHandler = ({ request, params }) => ({
        method: request.method,
        id: params.id,
      });
      return {
        operation: () => {
          const value = handler(createContext(request, DYNAMIC_PARAMS));
          assertSync(value, "handler-dynamic-json");
          return (value as { id: string }).id.length;
        },
        assertCorrectness: () => {
          const value = handler(createContext(request, DYNAMIC_PARAMS));
          assertSync(value, "handler-dynamic-json");
          assertJsonPayload(value, "dynamic-json");
        },
      };
    }

    case "json-stringify-static":
      return {
        operation: () => JSON.stringify(staticPayload).length,
        assertCorrectness: () => {
          if (JSON.stringify(staticPayload) !== staticJson) {
            throw new Error("static JSON.stringify mismatch");
          }
        },
      };

    case "json-stringify-dynamic":
      return {
        operation: () => JSON.stringify(dynamicPayload).length,
        assertCorrectness: () => {
          if (JSON.stringify(dynamicPayload) !== dynamicJson) {
            throw new Error("dynamic JSON.stringify mismatch");
          }
        },
      };

    case "response-json-static":
      return responseFactoryCell(
        () => Response.json(staticPayload),
        "static-json",
      );

    case "response-json-dynamic":
      return responseFactoryCell(
        () => Response.json(dynamicPayload),
        "dynamic-json",
      );

    case "response-preserialized-static":
      return responseFactoryCell(
        () => new Response(staticJson, { headers: JSON_HEADERS }),
        "static-json",
      );

    case "response-preserialized-dynamic":
      return responseFactoryCell(
        () => new Response(dynamicJson, { headers: JSON_HEADERS }),
        "dynamic-json",
      );

    case "normalize-static-json":
      return responseFactoryCell(
        () => normalizeResponse(staticPayload),
        "static-json",
      );

    case "normalize-dynamic-json":
      return responseFactoryCell(
        () => normalizeResponse(dynamicPayload),
        "dynamic-json",
      );

    case "response-raw-static":
      return responseFactoryCell(() => new Response("GET"), "static-raw");

    case "response-raw-dynamic":
      return responseFactoryCell(
        () => new Response("value-42"),
        "dynamic-raw",
      );

    case "normalize-existing-response": {
      const response = new Response("GET");
      return {
        operation: () => {
          const normalized = normalizeResponse(response);
          return normalized === response ? normalized.status : -1;
        },
        assertCorrectness: () => {
          if (normalizeResponse(response) !== response) {
            throw new Error("normalizeResponse did not preserve Response identity");
          }
        },
      };
    }
  }
}

function prepareIntegrated(
  scenario: Scenario,
  stage: Stage,
): {
  readonly operation: Operation;
  readonly assertCorrectness: () => Promise<void>;
} {
  const request = new Request(isStatic(scenario) ? STATIC_URL : DYNAMIC_URL);
  const router = buildRouter(scenario);
  const app = buildApp(scenario);

  const matchRoute = () => {
    const pathname = pathnameFromUrl(request.url);
    const match = router.match("GET", pathname);
    if (match === undefined) throw new Error("manual pipeline route miss");
    return match;
  };

  const invokeHandler = () => {
    const match = matchRoute();
    const result = match.route.handler(createContext(request, match.params));
    assertSync(result, "manual pipeline handler");
    return result;
  };

  const manualFinal = () => normalizeResponse(invokeHandler());

  const operation: Operation =
    stage === "url-router"
      ? () => {
          const match = matchRoute();
          return match.route.path.length + (match.params.id?.length ?? 0);
        }
      : stage === "url-router-handler"
        ? () => consumeHandlerResult(invokeHandler(), scenario)
        : stage === "url-router-handler-normalize"
          ? () => manualFinal().status
          : () => {
              const response = app.fetch(request);
              assertSync(response, "app.fetch");
              return response.status;
            };

  return {
    operation,
    assertCorrectness: async () => {
      assertRouterMatch(router, scenario);

      const manualResponse = manualFinal();
      const appResponse = app.fetch(request);
      assertSync(appResponse, "app.fetch correctness path");

      const manualSnapshot = await responseSnapshot(manualResponse);
      const appSnapshot = await responseSnapshot(appResponse);

      assertScenarioResponse(manualSnapshot, scenario, "manual pipeline");
      assertScenarioResponse(appSnapshot, scenario, "app.fetch");

      if (
        manualSnapshot.status !== appSnapshot.status ||
        manualSnapshot.body !== appSnapshot.body
      ) {
        throw new Error("manual pipeline and app.fetch are not byte-equivalent");
      }

      if (stage === "url-router-handler") {
        await assertHandlerResult(invokeHandler(), scenario);
      }
    },
  };
}

function buildRouter(scenario: Scenario): Router {
  const router = new Router();
  for (let index = 0; index < ROUTES; index++) {
    router.register(createRoute(scenario, index));
  }
  return router;
}

function buildApp(scenario: Scenario): Gelis {
  const app = new Gelis();

  for (let index = 0; index < ROUTES; index++) {
    if (isStatic(scenario)) {
      const path = `/r/${index}` as `/r/${number}`;
      app.get(path, ({ request }) =>
        scenario === "static-raw"
          ? new Response(request.method)
          : { method: request.method, route: index },
      );
    } else {
      const path = `/r/${index}/:id` as `/r/${number}/:id`;
      app.get(path, ({ request, params }) =>
        scenario === "dynamic-raw"
          ? new Response(params.id)
          : { method: request.method, id: params.id },
      );
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
          : ({ request, params }) => ({
              method: request.method,
              id: params.id,
            });

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

function responseFactoryCell(
  factory: () => Response,
  scenario: Scenario,
): {
  readonly operation: Operation;
  readonly assertCorrectness: () => Promise<void>;
} {
  return {
    operation: () => {
      const response = factory();
      return response.status + (response.headers.get("content-type")?.length ?? 0);
    },
    assertCorrectness: async () => {
      const snapshot = await responseSnapshot(factory());
      assertScenarioResponse(snapshot, scenario, "response primitive");
    },
  };
}

function assertRouterMatch(router: Router, scenario: Scenario): void {
  const dynamic = !isStatic(scenario);
  const match = router.match("GET", dynamic ? DYNAMIC_PATH : STATIC_PATH);
  if (match === undefined) throw new Error("router correctness miss");

  const expectedPath = dynamic ? `/r/${LAST}/:id` : STATIC_PATH;
  if (match.route.path !== expectedPath) {
    throw new Error(`router resolved wrong route: ${match.route.path}`);
  }

  if (dynamic && match.params.id !== "value-42") {
    throw new Error(`router param mismatch: ${match.params.id}`);
  }

  if (!dynamic && Object.keys(match.params).length !== 0) {
    throw new Error("static router unexpectedly produced params");
  }
}

function consumeHandlerResult(result: unknown, scenario: Scenario): number {
  if (result instanceof Response) return result.status;
  return scenario === "static-json"
    ? (result as { route: number }).route
    : (result as { id: string }).id.length;
}

async function assertHandlerResult(
  result: unknown,
  scenario: Scenario,
): Promise<void> {
  if (isRaw(scenario)) {
    if (!(result instanceof Response)) {
      throw new Error("raw handler did not return Response");
    }
    assertScenarioResponse(
      await responseSnapshot(result),
      scenario,
      "raw handler",
    );
    return;
  }

  assertJsonPayload(result, scenario);
}

function assertJsonPayload(value: unknown, scenario: Scenario): void {
  const expected = scenario === "static-json" ? staticJson : dynamicJson;
  const actual = JSON.stringify(value);
  if (actual !== expected) {
    throw new Error(`handler payload mismatch: expected ${expected}, got ${actual}`);
  }
}

async function responseSnapshot(response: Response): Promise<ResponseSnapshot> {
  return {
    status: response.status,
    body: await response.text(),
    mediaType: mediaType(response),
  };
}

function assertScenarioResponse(
  snapshot: ResponseSnapshot,
  scenario: Scenario,
  label: string,
): void {
  if (snapshot.status !== 200) {
    throw new Error(`${label} status mismatch: ${snapshot.status}`);
  }

  const expectedBody =
    scenario === "static-raw"
      ? "GET"
      : scenario === "dynamic-raw"
        ? "value-42"
        : scenario === "static-json"
          ? staticJson
          : dynamicJson;

  if (snapshot.body !== expectedBody) {
    throw new Error(`${label} body mismatch: ${snapshot.body}`);
  }

  if (isRaw(scenario)) {
    if (snapshot.mediaType !== "" && snapshot.mediaType !== "text/plain") {
      throw new Error(`${label} raw media type mismatch: ${snapshot.mediaType}`);
    }
  } else if (snapshot.mediaType !== "application/json") {
    throw new Error(`${label} JSON media type mismatch: ${snapshot.mediaType}`);
  }
}

function mediaType(response: Response): string {
  return (
    response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() ?? ""
  );
}

function calibrate(operation: () => void): number {
  let iterations = 1_000;
  while (true) {
    const elapsed = measure(operation, iterations);
    if (elapsed >= MIN_CALIBRATION_MS) {
      return Math.max(
        1,
        Math.round((iterations * TARGET_MS) / Math.max(elapsed, 0.001)),
      );
    }
    iterations *= 2;
  }
}

function measure(operation: () => void, iterations: number): number {
  const start = performance.now();
  for (let index = 0; index < iterations; index++) operation();
  return performance.now() - start;
}

function isStatic(scenario: Scenario): boolean {
  return scenario === "static-raw" || scenario === "static-json";
}

function isRaw(scenario: Scenario): boolean {
  return scenario === "static-raw" || scenario === "dynamic-raw";
}

function isIntegratedCell(value: string): value is `${Scenario}::${Stage}` {
  return value.includes("::");
}

function assertCell(value: string): asserts value is Cell {
  if (PRIMITIVE_CELLS.has(value as PrimitiveCell)) return;

  const [scenario, stage, extra] = value.split("::");
  if (
    extra === undefined &&
    SCENARIOS.has(scenario as Scenario) &&
    STAGES.has(stage as Stage)
  ) {
    return;
  }

  throw new Error(`Unknown CP3-A cell: ${value}`);
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
  return {
    cell: entries.get("cell"),
    probeOnly: entries.get("probe-only"),
  };
}

function required(value: string | undefined, flag: string): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing ${flag}`);
  }
  return value;
}

function assertSync<T>(
  value: T | PromiseLike<T>,
  label: string,
): asserts value is T {
  if (isPromiseLike(value)) {
    throw new Error(`unexpected async ${label}`);
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
