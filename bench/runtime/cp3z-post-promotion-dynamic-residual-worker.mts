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
const PARAM_VALUE = "value-42";
const DYNAMIC_PATH = `/r/${LAST}/${PARAM_VALUE}`;
const DYNAMIC_URL = `http://gelis.test${DYNAMIC_PATH}`;
const DYNAMIC_REQUEST = new Request(DYNAMIC_URL);

type PayloadKind =
  | "string-stable"
  | "string-param"
  | "json-stable"
  | "json-param";

type Cell =
  | "pathname-request-dynamic"
  | "router-literal-dynamic"
  | "router-request-dynamic"
  | "handler-string-stable"
  | "handler-string-param"
  | "handler-json-stable"
  | "handler-json-param"
  | "pipeline-string-stable"
  | "pipeline-string-param"
  | "pipeline-json-stable"
  | "pipeline-json-param"
  | "app-string-stable"
  | "app-string-param"
  | "app-json-stable"
  | "app-json-param";

type Operation = () => number;

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
  "router-literal-dynamic",
  "router-request-dynamic",
  "handler-string-stable",
  "handler-string-param",
  "handler-json-stable",
  "handler-json-param",
  "pipeline-string-stable",
  "pipeline-string-param",
  "pipeline-json-stable",
  "pipeline-json-param",
  "app-string-stable",
  "app-string-param",
  "app-json-stable",
  "app-json-param",
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
      return pathnameCell();
    case "router-literal-dynamic":
      return routerCell(false);
    case "router-request-dynamic":
      return routerCell(true);
    case "handler-string-stable":
      return handlerCell("string-stable");
    case "handler-string-param":
      return handlerCell("string-param");
    case "handler-json-stable":
      return handlerCell("json-stable");
    case "handler-json-param":
      return handlerCell("json-param");
    case "pipeline-string-stable":
      return pipelineCell("string-stable");
    case "pipeline-string-param":
      return pipelineCell("string-param");
    case "pipeline-json-stable":
      return pipelineCell("json-stable");
    case "pipeline-json-param":
      return pipelineCell("json-param");
    case "app-string-stable":
      return appCell("string-stable");
    case "app-string-param":
      return appCell("string-param");
    case "app-json-stable":
      return appCell("json-stable");
    case "app-json-param":
      return appCell("json-param");
  }
}

function pathnameCell(): PreparedCell {
  return {
    operation: () => pathnameFromRequestUrl(DYNAMIC_REQUEST.url).length,
    assertCorrectness: () => {
      const pathname = pathnameFromRequestUrl(DYNAMIC_REQUEST.url);
      if (pathname !== DYNAMIC_PATH) {
        throw new Error(`pathname mismatch: ${pathname}`);
      }
    },
  };
}

function routerCell(requestDerived: boolean): PreparedCell {
  const router = buildRouter("string-stable");

  const run = () => {
    const pathname = requestDerived
      ? pathnameFromRequestUrl(DYNAMIC_REQUEST.url)
      : DYNAMIC_PATH;
    const match = router.match("GET", pathname);
    if (match === undefined) throw new Error("router dynamic miss");
    return match;
  };

  return {
    operation: () => consumeMatch(run()),
    assertCorrectness: () => assertDynamicMatch(run()),
  };
}

function handlerCell(payloadKind: PayloadKind): PreparedCell {
  const router = buildRouter(payloadKind);

  const run = () => {
    const pathname = pathnameFromRequestUrl(DYNAMIC_REQUEST.url);
    const match = router.match("GET", pathname);
    if (match === undefined) throw new Error("handler dynamic miss");
    const value = match.route.handler(
      createContext(DYNAMIC_REQUEST, match.params),
    );
    assertSync(value, "handler result");
    return value;
  };

  return {
    operation: () => consumeHandlerValue(run(), payloadKind),
    assertCorrectness: () => assertHandlerValue(run(), payloadKind),
  };
}

function pipelineCell(payloadKind: PayloadKind): PreparedCell {
  const router = buildRouter(payloadKind);

  const run = (): Response => {
    const pathname = pathnameFromRequestUrl(DYNAMIC_REQUEST.url);
    const match = router.match("GET", pathname);
    if (match === undefined) throw new Error("pipeline dynamic miss");
    const value = match.route.handler(
      createContext(DYNAMIC_REQUEST, match.params),
    );
    assertSync(value, "pipeline handler result");
    return normalizeResponse(value);
  };

  return {
    operation: () => consumeResponse(run()),
    assertCorrectness: () => assertPayloadResponse(run(), payloadKind),
  };
}

function appCell(payloadKind: PayloadKind): PreparedCell {
  const app = buildApp(payloadKind);

  const run = (): Response => {
    const response = app.fetch(DYNAMIC_REQUEST);
    assertSync(response, "app.fetch");
    return response;
  };

  return {
    operation: () => consumeResponse(run()),
    assertCorrectness: () => assertPayloadResponse(run(), payloadKind),
  };
}

function buildRouter(payloadKind: PayloadKind): Router {
  const router = new Router();
  for (let index = 0; index < ROUTES; index++) {
    router.register(createRoute(`/r/${index}/:id`, payloadKind));
  }
  return router;
}

function buildApp(payloadKind: PayloadKind): Gelis {
  const app = new Gelis();

  for (let index = 0; index < ROUTES; index++) {
    const path = `/r/${index}/:id` as `/r/${number}/:id`;

    switch (payloadKind) {
      case "string-stable":
        app.get(path, () => PARAM_VALUE);
        break;
      case "string-param":
        app.get(path, ({ params }) => params.id);
        break;
      case "json-stable":
        app.get(path, () => ({ id: PARAM_VALUE }));
        break;
      case "json-param":
        app.get(path, ({ params }) => ({ id: params.id }));
        break;
    }
  }

  return app;
}

function createRoute(
  path: string,
  payloadKind: PayloadKind,
): RuntimeRouteRecord {
  let handler: RuntimeRouteHandler;

  switch (payloadKind) {
    case "string-stable":
      handler = () => PARAM_VALUE;
      break;
    case "string-param":
      handler = ({ params }) => params.id ?? "";
      break;
    case "json-stable":
      handler = () => ({ id: PARAM_VALUE });
      break;
    case "json-param":
      handler = ({ params }) => ({ id: params.id });
      break;
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

function consumeMatch(match: {
  readonly route: RuntimeRouteRecord;
  readonly params: Record<string, string>;
}): number {
  return match.route.path.length + (match.params.id?.length ?? 0);
}

function consumeHandlerValue(value: unknown, payloadKind: PayloadKind): number {
  if (payloadKind.startsWith("string-")) {
    if (typeof value !== "string") {
      throw new Error("expected string handler value");
    }
    return value.length;
  }

  if (typeof value !== "object" || value === null) {
    throw new Error("expected JSON handler value");
  }
  const id = (value as { id?: unknown }).id;
  if (typeof id !== "string") {
    throw new Error("expected JSON id string");
  }
  return id.length;
}

function consumeResponse(response: Response): number {
  return response.status + (response.headers.get("content-type")?.length ?? 0);
}

function assertDynamicMatch(match: {
  readonly route: RuntimeRouteRecord;
  readonly params: Record<string, string>;
}): void {
  if (match.route.path !== `/r/${LAST}/:id`) {
    throw new Error(`route path mismatch: ${match.route.path}`);
  }
  if (match.params.id !== PARAM_VALUE) {
    throw new Error(`route param mismatch: ${match.params.id}`);
  }
}

function assertHandlerValue(value: unknown, payloadKind: PayloadKind): void {
  if (payloadKind.startsWith("string-")) {
    if (value !== PARAM_VALUE) {
      throw new Error(`string handler mismatch: ${String(value)}`);
    }
    return;
  }

  if (
    typeof value !== "object" ||
    value === null ||
    (value as { id?: unknown }).id !== PARAM_VALUE
  ) {
    throw new Error(`JSON handler mismatch: ${JSON.stringify(value)}`);
  }
}

async function assertPayloadResponse(
  response: Response,
  payloadKind: PayloadKind,
): Promise<void> {
  if (response.status !== 200) {
    throw new Error(`response status mismatch: ${response.status}`);
  }

  const expectJson = payloadKind.startsWith("json-");
  const contentType = response.headers.get("content-type") ?? "";
  if (expectJson) {
    if (!contentType.startsWith("application/json")) {
      throw new Error(`JSON content-type mismatch: ${contentType}`);
    }
  } else if (!contentType.startsWith("text/plain")) {
    throw new Error(`text content-type mismatch: ${contentType}`);
  }

  const expectedBody = expectJson
    ? JSON.stringify({ id: PARAM_VALUE })
    : PARAM_VALUE;
  const body = await response.text();
  if (body !== expectedBody) {
    throw new Error(`response body mismatch: ${body}`);
  }
}

function assertSync<T>(
  value: T | PromiseLike<T>,
  label: string,
): asserts value is T {
  if (isPromiseLike(value)) {
    throw new Error(`${label} unexpectedly returned a Promise`);
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
    throw new Error(`Unknown CP3-Z cell: ${value}`);
  }
}
