import { pathToFileURL } from "node:url";

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
const DYNAMIC_REQUEST = new Request(`http://gelis.test${DYNAMIC_PATH}`);

type Variant = "production" | "candidate";
type PayloadKind =
  | "string-stable"
  | "string-param"
  | "json-stable"
  | "json-param";
type Cell =
  | "router-dynamic"
  | "handler-string-stable"
  | "handler-string-param"
  | "handler-json-stable"
  | "handler-json-param"
  | "pipeline-string-stable"
  | "pipeline-string-param"
  | "pipeline-json-stable"
  | "pipeline-json-param";

type Operation = () => number;

interface RouterMatch {
  readonly route: RuntimeRouteRecord;
  readonly params: Record<string, string>;
}

interface RouterLike {
  register(route: RuntimeRouteRecord): void;
  match(method: string, pathname: string): RouterMatch | undefined;
}

interface RouterConstructor {
  new (): RouterLike;
}

interface WorkerResult {
  readonly cell: Cell;
  readonly variant: Variant;
  readonly probeOnly: boolean;
  readonly nsPerOp: number | null;
  readonly iterations: number;
  readonly warmups: number;
  readonly sink: number;
}

interface PreparedCell {
  readonly operation: Operation;
  readonly assertCorrectness: () => void | Promise<void>;
}

const CELLS = new Set<Cell>([
  "router-dynamic",
  "handler-string-stable",
  "handler-string-param",
  "handler-json-stable",
  "handler-json-param",
  "pipeline-string-stable",
  "pipeline-string-param",
  "pipeline-json-stable",
  "pipeline-json-param",
]);

const args = readArgs(process.argv.slice(2));
const requestedCell = required(args.cell, "--cell");
assertCell(requestedCell);
const cell = requestedCell;
const variant = requiredVariant(args.variant);
const routerPath = required(args.routerPath, "--router-path");
const probeOnly = args.probeOnly === "true";

const routerModule = (await import(
  `${pathToFileURL(routerPath).href}?cp3t=${process.pid}-${Date.now()}`
)) as { Router?: RouterConstructor };
const Router = routerModule.Router;
if (Router === undefined) {
  throw new Error(`Router export missing from ${routerPath}`);
}

const prepared = prepareCell(Router, cell);
await prepared.assertCorrectness();

if (probeOnly) {
  const result: WorkerResult = {
    cell,
    variant,
    probeOnly: true,
    nsPerOp: null,
    iterations: 0,
    warmups: 0,
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
    variant,
    probeOnly: false,
    nsPerOp: (elapsed * 1_000_000) / iterations,
    iterations,
    warmups: WARMUP,
    sink,
  };
  console.log(JSON.stringify(result));
}

function prepareCell(Router: RouterConstructor, cell: Cell): PreparedCell {
  switch (cell) {
    case "router-dynamic":
      return routerCell(Router);
    case "handler-string-stable":
      return handlerCell(Router, "string-stable");
    case "handler-string-param":
      return handlerCell(Router, "string-param");
    case "handler-json-stable":
      return handlerCell(Router, "json-stable");
    case "handler-json-param":
      return handlerCell(Router, "json-param");
    case "pipeline-string-stable":
      return pipelineCell(Router, "string-stable");
    case "pipeline-string-param":
      return pipelineCell(Router, "string-param");
    case "pipeline-json-stable":
      return pipelineCell(Router, "json-stable");
    case "pipeline-json-param":
      return pipelineCell(Router, "json-param");
  }
}

function routerCell(Router: RouterConstructor): PreparedCell {
  const router = buildRouter(Router, "string-stable");

  const run = () => {
    const match = router.match(
      "GET",
      pathnameFromRequestUrl(DYNAMIC_REQUEST.url),
    );
    if (match === undefined) throw new Error("router dynamic miss");
    return match;
  };

  return {
    operation: () => consumeMatch(run()),
    assertCorrectness: () => assertDynamicMatch(run()),
  };
}

function handlerCell(
  Router: RouterConstructor,
  payloadKind: PayloadKind,
): PreparedCell {
  const router = buildRouter(Router, payloadKind);

  const run = () => {
    const match = router.match(
      "GET",
      pathnameFromRequestUrl(DYNAMIC_REQUEST.url),
    );
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

function pipelineCell(
  Router: RouterConstructor,
  payloadKind: PayloadKind,
): PreparedCell {
  const router = buildRouter(Router, payloadKind);

  const run = () => {
    const match = router.match(
      "GET",
      pathnameFromRequestUrl(DYNAMIC_REQUEST.url),
    );
    if (match === undefined) throw new Error("pipeline dynamic miss");
    const value = match.route.handler(
      createContext(DYNAMIC_REQUEST, match.params),
    );
    assertSync(value, "pipeline handler result");
    return normalizeResponse(value);
  };

  return {
    operation: () => {
      const response = run();
      return response.status + (response.headers.get("content-type")?.length ?? 0);
    },
    assertCorrectness: async () => {
      const expectJson = payloadKind.startsWith("json-");
      const expectedBody = expectJson
        ? JSON.stringify({ id: PARAM_VALUE })
        : PARAM_VALUE;
      await assertResponse(run(), expectedBody, expectJson);
    },
  };
}

function buildRouter(
  Router: RouterConstructor,
  payloadKind: PayloadKind,
): RouterLike {
  const router = new Router();
  for (let index = 0; index < ROUTES; index++) {
    router.register(createRoute(`/r/${index}/:id`, payloadKind));
  }
  return router;
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

function consumeMatch(match: RouterMatch): number {
  return match.route.path.length + (match.params.id?.length ?? 0);
}

function consumeHandlerValue(value: unknown, payloadKind: PayloadKind): number {
  if (payloadKind.startsWith("string-")) {
    if (typeof value !== "string") throw new Error("expected string handler value");
    return value.length;
  }

  if (typeof value !== "object" || value === null) {
    throw new Error("expected JSON handler value");
  }
  const id = (value as { id?: unknown }).id;
  if (typeof id !== "string") throw new Error("expected JSON id string");
  return id.length;
}

function assertDynamicMatch(match: RouterMatch): void {
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

async function assertResponse(
  response: Response,
  expectedBody: string,
  expectJson: boolean,
): Promise<void> {
  if (response.status !== 200) {
    throw new Error(`response status mismatch: ${response.status}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (expectJson) {
    if (!contentType.startsWith("application/json")) {
      throw new Error(`JSON content-type mismatch: ${contentType}`);
    }
  } else if (!contentType.startsWith("text/plain")) {
    throw new Error(`text content-type mismatch: ${contentType}`);
  }
  const body = await response.text();
  if (body !== expectedBody) {
    throw new Error(`response body mismatch: ${body}`);
  }
}

function assertSync<T>(
  value: T | Promise<T>,
  label: string,
): asserts value is T {
  if (value instanceof Promise) {
    throw new Error(`${label} unexpectedly returned a Promise`);
  }
}

function calibrate(operation: () => void): number {
  let iterations = 1_024;

  while (true) {
    const elapsed = measure(operation, iterations);
    if (elapsed >= MIN_CALIBRATION_MS) {
      const scaled = Math.ceil((iterations * TARGET_MS) / elapsed);
      return Math.max(iterations, scaled);
    }
    iterations *= 2;
  }
}

function measure(operation: () => void, iterations: number): number {
  const start = performance.now();
  for (let index = 0; index < iterations; index++) operation();
  return performance.now() - start;
}

function readArgs(values: readonly string[]): Record<string, string> {
  const output: Record<string, string> = {};
  for (const value of values) {
    if (!value.startsWith("--")) continue;
    const equals = value.indexOf("=");
    if (equals === -1) {
      output[value.slice(2)] = "true";
      continue;
    }
    output[value.slice(2, equals)] = value.slice(equals + 1);
  }
  return output;
}

function required(value: string | undefined, label: string): string {
  if (value === undefined || value === "") {
    throw new Error(`Missing ${label}`);
  }
  return value;
}

function requiredVariant(value: string | undefined): Variant {
  if (value === "production" || value === "candidate") return value;
  throw new Error(`Invalid --variant: ${String(value)}`);
}

function assertCell(value: string): asserts value is Cell {
  if (!CELLS.has(value as Cell)) {
    throw new Error(`Invalid --cell: ${value}`);
  }
}
