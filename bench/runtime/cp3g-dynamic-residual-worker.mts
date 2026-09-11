import { Router } from "../../src/runtime/router.ts";
import { normalizeResponse, runtimeReply } from "../../src/runtime/response.ts";
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
const PARAM_NAME = "id";
const PARAM_VALUE = "value-42";
const LAST_SLASH = DYNAMIC_PATH.lastIndexOf("/");
const EMPTY_PARAMS = Object.freeze({}) as Record<string, string>;
const PREBUILT_PARAMS = Object.freeze({ id: PARAM_VALUE }) as Record<
  string,
  string
>;

const staticPayload = { method: "GET", route: LAST } as const;
const dynamicPayload = { method: "GET", id: PARAM_VALUE } as const;

const jsonHandler: RuntimeRouteHandler = ({ request, params }) => ({
  method: request.method,
  id: params.id,
});

const paramsFactory = createParamsFactory(PARAM_NAME);

export type Cell =
  | "pathname-dynamic"
  | "last-index"
  | "prefix-slice"
  | "value-slice"
  | "percent-scan"
  | "params-computed-consume"
  | "params-literal-consume"
  | "params-factory-consume"
  | "params-computed-escape"
  | "handler-prebuilt-params"
  | "handler-computed-params"
  | "handler-literal-params"
  | "router-static-consume"
  | "router-dynamic-consume"
  | "route-handler-static"
  | "route-handler-dynamic"
  | "pipeline-static-json"
  | "pipeline-dynamic-json";

const CELLS = new Set<Cell>([
  "pathname-dynamic",
  "last-index",
  "prefix-slice",
  "value-slice",
  "percent-scan",
  "params-computed-consume",
  "params-literal-consume",
  "params-factory-consume",
  "params-computed-escape",
  "handler-prebuilt-params",
  "handler-computed-params",
  "handler-literal-params",
  "router-static-consume",
  "router-dynamic-consume",
  "route-handler-static",
  "route-handler-dynamic",
  "pipeline-static-json",
  "pipeline-dynamic-json",
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
  readonly assertCorrectness: () => void | Promise<void>;
};

let escapedParams: Record<string, string> | undefined;

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
    sink: escapedParams?.id?.length ?? 0,
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
    sink: sink ^ (escapedParams?.id?.length ?? 0),
  };

  console.log(JSON.stringify(result));
}

function prepareCell(cell: Cell): PreparedCell {
  switch (cell) {
    case "pathname-dynamic":
      return {
        operation: () => pathnameFromUrl(DYNAMIC_URL).length,
        assertCorrectness: () => {
          if (pathnameFromUrl(DYNAMIC_URL) !== DYNAMIC_PATH) {
            throw new Error("pathname extraction mismatch");
          }
        },
      };

    case "last-index":
      return {
        operation: () => DYNAMIC_PATH.lastIndexOf("/"),
        assertCorrectness: () => {
          if (DYNAMIC_PATH.lastIndexOf("/") !== LAST_SLASH) {
            throw new Error("lastIndexOf mismatch");
          }
        },
      };

    case "prefix-slice":
      return {
        operation: () => DYNAMIC_PATH.slice(0, LAST_SLASH + 1).length,
        assertCorrectness: () => {
          if (DYNAMIC_PATH.slice(0, LAST_SLASH + 1) !== `/r/${LAST}/`) {
            throw new Error("prefix slice mismatch");
          }
        },
      };

    case "value-slice":
      return {
        operation: () => DYNAMIC_PATH.slice(LAST_SLASH + 1).length,
        assertCorrectness: () => {
          if (DYNAMIC_PATH.slice(LAST_SLASH + 1) !== PARAM_VALUE) {
            throw new Error("value slice mismatch");
          }
        },
      };

    case "percent-scan":
      return {
        operation: () => (PARAM_VALUE.includes("%") ? 1 : 0),
        assertCorrectness: () => {
          if (PARAM_VALUE.includes("%")) {
            throw new Error("plain parameter unexpectedly encoded");
          }
        },
      };

    case "params-computed-consume":
      return {
        operation: () => ({ [PARAM_NAME]: PARAM_VALUE }).id.length,
        assertCorrectness: () => {
          const params = { [PARAM_NAME]: PARAM_VALUE };
          if (params.id !== PARAM_VALUE) {
            throw new Error("computed params mismatch");
          }
        },
      };

    case "params-literal-consume":
      return {
        operation: () => ({ id: PARAM_VALUE }).id.length,
        assertCorrectness: () => {
          if ({ id: PARAM_VALUE }.id !== PARAM_VALUE) {
            throw new Error("literal params mismatch");
          }
        },
      };

    case "params-factory-consume":
      return {
        operation: () => paramsFactory(PARAM_VALUE).id!.length,
        assertCorrectness: () => {
          if (paramsFactory(PARAM_VALUE).id !== PARAM_VALUE) {
            throw new Error("factory params mismatch");
          }
        },
      };

    case "params-computed-escape":
      return {
        operation: () => {
          escapedParams = { [PARAM_NAME]: PARAM_VALUE };
          return escapedParams.id?.length ?? 0;
        },
        assertCorrectness: () => {
          escapedParams = { [PARAM_NAME]: PARAM_VALUE };
          if (escapedParams.id !== PARAM_VALUE) {
            throw new Error("escaped params mismatch");
          }
        },
      };

    case "handler-prebuilt-params": {
      const request = new Request(DYNAMIC_URL);
      const context = createContext(request, PREBUILT_PARAMS);
      return handlerCell(context);
    }

    case "handler-computed-params": {
      const request = new Request(DYNAMIC_URL);
      return {
        operation: () => {
          const params = { [PARAM_NAME]: PARAM_VALUE };
          const result = jsonHandler(createContext(request, params));
          assertSync(result, "computed params handler");
          return (result as { id: string }).id.length;
        },
        assertCorrectness: () => {
          const result = jsonHandler(
            createContext(request, { [PARAM_NAME]: PARAM_VALUE }),
          );
          assertSync(result, "computed params handler correctness");
          assertDynamicPayload(result);
        },
      };
    }

    case "handler-literal-params": {
      const request = new Request(DYNAMIC_URL);
      return {
        operation: () => {
          const result = jsonHandler(
            createContext(request, { id: PARAM_VALUE }),
          );
          assertSync(result, "literal params handler");
          return (result as { id: string }).id.length;
        },
        assertCorrectness: () => {
          const result = jsonHandler(
            createContext(request, { id: PARAM_VALUE }),
          );
          assertSync(result, "literal params handler correctness");
          assertDynamicPayload(result);
        },
      };
    }

    case "router-static-consume": {
      const router = buildRouter("static");
      return routerCell(router, STATIC_PATH, false);
    }

    case "router-dynamic-consume": {
      const router = buildRouter("dynamic");
      return routerCell(router, DYNAMIC_PATH, true);
    }

    case "route-handler-static":
      return routeHandlerCell("static");

    case "route-handler-dynamic":
      return routeHandlerCell("dynamic");

    case "pipeline-static-json":
      return pipelineCell("static");

    case "pipeline-dynamic-json":
      return pipelineCell("dynamic");
  }
}

function handlerCell(context: RuntimeRouteContext): PreparedCell {
  return {
    operation: () => {
      const result = jsonHandler(context);
      assertSync(result, "prebuilt params handler");
      return (result as { id: string }).id.length;
    },
    assertCorrectness: () => {
      const result = jsonHandler(context);
      assertSync(result, "prebuilt params handler correctness");
      assertDynamicPayload(result);
    },
  };
}

function routerCell(
  router: Router,
  pathname: string,
  dynamic: boolean,
): PreparedCell {
  return {
    operation: () => {
      const match = router.match("GET", pathname);
      if (match === undefined) return 0;
      return (
        match.route.path.length +
        (dynamic
          ? (match.params.id?.length ?? 0)
          : Object.keys(match.params).length)
      );
    },
    assertCorrectness: () => assertRouterMatch(router, pathname, dynamic),
  };
}

function routeHandlerCell(kind: "static" | "dynamic"): PreparedCell {
  const dynamic = kind === "dynamic";
  const pathname = dynamic ? DYNAMIC_PATH : STATIC_PATH;
  const request = new Request(dynamic ? DYNAMIC_URL : STATIC_URL);
  const router = buildRouter(kind);

  const run = () => {
    const path = pathnameFromUrl(request.url);
    const match = router.match("GET", path);
    if (match === undefined) throw new Error("route-handler route miss");

    const result = match.route.handler(createContext(request, match.params));
    assertSync(result, "route-handler");
    return result;
  };

  return {
    operation: () => {
      const result = run();
      return dynamic
        ? (result as { id: string }).id.length
        : (result as { route: number }).route;
    },
    assertCorrectness: () => {
      assertRouterMatch(router, pathname, dynamic);
      const result = run();
      if (dynamic) {
        assertDynamicPayload(result);
      } else {
        assertStaticPayload(result);
      }
    },
  };
}

function pipelineCell(kind: "static" | "dynamic"): PreparedCell {
  const dynamic = kind === "dynamic";
  const pathname = dynamic ? DYNAMIC_PATH : STATIC_PATH;
  const request = new Request(dynamic ? DYNAMIC_URL : STATIC_URL);
  const router = buildRouter(kind);

  const run = (): Response => {
    const path = pathnameFromUrl(request.url);
    const match = router.match("GET", path);
    if (match === undefined) throw new Error("pipeline route miss");

    const result = match.route.handler(createContext(request, match.params));
    assertSync(result, "pipeline handler");
    return normalizeResponse(result);
  };

  return {
    operation: () => run().status,
    assertCorrectness: async () => {
      assertRouterMatch(router, pathname, dynamic);
      const response = run();
      const body = await response.text();
      const expected = JSON.stringify(dynamic ? dynamicPayload : staticPayload);
      if (response.status !== 200 || body !== expected) {
        throw new Error("pipeline response mismatch");
      }
    },
  };
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

function createParamsFactory(
  name: string,
): (value: string) => Record<string, string> {
  return (value) => ({ [name]: value });
}

function assertRouterMatch(
  router: Router,
  pathname: string,
  dynamic: boolean,
): void {
  const match = router.match("GET", pathname);
  if (match === undefined) throw new Error("router correctness miss");

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
  if (Object.keys(match.params).length !== 0) {
    throw new Error("static route unexpectedly produced params");
  }
}

function assertStaticPayload(value: unknown): void {
  if (JSON.stringify(value) !== JSON.stringify(staticPayload)) {
    throw new Error("static payload mismatch");
  }
}

function assertDynamicPayload(value: unknown): void {
  if (JSON.stringify(value) !== JSON.stringify(dynamicPayload)) {
    throw new Error("dynamic payload mismatch");
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
    throw new Error(`Unknown CP3-G cell: ${value}`);
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
