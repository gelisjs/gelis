import { performance } from "node:perf_hooks";

import { Router } from "../../src/runtime/router.ts";
import {
  normalizeResponse,
  runtimeReply,
} from "../../src/runtime/response.ts";
import {
  pathnameFromRequestUrl,
  pathnameFromUrl,
} from "../../src/runtime/url.ts";
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
const STATIC_PATH = `/s/${LAST}`;
const DYNAMIC_PATH = `/d/${LAST}/value-42`;
const STATIC_URL = `http://gelis.test${STATIC_PATH}?mode=bench`;
const DYNAMIC_URL = `http://gelis.test${DYNAMIC_PATH}?mode=bench`;
const PARAM_VALUE = "value-42";

export type Cell =
  | "pathname-baseline-static"
  | "pathname-candidate-static"
  | "pathname-baseline-dynamic"
  | "pathname-candidate-dynamic"
  | "dispatch-baseline-static"
  | "dispatch-candidate-static"
  | "dispatch-baseline-dynamic"
  | "dispatch-candidate-dynamic"
  | "pipeline-baseline-static-json"
  | "pipeline-candidate-static-json"
  | "pipeline-baseline-dynamic-json"
  | "pipeline-candidate-dynamic-json";

const CELLS = new Set<Cell>([
  "pathname-baseline-static",
  "pathname-candidate-static",
  "pathname-baseline-dynamic",
  "pathname-candidate-dynamic",
  "dispatch-baseline-static",
  "dispatch-candidate-static",
  "dispatch-baseline-dynamic",
  "dispatch-candidate-dynamic",
  "pipeline-baseline-static-json",
  "pipeline-candidate-static-json",
  "pipeline-baseline-dynamic-json",
  "pipeline-candidate-dynamic-json",
]);

interface WorkerResult {
  readonly cell: Cell;
  readonly probeOnly: boolean;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number | null;
  readonly sink: number;
}

type PathnameExtractor = (url: string) => string;
type Operation = () => number;

type PreparedCell = {
  readonly operation: Operation;
  readonly assertCorrectness: () => void;
};

const staticRequest = new Request(STATIC_URL);
const dynamicRequest = new Request(DYNAMIC_URL);
const staticRouter = buildStaticRouter();
const dynamicRouter = buildDynamicRouter();

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
    case "pathname-baseline-static":
      return pathnameCell(staticRequest, STATIC_PATH, pathnameFromUrl);

    case "pathname-candidate-static":
      return pathnameCell(staticRequest, STATIC_PATH, pathnameFromRequestUrl);

    case "pathname-baseline-dynamic":
      return pathnameCell(dynamicRequest, DYNAMIC_PATH, pathnameFromUrl);

    case "pathname-candidate-dynamic":
      return pathnameCell(dynamicRequest, DYNAMIC_PATH, pathnameFromRequestUrl);

    case "dispatch-baseline-static":
      return dispatchCell(
        staticRouter,
        staticRequest,
        STATIC_PATH,
        pathnameFromUrl,
        false,
      );

    case "dispatch-candidate-static":
      return dispatchCell(
        staticRouter,
        staticRequest,
        STATIC_PATH,
        pathnameFromRequestUrl,
        false,
      );

    case "dispatch-baseline-dynamic":
      return dispatchCell(
        dynamicRouter,
        dynamicRequest,
        DYNAMIC_PATH,
        pathnameFromUrl,
        true,
      );

    case "dispatch-candidate-dynamic":
      return dispatchCell(
        dynamicRouter,
        dynamicRequest,
        DYNAMIC_PATH,
        pathnameFromRequestUrl,
        true,
      );

    case "pipeline-baseline-static-json":
      return pipelineCell(
        staticRouter,
        staticRequest,
        STATIC_PATH,
        pathnameFromUrl,
        false,
      );

    case "pipeline-candidate-static-json":
      return pipelineCell(
        staticRouter,
        staticRequest,
        STATIC_PATH,
        pathnameFromRequestUrl,
        false,
      );

    case "pipeline-baseline-dynamic-json":
      return pipelineCell(
        dynamicRouter,
        dynamicRequest,
        DYNAMIC_PATH,
        pathnameFromUrl,
        true,
      );

    case "pipeline-candidate-dynamic-json":
      return pipelineCell(
        dynamicRouter,
        dynamicRequest,
        DYNAMIC_PATH,
        pathnameFromRequestUrl,
        true,
      );
  }
}

function pathnameCell(
  request: Request,
  expected: string,
  extract: PathnameExtractor,
): PreparedCell {
  return {
    operation: () => extract(request.url).length,
    assertCorrectness: () => {
      const pathname = extract(request.url);
      if (pathname !== expected) {
        throw new Error(`pathname mismatch: expected ${expected}, got ${pathname}`);
      }
    },
  };
}

function dispatchCell(
  router: Router,
  request: Request,
  expectedPath: string,
  extract: PathnameExtractor,
  dynamic: boolean,
): PreparedCell {
  return {
    operation: () => consumePayload(dispatch(router, request, extract), dynamic),
    assertCorrectness: () => {
      assertPathParity(request, expectedPath);
      assertPayload(dispatch(router, request, extract), dynamic);
    },
  };
}

function pipelineCell(
  router: Router,
  request: Request,
  expectedPath: string,
  extract: PathnameExtractor,
  dynamic: boolean,
): PreparedCell {
  return {
    operation: () => {
      const payload = dispatch(router, request, extract);
      const response = normalizeResponse(payload);
      assertSync(response, "response normalization");
      return response.status;
    },
    assertCorrectness: () => {
      assertPathParity(request, expectedPath);
      const payload = dispatch(router, request, extract);
      assertPayload(payload, dynamic);
      const response = normalizeResponse(payload);
      assertSync(response, "response normalization");
      if (response.status !== 200) {
        throw new Error(`unexpected pipeline status: ${response.status}`);
      }
      if (!response.headers.get("content-type")?.startsWith("application/json")) {
        throw new Error("pipeline did not produce JSON response");
      }
    },
  };
}

function dispatch(
  router: Router,
  request: Request,
  extract: PathnameExtractor,
): unknown {
  const pathname = extract(request.url);
  const match = router.match(request.method, pathname);

  if (match === undefined) {
    throw new Error(`route miss for ${pathname}`);
  }

  const result = match.route.handler(createContext(request, match.params));
  assertSync(result, "route handler");
  return result;
}

function assertPathParity(request: Request, expected: string): void {
  const baseline = pathnameFromUrl(request.url);
  const candidate = pathnameFromRequestUrl(request.url);

  if (baseline !== expected || candidate !== expected || baseline !== candidate) {
    throw new Error(
      `path parity mismatch: baseline=${baseline}, candidate=${candidate}, expected=${expected}`,
    );
  }
}

function consumePayload(payload: unknown, dynamic: boolean): number {
  const value = payload as {
    kind: string;
    route: number;
    id?: string;
  };

  return value.route + value.kind.length + (dynamic ? (value.id?.length ?? 0) : 0);
}

function assertPayload(payload: unknown, dynamic: boolean): void {
  const value = payload as {
    kind: string;
    route: number;
    id?: string;
  };

  const expectedKind = dynamic ? "dynamic" : "static";

  if (value.kind !== expectedKind || value.route !== LAST) {
    throw new Error(`unexpected dispatch payload: ${JSON.stringify(value)}`);
  }

  if (dynamic && value.id !== PARAM_VALUE) {
    throw new Error(`unexpected dynamic parameter: ${value.id}`);
  }
}

function buildStaticRouter(): Router {
  const router = new Router();

  for (let index = 0; index < ROUTES; index++) {
    router.register(createStaticRoute(index));
  }

  return router;
}

function buildDynamicRouter(): Router {
  const router = new Router();

  for (let index = 0; index < ROUTES; index++) {
    router.register(createDynamicRoute(index));
  }

  return router;
}

function createStaticRoute(index: number): RuntimeRouteRecord {
  const handler: RuntimeRouteHandler = () => ({
    kind: "static",
    route: index,
  });

  return createRoute("GET", `/s/${index}`, handler);
}

function createDynamicRoute(index: number): RuntimeRouteRecord {
  const handler: RuntimeRouteHandler = ({ params }) => ({
    kind: "dynamic",
    route: index,
    id: params.id,
  });

  return createRoute("GET", `/d/${index}/:id`, handler);
}

function createRoute(
  method: string,
  path: string,
  handler: RuntimeRouteHandler,
): RuntimeRouteRecord {
  return {
    method,
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

function assertSync<T>(
  value: T | PromiseLike<T>,
  label: string,
): asserts value is T {
  if (
    value !== null &&
    typeof value === "object" &&
    "then" in value &&
    typeof value.then === "function"
  ) {
    throw new Error(`${label} unexpectedly returned a promise`);
  }
}

function calibrate(operation: () => void): number {
  let iterations = 1_000;

  while (true) {
    const elapsed = measure(operation, iterations);

    if (elapsed >= MIN_CALIBRATION_MS) {
      return Math.max(
        iterations,
        Math.round(iterations * (TARGET_MS / elapsed)),
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

function assertCell(value: string): asserts value is Cell {
  if (!CELLS.has(value as Cell)) {
    throw new Error(`Unknown CP3-J cell: ${value}`);
  }
}

function readArgs(values: string[]): Record<string, string> {
  const result: Record<string, string> = {};

  for (let index = 0; index < values.length; index++) {
    const value = values[index]!;

    if (!value.startsWith("--")) {
      continue;
    }

    const key = value.slice(2);
    const next = values[index + 1];

    if (next === undefined || next.startsWith("--")) {
      result[key] = "true";
      continue;
    }

    result[key] = next;
    index++;
  }

  return result;
}

function required(value: string | undefined, label: string): string {
  if (value === undefined) {
    throw new Error(`Missing ${label}`);
  }

  return value;
}
