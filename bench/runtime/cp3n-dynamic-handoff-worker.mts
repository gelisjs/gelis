import { Gelis } from "../../src/index.ts";
import { Router } from "../../src/runtime/router.ts";
import { normalizeResponse, runtimeReply } from "../../src/runtime/response.ts";
import { pathnameFromRequestUrl } from "../../src/runtime/url.ts";
import { RUNTIME_ROUTE_PLAIN } from "../../src/runtime/types.ts";

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
const PARAM_VALUE = "value-42";
const STATIC_REQUEST = new Request(STATIC_URL);
const DYNAMIC_REQUEST = new Request(DYNAMIC_URL);

type Cell =
  | "pathname-request-dynamic"
  | "param-request-consume"
  | "normalize-string-stable"
  | "normalize-string-request-param"
  | "normalize-json-stable-param"
  | "normalize-json-request-param"
  | "request-router-static"
  | "request-router-dynamic"
  | "route-handler-stable-static"
  | "route-handler-stable-dynamic"
  | "route-handler-param-dynamic"
  | "pipeline-string-stable-static"
  | "pipeline-string-stable-dynamic"
  | "pipeline-string-param-dynamic"
  | "pipeline-json-stable-static"
  | "pipeline-json-stable-dynamic"
  | "pipeline-json-param-dynamic"
  | "app-fetch-string-stable-static"
  | "app-fetch-string-stable-dynamic"
  | "app-fetch-string-param-dynamic"
  | "app-fetch-json-stable-static"
  | "app-fetch-json-stable-dynamic"
  | "app-fetch-json-param-dynamic";

type Operation = () => number;
type RouteKind = "static" | "dynamic";
type HandlerKind =
  "string-stable" | "string-param" | "json-stable" | "json-param";

interface WorkerResult {
  readonly cell: Cell;
  readonly probeOnly: boolean;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number | null;
  readonly sink: number;
}

interface PreparedCell {
  readonly operation: Operation;
  readonly assertCorrectness: () => void | Promise<void>;
}

const CELLS = new Set<Cell>([
  "pathname-request-dynamic",
  "param-request-consume",
  "normalize-string-stable",
  "normalize-string-request-param",
  "normalize-json-stable-param",
  "normalize-json-request-param",
  "request-router-static",
  "request-router-dynamic",
  "route-handler-stable-static",
  "route-handler-stable-dynamic",
  "route-handler-param-dynamic",
  "pipeline-string-stable-static",
  "pipeline-string-stable-dynamic",
  "pipeline-string-param-dynamic",
  "pipeline-json-stable-static",
  "pipeline-json-stable-dynamic",
  "pipeline-json-param-dynamic",
  "app-fetch-string-stable-static",
  "app-fetch-string-stable-dynamic",
  "app-fetch-string-param-dynamic",
  "app-fetch-json-stable-static",
  "app-fetch-json-stable-dynamic",
  "app-fetch-json-param-dynamic",
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

function prepareCell(cell: Cell): PreparedCell {
  switch (cell) {
    case "pathname-request-dynamic":
      return {
        operation: () => pathnameFromRequestUrl(DYNAMIC_REQUEST.url).length,
        assertCorrectness: () => {
          if (pathnameFromRequestUrl(DYNAMIC_REQUEST.url) !== DYNAMIC_PATH) {
            throw new Error("dynamic request pathname mismatch");
          }
        },
      };

    case "param-request-consume":
      return {
        operation: () => extractRequestParam(DYNAMIC_REQUEST).length,
        assertCorrectness: () => {
          if (extractRequestParam(DYNAMIC_REQUEST) !== PARAM_VALUE) {
            throw new Error("request parameter extraction mismatch");
          }
        },
      };

    case "normalize-string-stable":
      return responseCell(
        () => normalizeResponse(PARAM_VALUE),
        PARAM_VALUE,
        false,
      );

    case "normalize-string-request-param":
      return responseCell(
        () => normalizeResponse(extractRequestParam(DYNAMIC_REQUEST)),
        PARAM_VALUE,
        false,
      );

    case "normalize-json-stable-param":
      return responseCell(
        () => normalizeResponse({ id: PARAM_VALUE }),
        JSON.stringify({ id: PARAM_VALUE }),
        true,
      );

    case "normalize-json-request-param":
      return responseCell(
        () => normalizeResponse({ id: extractRequestParam(DYNAMIC_REQUEST) }),
        JSON.stringify({ id: PARAM_VALUE }),
        true,
      );

    case "request-router-static":
      return requestRouterCell("static");

    case "request-router-dynamic":
      return requestRouterCell("dynamic");

    case "route-handler-stable-static":
      return routeHandlerCell("static", "string-stable");

    case "route-handler-stable-dynamic":
      return routeHandlerCell("dynamic", "string-stable");

    case "route-handler-param-dynamic":
      return routeHandlerCell("dynamic", "string-param");

    case "pipeline-string-stable-static":
      return pipelineCell("static", "string-stable");

    case "pipeline-string-stable-dynamic":
      return pipelineCell("dynamic", "string-stable");

    case "pipeline-string-param-dynamic":
      return pipelineCell("dynamic", "string-param");

    case "pipeline-json-stable-static":
      return pipelineCell("static", "json-stable");

    case "pipeline-json-stable-dynamic":
      return pipelineCell("dynamic", "json-stable");

    case "pipeline-json-param-dynamic":
      return pipelineCell("dynamic", "json-param");

    case "app-fetch-string-stable-static":
      return appFetchCell("static", "string-stable");

    case "app-fetch-string-stable-dynamic":
      return appFetchCell("dynamic", "string-stable");

    case "app-fetch-string-param-dynamic":
      return appFetchCell("dynamic", "string-param");

    case "app-fetch-json-stable-static":
      return appFetchCell("static", "json-stable");

    case "app-fetch-json-stable-dynamic":
      return appFetchCell("dynamic", "json-stable");

    case "app-fetch-json-param-dynamic":
      return appFetchCell("dynamic", "json-param");
  }
}

function responseCell(
  factory: () => Response,
  expectedBody: string,
  expectJson: boolean,
): PreparedCell {
  return {
    operation: () => {
      const response = factory();
      return (
        response.status + (response.headers.get("content-type")?.length ?? 0)
      );
    },
    assertCorrectness: async () => {
      const response = factory();
      await assertResponse(response, expectedBody, expectJson);
    },
  };
}

function requestRouterCell(kind: RouteKind): PreparedCell {
  const dynamic = kind === "dynamic";
  const request = dynamic ? DYNAMIC_REQUEST : STATIC_REQUEST;
  const router = buildRouter(kind, "string-stable");

  const run = () => {
    const pathname = pathnameFromRequestUrl(request.url);
    const match = router.match("GET", pathname);
    if (match === undefined) throw new Error("request-router route miss");
    return match;
  };

  return {
    operation: () => {
      const match = run();
      return (
        match.route.path.length + (dynamic ? (match.params.id?.length ?? 0) : 0)
      );
    },
    assertCorrectness: () => assertMatch(run(), kind),
  };
}

function routeHandlerCell(
  kind: RouteKind,
  handlerKind: HandlerKind,
): PreparedCell {
  const dynamic = kind === "dynamic";
  const request = dynamic ? DYNAMIC_REQUEST : STATIC_REQUEST;
  const router = buildRouter(kind, handlerKind);

  const run = () => {
    const pathname = pathnameFromRequestUrl(request.url);
    const match = router.match("GET", pathname);
    if (match === undefined) throw new Error("route-handler route miss");
    const value = match.route.handler(createContext(request, match.params));
    assertSync(value, "route-handler");
    return value;
  };

  return {
    operation: () => {
      const value = run();
      if (typeof value !== "string")
        throw new Error("route-handler expected string");
      return value.length;
    },
    assertCorrectness: () => {
      const value = run();
      if (value !== PARAM_VALUE)
        throw new Error("route-handler value mismatch");
    },
  };
}

function pipelineCell(kind: RouteKind, handlerKind: HandlerKind): PreparedCell {
  const dynamic = kind === "dynamic";
  const request = dynamic ? DYNAMIC_REQUEST : STATIC_REQUEST;
  const router = buildRouter(kind, handlerKind);
  const expectJson =
    handlerKind === "json-stable" || handlerKind === "json-param";
  const expectedBody = expectJson
    ? JSON.stringify({ id: PARAM_VALUE })
    : PARAM_VALUE;

  const run = (): Response => {
    const pathname = pathnameFromRequestUrl(request.url);
    const match = router.match("GET", pathname);
    if (match === undefined) throw new Error("pipeline route miss");
    const value = match.route.handler(createContext(request, match.params));
    assertSync(value, "pipeline handler");
    return normalizeResponse(value);
  };

  return {
    operation: () => run().status,
    assertCorrectness: async () => {
      await assertResponse(run(), expectedBody, expectJson);
    },
  };
}

function appFetchCell(kind: RouteKind, handlerKind: HandlerKind): PreparedCell {
  const dynamic = kind === "dynamic";
  const request = dynamic ? DYNAMIC_REQUEST : STATIC_REQUEST;
  const app = buildApp(kind, handlerKind);
  const expectJson =
    handlerKind === "json-stable" || handlerKind === "json-param";
  const expectedBody = expectJson
    ? JSON.stringify({ id: PARAM_VALUE })
    : PARAM_VALUE;

  const run = (): Response => {
    const response = app.fetch(request);
    assertSync(response, "app.fetch");
    return response;
  };

  return {
    operation: () => run().status,
    assertCorrectness: async () => {
      await assertResponse(run(), expectedBody, expectJson);
    },
  };
}

function buildRouter(kind: RouteKind, handlerKind: HandlerKind): Router {
  const router = new Router();

  for (let index = 0; index < ROUTES; index++) {
    router.register(createRoute(kind, handlerKind, index));
  }

  return router;
}

function buildApp(kind: RouteKind, handlerKind: HandlerKind): Gelis {
  const app = new Gelis();

  for (let index = 0; index < ROUTES; index++) {
    if (kind === "static") {
      const path = `/r/${index}` as `/r/${number}`;

      if (handlerKind === "string-stable") {
        app.get(path, () => PARAM_VALUE);
      } else if (handlerKind === "json-stable") {
        app.get(path, () => ({ id: PARAM_VALUE }));
      } else {
        throw new Error(`${handlerKind} requires dynamic route`);
      }

      continue;
    }

    const path = `/r/${index}/:id` as `/r/${number}/:id`;

    if (handlerKind === "string-stable") {
      app.get(path, () => PARAM_VALUE);
    } else if (handlerKind === "string-param") {
      app.get(path, ({ params }) => params.id);
    } else if (handlerKind === "json-stable") {
      app.get(path, () => ({ id: PARAM_VALUE }));
    } else {
      app.get(path, ({ params }) => ({ id: params.id }));
    }
  }

  return app;
}

function createRoute(
  kind: RouteKind,
  handlerKind: HandlerKind,
  index: number,
): RuntimeRouteRecord {
  const path = kind === "static" ? `/r/${index}` : `/r/${index}/:id`;
  let handler: RuntimeRouteHandler;

  if (handlerKind === "string-stable") {
    handler = () => PARAM_VALUE;
  } else if (handlerKind === "string-param") {
    if (kind !== "dynamic")
      throw new Error("string-param requires dynamic route");
    handler = ({ params }) => params.id;
  } else if (handlerKind === "json-stable") {
    handler = () => ({ id: PARAM_VALUE });
  } else {
    if (kind !== "dynamic")
      throw new Error("json-param requires dynamic route");
    handler = ({ params }) => ({ id: params.id });
  }

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

function extractRequestParam(request: Request): string {
  const pathname = pathnameFromRequestUrl(request.url);
  const slash = pathname.lastIndexOf("/");
  const value = pathname.slice(slash + 1);
  return value.includes("%") ? decodeURIComponent(value) : value;
}

function assertMatch(
  match: { route: RuntimeRouteRecord; params: Record<string, string> },
  kind: RouteKind,
): void {
  if (kind === "static") {
    if (match.route.path !== STATIC_PATH) {
      throw new Error(`static route mismatch: ${match.route.path}`);
    }
    if (Object.keys(match.params).length !== 0) {
      throw new Error("static route unexpectedly produced params");
    }
    return;
  }

  if (match.route.path !== `/r/${LAST}/:id`) {
    throw new Error(`dynamic route mismatch: ${match.route.path}`);
  }
  if (match.params.id !== PARAM_VALUE) {
    throw new Error(`dynamic param mismatch: ${match.params.id}`);
  }
}

async function assertResponse(
  response: Response,
  expectedBody: string,
  expectJson: boolean,
): Promise<void> {
  if (response.status !== 200) {
    throw new Error(`response status mismatch: ${response.status}`);
  }

  const body = await response.text();
  if (body !== expectedBody) {
    throw new Error(
      `response body mismatch: expected ${expectedBody}, got ${body}`,
    );
  }

  if (expectJson) {
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

function assertCell(value: string): asserts value is Cell {
  if (!CELLS.has(value as Cell)) {
    throw new Error(`Unknown CP3-N cell: ${value}`);
  }
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
