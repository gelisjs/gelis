import { Router } from "../../src/runtime/router.ts";
import { runtimeReply } from "../../src/runtime/response.ts";
import { pathnameFromUrl } from "../../src/runtime/url.ts";
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
const DYNAMIC_PREFIX = `/r/${LAST}/`;
const STATIC_URL = `http://gelis.test${STATIC_PATH}`;
const DYNAMIC_URL = `http://gelis.test${DYNAMIC_PATH}`;
const PARAM_VALUE = "value-42";

export type Cell =
  | "request-url-static"
  | "request-url-dynamic"
  | "pathname-constant-static"
  | "pathname-constant-dynamic"
  | "pathname-request-static"
  | "pathname-request-dynamic"
  | "map-static-stable"
  | "map-static-request"
  | "map-trailing-stable"
  | "map-trailing-request"
  | "router-static-stable"
  | "router-dynamic-stable"
  | "router-static-request"
  | "router-dynamic-request"
  | "dispatch-prepath-static"
  | "dispatch-prepath-dynamic"
  | "dispatch-request-static"
  | "dispatch-request-dynamic";

const CELLS = new Set<Cell>([
  "request-url-static",
  "request-url-dynamic",
  "pathname-constant-static",
  "pathname-constant-dynamic",
  "pathname-request-static",
  "pathname-request-dynamic",
  "map-static-stable",
  "map-static-request",
  "map-trailing-stable",
  "map-trailing-request",
  "router-static-stable",
  "router-dynamic-stable",
  "router-static-request",
  "router-dynamic-request",
  "dispatch-prepath-static",
  "dispatch-prepath-dynamic",
  "dispatch-request-static",
  "dispatch-request-dynamic",
]);

interface WorkerResult {
  readonly cell: Cell;
  readonly probeOnly: boolean;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number | null;
  readonly sink: number;
}

type Operation = () => number;

type PreparedCell = {
  readonly operation: Operation;
  readonly assertCorrectness: () => void;
};

const staticRequest = new Request(STATIC_URL);
const dynamicRequest = new Request(DYNAMIC_URL);
const staticMap = buildStaticMap();
const trailingMap = buildTrailingMap();
const staticRouter = buildRouter("static");
const dynamicRouter = buildRouter("dynamic");

const args = readArgs(process.argv.slice(2));
const requestedCell = required(args.cell, "--cell");
assertCell(requestedCell);
const cell = requestedCell;
const probeOnly = args.probeOnly === "true";
const prepared = prepareCell(cell);
prepared.assertCorrectness();

if (probeOnly) {
  const result: WorkerResult = {
    cell,
    probeOnly: true,
    iterations: 0,
    warmups: 0,
    nsPerOp: null,
    sink: prepared.operation(),
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
    case "request-url-static":
      return {
        operation: () => staticRequest.url.length,
        assertCorrectness: () => {
          if (staticRequest.url !== STATIC_URL) {
            throw new Error("static request URL mismatch");
          }
        },
      };

    case "request-url-dynamic":
      return {
        operation: () => dynamicRequest.url.length,
        assertCorrectness: () => {
          if (dynamicRequest.url !== DYNAMIC_URL) {
            throw new Error("dynamic request URL mismatch");
          }
        },
      };

    case "pathname-constant-static":
      return pathnameCell(STATIC_URL, STATIC_PATH);

    case "pathname-constant-dynamic":
      return pathnameCell(DYNAMIC_URL, DYNAMIC_PATH);

    case "pathname-request-static":
      return requestPathnameCell(staticRequest, STATIC_PATH);

    case "pathname-request-dynamic":
      return requestPathnameCell(dynamicRequest, DYNAMIC_PATH);

    case "map-static-stable":
      return {
        operation: () => staticMap.get(STATIC_PATH) ?? -1,
        assertCorrectness: () => {
          if (staticMap.get(STATIC_PATH) !== LAST) {
            throw new Error("stable static map mismatch");
          }
        },
      };

    case "map-static-request":
      return {
        operation: () => {
          const path = pathnameFromUrl(staticRequest.url);
          return staticMap.get(path) ?? -1;
        },
        assertCorrectness: () => {
          const path = pathnameFromUrl(staticRequest.url);
          if (staticMap.get(path) !== LAST) {
            throw new Error("request static map mismatch");
          }
        },
      };

    case "map-trailing-stable":
      return {
        operation: () => trailingMap.get(DYNAMIC_PREFIX) ?? -1,
        assertCorrectness: () => {
          if (trailingMap.get(DYNAMIC_PREFIX) !== LAST) {
            throw new Error("stable trailing map mismatch");
          }
        },
      };

    case "map-trailing-request":
      return {
        operation: () => {
          const path = pathnameFromUrl(dynamicRequest.url);
          const slash = path.lastIndexOf("/");
          const prefix = path.slice(0, slash + 1);
          return trailingMap.get(prefix) ?? -1;
        },
        assertCorrectness: () => {
          const path = pathnameFromUrl(dynamicRequest.url);
          const slash = path.lastIndexOf("/");
          const prefix = path.slice(0, slash + 1);
          if (trailingMap.get(prefix) !== LAST) {
            throw new Error("request trailing map mismatch");
          }
        },
      };

    case "router-static-stable":
      return routerStableCell(staticRouter, STATIC_PATH, false);

    case "router-dynamic-stable":
      return routerStableCell(dynamicRouter, DYNAMIC_PATH, true);

    case "router-static-request":
      return routerRequestCell(staticRouter, staticRequest, false);

    case "router-dynamic-request":
      return routerRequestCell(dynamicRouter, dynamicRequest, true);

    case "dispatch-prepath-static":
      return dispatchCell(
        staticRouter,
        staticRequest,
        STATIC_PATH,
        false,
        false,
      );

    case "dispatch-prepath-dynamic":
      return dispatchCell(
        dynamicRouter,
        dynamicRequest,
        DYNAMIC_PATH,
        true,
        false,
      );

    case "dispatch-request-static":
      return dispatchCell(
        staticRouter,
        staticRequest,
        STATIC_PATH,
        false,
        true,
      );

    case "dispatch-request-dynamic":
      return dispatchCell(
        dynamicRouter,
        dynamicRequest,
        DYNAMIC_PATH,
        true,
        true,
      );
  }
}

function pathnameCell(url: string, expected: string): PreparedCell {
  return {
    operation: () => pathnameFromUrl(url).length,
    assertCorrectness: () => {
      if (pathnameFromUrl(url) !== expected) {
        throw new Error(`constant pathname mismatch for ${expected}`);
      }
    },
  };
}

function requestPathnameCell(request: Request, expected: string): PreparedCell {
  return {
    operation: () => pathnameFromUrl(request.url).length,
    assertCorrectness: () => {
      if (pathnameFromUrl(request.url) !== expected) {
        throw new Error(`request pathname mismatch for ${expected}`);
      }
    },
  };
}

function routerStableCell(
  router: Router,
  pathname: string,
  dynamic: boolean,
): PreparedCell {
  return {
    operation: () => consumeMatch(router.match("GET", pathname), dynamic),
    assertCorrectness: () => assertRouterMatch(router, pathname, dynamic),
  };
}

function routerRequestCell(
  router: Router,
  request: Request,
  dynamic: boolean,
): PreparedCell {
  const expected = dynamic ? DYNAMIC_PATH : STATIC_PATH;

  return {
    operation: () => {
      const pathname = pathnameFromUrl(request.url);
      return consumeMatch(router.match("GET", pathname), dynamic);
    },
    assertCorrectness: () => {
      const pathname = pathnameFromUrl(request.url);
      if (pathname !== expected) {
        throw new Error("router request pathname mismatch");
      }
      assertRouterMatch(router, pathname, dynamic);
    },
  };
}

function dispatchCell(
  router: Router,
  request: Request,
  stablePathname: string,
  dynamic: boolean,
  fromRequest: boolean,
): PreparedCell {
  const run = (): unknown => {
    const pathname = fromRequest
      ? pathnameFromUrl(request.url)
      : stablePathname;
    const match = router.match("GET", pathname);
    if (match === undefined) {
      throw new Error("dispatch route miss");
    }

    const result = match.route.handler(createContext(request, match.params));
    assertSync(result, "dispatch handler");
    return result;
  };

  return {
    operation: () => consumePayload(run(), dynamic),
    assertCorrectness: () => {
      assertRouterMatch(router, stablePathname, dynamic);
      const result = run();
      if (dynamic) {
        const payload = result as { method: string; id: string | undefined };
        if (payload.method !== "GET" || payload.id !== PARAM_VALUE) {
          throw new Error("dynamic dispatch payload mismatch");
        }
      } else {
        const payload = result as { method: string; route: number };
        if (payload.method !== "GET" || payload.route !== LAST) {
          throw new Error("static dispatch payload mismatch");
        }
      }
    },
  };
}

function consumeMatch(
  match: ReturnType<Router["match"]>,
  dynamic: boolean,
): number {
  if (match === undefined) {
    return 0;
  }

  return (
    match.route.path.length + (dynamic ? (match.params.id?.length ?? 0) : 0)
  );
}

function consumePayload(value: unknown, dynamic: boolean): number {
  if (dynamic) {
    return (value as { id: string }).id.length;
  }

  return (value as { route: number }).route;
}

function buildStaticMap(): Map<string, number> {
  const map = new Map<string, number>();
  for (let index = 0; index < ROUTES; index++) {
    map.set(`/r/${index}`, index);
  }
  return map;
}

function buildTrailingMap(): Map<string, number> {
  const map = new Map<string, number>();
  for (let index = 0; index < ROUTES; index++) {
    map.set(`/r/${index}/`, index);
  }
  return map;
}

function buildRouter(kind: "static" | "dynamic"): Router {
  const router = new Router();
  for (let index = 0; index < ROUTES; index++) {
    router.register(createRoute(kind, index));
  }
  return router;
}

function createRoute(
  kind: "static" | "dynamic",
  index: number,
): RuntimeRouteRecord {
  const path = kind === "static" ? `/r/${index}` : `/r/${index}/:id`;
  const handler: RuntimeRouteHandler =
    kind === "static"
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

function assertRouterMatch(
  router: Router,
  pathname: string,
  dynamic: boolean,
): void {
  const match = router.match("GET", pathname);
  if (match === undefined) {
    throw new Error("router correctness miss");
  }

  if (dynamic) {
    if (match.route.path !== `/r/${LAST}/:id`) {
      throw new Error(`dynamic route mismatch: ${match.route.path}`);
    }
    if (match.params.id !== PARAM_VALUE) {
      throw new Error(`dynamic param mismatch: ${match.params.id}`);
    }
    return;
  }

  if (match.route.path !== STATIC_PATH) {
    throw new Error(`static route mismatch: ${match.route.path}`);
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
    throw new Error(`Unknown CP3-H cell: ${value}`);
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
