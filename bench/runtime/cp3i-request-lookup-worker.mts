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
const STATIC_URL = `http://gelis.test${STATIC_PATH}`;
const DYNAMIC_URL = `http://gelis.test${DYNAMIC_PATH}`;
const PARAM_VALUE = "value-42";

export type Cell =
  | "bounds-fast-static"
  | "bounds-fast-dynamic"
  | "pathname-current-static"
  | "pathname-current-dynamic"
  | "pathname-minimal-static"
  | "pathname-minimal-dynamic"
  | "map-static-request"
  | "object-static-request"
  | "map-trailing-request"
  | "object-trailing-request"
  | "router-trailing-stable"
  | "router-generic-stable"
  | "router-trailing-request"
  | "router-generic-request"
  | "dispatch-trailing-stable"
  | "dispatch-generic-stable"
  | "dispatch-trailing-request"
  | "dispatch-generic-request";

const CELLS = new Set<Cell>([
  "bounds-fast-static",
  "bounds-fast-dynamic",
  "pathname-current-static",
  "pathname-current-dynamic",
  "pathname-minimal-static",
  "pathname-minimal-dynamic",
  "map-static-request",
  "object-static-request",
  "map-trailing-request",
  "object-trailing-request",
  "router-trailing-stable",
  "router-generic-stable",
  "router-trailing-request",
  "router-generic-request",
  "dispatch-trailing-stable",
  "dispatch-generic-stable",
  "dispatch-trailing-request",
  "dispatch-generic-request",
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
const staticObject = buildStaticObject();
const trailingMap = buildTrailingMap();
const trailingObject = buildTrailingObject();
const trailingRouter = buildTrailingRouter();
const genericRouter = buildGenericRouter();

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
    case "bounds-fast-static":
      return boundsCell(staticRequest, STATIC_PATH);

    case "bounds-fast-dynamic":
      return boundsCell(dynamicRequest, DYNAMIC_PATH);

    case "pathname-current-static":
      return pathnameCurrentCell(staticRequest, STATIC_PATH);

    case "pathname-current-dynamic":
      return pathnameCurrentCell(dynamicRequest, DYNAMIC_PATH);

    case "pathname-minimal-static":
      return pathnameMinimalCell(staticRequest, STATIC_PATH);

    case "pathname-minimal-dynamic":
      return pathnameMinimalCell(dynamicRequest, DYNAMIC_PATH);

    case "map-static-request":
      return staticLookupCell(staticMap, staticRequest);

    case "object-static-request":
      return staticObjectLookupCell(staticObject, staticRequest);

    case "map-trailing-request":
      return trailingLookupCell(trailingMap, dynamicRequest);

    case "object-trailing-request":
      return trailingObjectLookupCell(trailingObject, dynamicRequest);

    case "router-trailing-stable":
      return routerCell(trailingRouter, false, false);

    case "router-generic-stable":
      return routerCell(genericRouter, false, true);

    case "router-trailing-request":
      return routerCell(trailingRouter, true, false);

    case "router-generic-request":
      return routerCell(genericRouter, true, true);

    case "dispatch-trailing-stable":
      return dispatchCell(trailingRouter, false, false);

    case "dispatch-generic-stable":
      return dispatchCell(genericRouter, false, true);

    case "dispatch-trailing-request":
      return dispatchCell(trailingRouter, true, false);

    case "dispatch-generic-request":
      return dispatchCell(genericRouter, true, true);
  }
}

function boundsCell(request: Request, expected: string): PreparedCell {
  return {
    operation: () => fastBoundsScore(request.url),
    assertCorrectness: () => {
      const url = request.url;
      const start = url.indexOf("/", 8);
      const query = start === -1 ? -1 : url.indexOf("?", start + 1);
      const end = query === -1 ? url.length : query;
      const path = start === -1 ? "/" : url.slice(start, end);
      if (path !== expected) {
        throw new Error(`fast bounds mismatch for ${expected}: ${path}`);
      }
    },
  };
}

function pathnameCurrentCell(request: Request, expected: string): PreparedCell {
  return {
    operation: () => pathnameFromUrl(request.url).length,
    assertCorrectness: () => {
      const path = pathnameFromUrl(request.url);
      if (path !== expected) {
        throw new Error(`current pathname mismatch for ${expected}: ${path}`);
      }
    },
  };
}

function pathnameMinimalCell(request: Request, expected: string): PreparedCell {
  return {
    operation: () => minimalRequestPathname(request.url).length,
    assertCorrectness: () => {
      const path = minimalRequestPathname(request.url);
      if (path !== expected) {
        throw new Error(`minimal pathname mismatch for ${expected}: ${path}`);
      }
    },
  };
}

function staticLookupCell(
  lookup: Map<string, number>,
  request: Request,
): PreparedCell {
  return {
    operation: () => {
      const path = pathnameFromUrl(request.url);
      return lookup.get(path) ?? -1;
    },
    assertCorrectness: () => {
      const path = pathnameFromUrl(request.url);
      if (lookup.get(path) !== LAST) {
        throw new Error("static Map lookup mismatch");
      }
    },
  };
}

function staticObjectLookupCell(
  lookup: Record<string, number>,
  request: Request,
): PreparedCell {
  return {
    operation: () => {
      const path = pathnameFromUrl(request.url);
      return lookup[path] ?? -1;
    },
    assertCorrectness: () => {
      const path = pathnameFromUrl(request.url);
      if (lookup[path] !== LAST) {
        throw new Error("static object lookup mismatch");
      }
    },
  };
}

function trailingLookupCell(
  lookup: Map<string, number>,
  request: Request,
): PreparedCell {
  return {
    operation: () => {
      const path = pathnameFromUrl(request.url);
      const slash = path.lastIndexOf("/");
      const prefix = path.slice(0, slash + 1);
      return lookup.get(prefix) ?? -1;
    },
    assertCorrectness: () => {
      const path = pathnameFromUrl(request.url);
      const slash = path.lastIndexOf("/");
      const prefix = path.slice(0, slash + 1);
      if (lookup.get(prefix) !== LAST) {
        throw new Error("trailing Map lookup mismatch");
      }
    },
  };
}

function trailingObjectLookupCell(
  lookup: Record<string, number>,
  request: Request,
): PreparedCell {
  return {
    operation: () => {
      const path = pathnameFromUrl(request.url);
      const slash = path.lastIndexOf("/");
      const prefix = path.slice(0, slash + 1);
      return lookup[prefix] ?? -1;
    },
    assertCorrectness: () => {
      const path = pathnameFromUrl(request.url);
      const slash = path.lastIndexOf("/");
      const prefix = path.slice(0, slash + 1);
      if (lookup[prefix] !== LAST) {
        throw new Error("trailing object lookup mismatch");
      }
    },
  };
}

function routerCell(
  router: Router,
  fromRequest: boolean,
  generic: boolean,
): PreparedCell {
  return {
    operation: () => {
      const path = fromRequest
        ? pathnameFromUrl(dynamicRequest.url)
        : DYNAMIC_PATH;
      return consumeMatch(router.match("GET", path));
    },
    assertCorrectness: () => {
      const path = fromRequest
        ? pathnameFromUrl(dynamicRequest.url)
        : DYNAMIC_PATH;
      assertTargetMatch(router, path, generic);
    },
  };
}

function dispatchCell(
  router: Router,
  fromRequest: boolean,
  generic: boolean,
): PreparedCell {
  const run = (): unknown => {
    const path = fromRequest
      ? pathnameFromUrl(dynamicRequest.url)
      : DYNAMIC_PATH;
    const match = router.match("GET", path);
    if (match === undefined) {
      throw new Error("dispatch route miss");
    }

    const result = match.route.handler(createContext(dynamicRequest, match.params));
    assertSync(result, "dispatch handler");
    return result;
  };

  return {
    operation: () => {
      const payload = run() as {
        method: string;
        id: string | undefined;
        route: number;
      };
      return payload.route + (payload.id?.length ?? 0);
    },
    assertCorrectness: () => {
      const path = fromRequest
        ? pathnameFromUrl(dynamicRequest.url)
        : DYNAMIC_PATH;
      assertTargetMatch(router, path, generic);
      const payload = run() as {
        method: string;
        id: string | undefined;
        route: number;
      };
      if (
        payload.method !== "GET" ||
        payload.id !== PARAM_VALUE ||
        payload.route !== LAST
      ) {
        throw new Error("dispatch payload mismatch");
      }
    },
  };
}

function fastBoundsScore(url: string): number {
  const start = url.indexOf("/", 8);
  if (start === -1) {
    return 1;
  }

  const query = url.indexOf("?", start + 1);
  const end = query === -1 ? url.length : query;
  return start * 65_536 + end;
}

function minimalRequestPathname(url: string): string {
  const start = url.indexOf("/", 8);
  if (start === -1) {
    return "/";
  }

  const query = url.indexOf("?", start + 1);
  return url.slice(start, query === -1 ? undefined : query);
}

function buildStaticMap(): Map<string, number> {
  const map = new Map<string, number>();
  for (let index = 0; index < ROUTES; index++) {
    map.set(`/r/${index}`, index);
  }
  return map;
}

function buildStaticObject(): Record<string, number> {
  const object = Object.create(null) as Record<string, number>;
  for (let index = 0; index < ROUTES; index++) {
    object[`/r/${index}`] = index;
  }
  return object;
}

function buildTrailingMap(): Map<string, number> {
  const map = new Map<string, number>();
  for (let index = 0; index < ROUTES; index++) {
    map.set(`/r/${index}/`, index);
  }
  return map;
}

function buildTrailingObject(): Record<string, number> {
  const object = Object.create(null) as Record<string, number>;
  for (let index = 0; index < ROUTES; index++) {
    object[`/r/${index}/`] = index;
  }
  return object;
}

function buildTrailingRouter(): Router {
  const router = new Router();
  for (let index = 0; index < ROUTES; index++) {
    router.register(createTrailingRoute(index));
  }
  return router;
}

function buildGenericRouter(): Router {
  const router = new Router();
  router.register(createGenericDummyRoute());

  for (let index = 1; index < ROUTES; index++) {
    router.register(createTrailingRoute(index));
  }

  return router;
}

function createTrailingRoute(index: number): RuntimeRouteRecord {
  const handler: RuntimeRouteHandler = ({ request, params }) => ({
    method: request.method,
    id: params.id,
    route: index,
  });

  return {
    method: "GET",
    path: `/r/${index}/:id`,
    handler,
    flags: RUNTIME_ROUTE_PLAIN,
    input: undefined,
    beforeHandle: undefined,
    afterHandle: undefined,
    responses: undefined,
  };
}

function createGenericDummyRoute(): RuntimeRouteRecord {
  const handler: RuntimeRouteHandler = ({ request, params }) => ({
    method: request.method,
    a: params.a,
    b: params.b,
  });

  return {
    method: "GET",
    path: "/force/:a/:b",
    handler,
    flags: RUNTIME_ROUTE_PLAIN,
    input: undefined,
    beforeHandle: undefined,
    afterHandle: undefined,
    responses: undefined,
  };
}

function consumeMatch(match: ReturnType<Router["match"]>): number {
  if (match === undefined) {
    return 0;
  }

  return match.route.path.length + (match.params.id?.length ?? 0);
}

function assertTargetMatch(
  router: Router,
  path: string,
  generic: boolean,
): void {
  const match = router.match("GET", path);
  if (match === undefined) {
    throw new Error("target route miss");
  }

  if (match.route.path !== `/r/${LAST}/:id`) {
    throw new Error(`target route mismatch: ${match.route.path}`);
  }

  if (match.params.id !== PARAM_VALUE) {
    throw new Error(`target parameter mismatch: ${match.params.id}`);
  }

  if (generic && match.route.path === "/force/:a/:b") {
    throw new Error("generic dummy route unexpectedly matched target");
  }
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
    throw new Error(`Unknown CP3-I cell: ${value}`);
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
