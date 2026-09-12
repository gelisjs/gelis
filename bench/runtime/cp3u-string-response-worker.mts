import { pathToFileURL } from "node:url";

import { runtimeReply } from "../../src/runtime/response.ts";
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

const TEXT_HEADERS = {
  "content-type": "text/plain; charset=utf-8",
};

const CACHED_STATUS_INIT: ResponseInit = {
  status: 200,
  headers: TEXT_HEADERS,
};

const CACHED_NO_STATUS_INIT: ResponseInit = {
  headers: TEXT_HEADERS,
};

type Cell =
  | "production-stable-current"
  | "candidate-stable-current"
  | "candidate-stable-cached-status"
  | "candidate-stable-no-status"
  | "candidate-stable-cached-no-status"
  | "production-handler-param"
  | "candidate-handler-param"
  | "candidate-handler-param-prehash"
  | "production-param-current"
  | "candidate-param-current"
  | "candidate-param-cached-status"
  | "candidate-param-no-status"
  | "candidate-param-cached-no-status"
  | "candidate-param-prehash-current"
  | "candidate-param-prehash-no-status";

type PayloadKind = "stable" | "param";
type ResponseKind =
  "current" | "cached-status" | "no-status" | "cached-no-status";
type Mode = "handler" | "pipeline";
type Operation = () => number;
type ResponseNormalizer = (value: unknown) => Response;

interface CellConfig {
  readonly mode: Mode;
  readonly payload: PayloadKind;
  readonly responseKind: ResponseKind;
  readonly prehash: boolean;
}

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
  "production-stable-current",
  "candidate-stable-current",
  "candidate-stable-cached-status",
  "candidate-stable-no-status",
  "candidate-stable-cached-no-status",
  "production-handler-param",
  "candidate-handler-param",
  "candidate-handler-param-prehash",
  "production-param-current",
  "candidate-param-current",
  "candidate-param-cached-status",
  "candidate-param-no-status",
  "candidate-param-cached-no-status",
  "candidate-param-prehash-current",
  "candidate-param-prehash-no-status",
]);

const args = readArgs(process.argv.slice(2));
const requestedCell = required(args.cell, "--cell");
assertCell(requestedCell);
const cell = requestedCell;
const routerPath = required(args["router-path"], "--router-path");
const responsePath = required(args["response-path"], "--response-path");
const probeOnly = args["probe-only"] === "true";

const routerModule = (await import(
  `${pathToFileURL(routerPath).href}?cp3u-router=${process.pid}-${Date.now()}`
)) as { Router?: RouterConstructor };
const Router = routerModule.Router;
if (Router === undefined) {
  throw new Error(`Router export missing from ${routerPath}`);
}

const responseModule = (await import(
  `${pathToFileURL(responsePath).href}?cp3u-response=${process.pid}-${Date.now()}`
)) as { normalizeResponse?: ResponseNormalizer };
const normalizeResponse = responseModule.normalizeResponse;
if (normalizeResponse === undefined) {
  throw new Error(`normalizeResponse export missing from ${responsePath}`);
}

const prepared = prepareCell(Router, normalizeResponse, cell);
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

function prepareCell(
  Router: RouterConstructor,
  normalizeResponse: ResponseNormalizer,
  cell: Cell,
): PreparedCell {
  const config = configForCell(cell);
  const router = buildRouter(Router, config.payload);
  const legacyPrefixMap = config.prehash ? buildLegacyPrefixMap() : undefined;

  const runHandler = (): string => {
    const pathname = pathnameFromRequestUrl(DYNAMIC_REQUEST.url);

    if (legacyPrefixMap !== undefined) {
      touchLegacyPrefix(pathname, legacyPrefixMap);
    }

    const match = router.match("GET", pathname);
    if (match === undefined) {
      throw new Error(`${cell} route miss`);
    }

    const value = match.route.handler(
      createContext(DYNAMIC_REQUEST, match.params),
    );
    assertSync(value, `${cell} handler result`);

    if (typeof value !== "string") {
      throw new Error(`${cell} expected string handler value`);
    }

    return value;
  };

  if (config.mode === "handler") {
    return {
      operation: () => runHandler().length,
      assertCorrectness: () => {
        if (runHandler() !== PARAM_VALUE) {
          throw new Error(`${cell} handler value mismatch`);
        }
      },
    };
  }

  const runPipeline = (): Response =>
    buildResponse(runHandler(), config.responseKind, normalizeResponse);

  return {
    operation: () => runPipeline().status,
    assertCorrectness: async () => {
      await assertTextResponse(runPipeline());
    },
  };
}

function configForCell(cell: Cell): CellConfig {
  switch (cell) {
    case "production-stable-current":
    case "candidate-stable-current":
      return {
        mode: "pipeline",
        payload: "stable",
        responseKind: "current",
        prehash: false,
      };

    case "candidate-stable-cached-status":
      return {
        mode: "pipeline",
        payload: "stable",
        responseKind: "cached-status",
        prehash: false,
      };

    case "candidate-stable-no-status":
      return {
        mode: "pipeline",
        payload: "stable",
        responseKind: "no-status",
        prehash: false,
      };

    case "candidate-stable-cached-no-status":
      return {
        mode: "pipeline",
        payload: "stable",
        responseKind: "cached-no-status",
        prehash: false,
      };

    case "production-handler-param":
    case "candidate-handler-param":
      return {
        mode: "handler",
        payload: "param",
        responseKind: "current",
        prehash: false,
      };

    case "candidate-handler-param-prehash":
      return {
        mode: "handler",
        payload: "param",
        responseKind: "current",
        prehash: true,
      };

    case "production-param-current":
    case "candidate-param-current":
      return {
        mode: "pipeline",
        payload: "param",
        responseKind: "current",
        prehash: false,
      };

    case "candidate-param-cached-status":
      return {
        mode: "pipeline",
        payload: "param",
        responseKind: "cached-status",
        prehash: false,
      };

    case "candidate-param-no-status":
      return {
        mode: "pipeline",
        payload: "param",
        responseKind: "no-status",
        prehash: false,
      };

    case "candidate-param-cached-no-status":
      return {
        mode: "pipeline",
        payload: "param",
        responseKind: "cached-no-status",
        prehash: false,
      };

    case "candidate-param-prehash-current":
      return {
        mode: "pipeline",
        payload: "param",
        responseKind: "current",
        prehash: true,
      };

    case "candidate-param-prehash-no-status":
      return {
        mode: "pipeline",
        payload: "param",
        responseKind: "no-status",
        prehash: true,
      };
  }
}

function buildResponse(
  value: string,
  kind: ResponseKind,
  normalizeResponse: ResponseNormalizer,
): Response {
  switch (kind) {
    case "current":
      return normalizeResponse(value);
    case "cached-status":
      return new Response(value, CACHED_STATUS_INIT);
    case "no-status":
      return new Response(value, {
        headers: TEXT_HEADERS,
      });
    case "cached-no-status":
      return new Response(value, CACHED_NO_STATUS_INIT);
  }
}

function buildRouter(
  Router: RouterConstructor,
  payload: PayloadKind,
): RouterLike {
  const router = new Router();
  for (let index = 0; index < ROUTES; index++) {
    router.register(createRoute(`/r/${index}/:id`, payload));
  }
  return router;
}

function createRoute(path: string, payload: PayloadKind): RuntimeRouteRecord {
  const handler: RuntimeRouteHandler =
    payload === "stable" ? () => PARAM_VALUE : ({ params }) => params.id ?? "";

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

function buildLegacyPrefixMap(): Map<string, number> {
  const map = new Map<string, number>();
  for (let index = 0; index < ROUTES; index++) {
    map.set(`/r/${index}/`, index);
  }
  return map;
}

function touchLegacyPrefix(pathname: string, map: Map<string, number>): void {
  const slash = pathname.lastIndexOf("/");
  if (slash < 0) {
    throw new Error("legacy prefix slash missing");
  }

  const prefix = pathname.slice(0, slash + 1);
  if (map.get(prefix) !== LAST) {
    throw new Error(`legacy prefix lookup mismatch: ${prefix}`);
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

async function assertTextResponse(response: Response): Promise<void> {
  if (response.status !== 200) {
    throw new Error(`response status mismatch: ${response.status}`);
  }
  if (response.statusText !== "") {
    throw new Error(`response statusText mismatch: ${response.statusText}`);
  }
  const contentType = response.headers.get("content-type");
  if (contentType !== "text/plain; charset=utf-8") {
    throw new Error(`response content-type mismatch: ${contentType}`);
  }
  const body = await response.text();
  if (body !== PARAM_VALUE) {
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

function assertCell(value: string): asserts value is Cell {
  if (!CELLS.has(value as Cell)) {
    throw new Error(`Invalid --cell: ${value}`);
  }
}
