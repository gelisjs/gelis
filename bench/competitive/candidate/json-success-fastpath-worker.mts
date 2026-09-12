import { Gelis } from "../../../src";
import { Router } from "../../../src/runtime/router";
import {
  normalizeResponse,
  normalizeResponseWithStatus,
  runtimeReply,
} from "../../../src/runtime/response";
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

const EMPTY_PARAMS = Object.freeze({}) as Record<string, string>;

type PayloadKind = "static" | "dynamic";
type Strategy =
  | "direct-json"
  | "baseline-normalize"
  | "production-normalize"
  | "baseline-pipeline"
  | "production-pipeline"
  | "app-fetch"
  | "raw-app-fetch";
type Cell = `${PayloadKind}::${Strategy}`;
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

const PAYLOAD_KINDS = new Set<PayloadKind>(["static", "dynamic"]);
const STRATEGIES = new Set<Strategy>([
  "direct-json",
  "baseline-normalize",
  "production-normalize",
  "baseline-pipeline",
  "production-pipeline",
  "app-fetch",
  "raw-app-fetch",
]);

const args = readArgs(process.argv.slice(2));
const requestedCell = required(args.cell, "--cell");
assertCell(requestedCell);
const cell = requestedCell;
const probeOnly = args["probe-only"] === "true";

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
  readonly assertCorrectness: () => Promise<void>;
} {
  const [payloadKind, strategy] = cell.split("::") as [PayloadKind, Strategy];
  const dynamic = payloadKind === "dynamic";
  const request = new Request(dynamic ? DYNAMIC_URL : STATIC_URL);
  const expectedJson = dynamic
    ? JSON.stringify({ method: "GET", id: "value-42" })
    : JSON.stringify({ method: "GET", route: LAST });
  const payload = dynamic
    ? ({ method: "GET", id: "value-42" } as const)
    : ({ method: "GET", route: LAST } as const);

  if (strategy === "direct-json") {
    const factory = () => Response.json(payload);
    return responseFactoryCell(factory, expectedJson, "application/json");
  }

  if (strategy === "baseline-normalize") {
    const factory = () => normalizeResponseWithStatus(200, payload);
    return responseFactoryCell(factory, expectedJson, "application/json");
  }

  if (strategy === "production-normalize") {
    const factory = () => normalizeResponse(payload);
    return responseFactoryCell(factory, expectedJson, "application/json");
  }

  if (strategy === "raw-app-fetch") {
    const app = buildRawApp(payloadKind);
    return responseFactoryCell(
      () => {
        const response = app.fetch(request);
        assertSync(response, "raw app.fetch");
        return response;
      },
      dynamic ? "value-42" : "GET",
      "raw",
    );
  }

  const router = buildJsonRouter(payloadKind);
  const app = buildJsonApp(payloadKind);

  const invokeHandler = () => {
    const pathname = pathnameFromUrl(request.url);
    const match = router.match("GET", pathname);
    if (match === undefined) {
      throw new Error("candidate pipeline route miss");
    }

    const result = match.route.handler(createContext(request, match.params));
    assertSync(result, "candidate pipeline handler");
    return result;
  };

  const factory =
    strategy === "baseline-pipeline"
      ? () => normalizeResponseWithStatus(200, invokeHandler())
      : strategy === "production-pipeline"
        ? () => normalizeResponse(invokeHandler())
        : () => {
            const response = app.fetch(request);
            assertSync(response, "app.fetch");
            return response;
          };

  return responseFactoryCell(factory, expectedJson, "application/json");
}

function buildJsonRouter(payloadKind: PayloadKind): Router {
  const router = new Router();

  for (let index = 0; index < ROUTES; index++) {
    const dynamic = payloadKind === "dynamic";
    const path = dynamic ? `/r/${index}/:id` : `/r/${index}`;
    const handler: RuntimeRouteHandler = dynamic
      ? ({ request, params }) => ({
          method: request.method,
          id: params.id,
        })
      : ({ request }) => ({
          method: request.method,
          route: index,
        });

    router.register(createRoute(path, handler));
  }

  return router;
}

function buildJsonApp(payloadKind: PayloadKind): Gelis {
  const app = new Gelis();

  for (let index = 0; index < ROUTES; index++) {
    if (payloadKind === "dynamic") {
      const path = `/r/${index}/:id` as `/r/${number}/:id`;
      app.get(path, ({ request, params }) => ({
        method: request.method,
        id: params.id,
      }));
    } else {
      const path = `/r/${index}` as `/r/${number}`;
      app.get(path, ({ request }) => ({
        method: request.method,
        route: index,
      }));
    }
  }

  return app;
}

function buildRawApp(payloadKind: PayloadKind): Gelis {
  const app = new Gelis();

  for (let index = 0; index < ROUTES; index++) {
    if (payloadKind === "dynamic") {
      const path = `/r/${index}/:id` as `/r/${number}/:id`;
      app.get(path, ({ params }) => new Response(params.id));
    } else {
      const path = `/r/${index}` as `/r/${number}`;
      app.get(path, ({ request }) => new Response(request.method));
    }
  }

  return app;
}

function createRoute(
  path: string,
  handler: RuntimeRouteHandler,
): RuntimeRouteRecord {
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
  params: Record<string, string> = EMPTY_PARAMS,
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
  expectedBody: string,
  expectedMediaType: "application/json" | "raw",
): {
  readonly operation: Operation;
  readonly assertCorrectness: () => Promise<void>;
} {
  return {
    operation: () => {
      const response = factory();
      return (
        response.status + (response.headers.get("content-type")?.length ?? 0)
      );
    },
    assertCorrectness: async () => {
      const snapshot = await responseSnapshot(factory());

      if (snapshot.status !== 200) {
        throw new Error(`status mismatch: ${snapshot.status}`);
      }

      if (snapshot.body !== expectedBody) {
        throw new Error(
          `body mismatch: expected ${expectedBody}, got ${snapshot.body}`,
        );
      }

      if (expectedMediaType === "raw") {
        if (snapshot.mediaType !== "" && snapshot.mediaType !== "text/plain") {
          throw new Error(`raw media type mismatch: ${snapshot.mediaType}`);
        }
      } else if (snapshot.mediaType !== expectedMediaType) {
        throw new Error(
          `media type mismatch: expected ${expectedMediaType}, got ${snapshot.mediaType}`,
        );
      }
    },
  };
}

async function responseSnapshot(response: Response): Promise<ResponseSnapshot> {
  return {
    status: response.status,
    body: await response.text(),
    mediaType:
      response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase() ?? "",
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

function assertSync<T>(
  value: T | PromiseLike<T>,
  label: string,
): asserts value is T {
  if (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as PromiseLike<T>).then === "function"
  ) {
    throw new Error(`${label} unexpectedly returned a promise`);
  }
}

function readArgs(values: readonly string[]): Record<string, string> {
  const args: Record<string, string> = {};

  for (const value of values) {
    if (!value.startsWith("--")) continue;

    const separator = value.indexOf("=");
    if (separator === -1) {
      args[value.slice(2)] = "true";
    } else {
      args[value.slice(2, separator)] = value.slice(separator + 1);
    }
  }

  return args;
}

function required(value: string | undefined, label: string): string {
  if (value === undefined) {
    throw new Error(`Missing ${label}`);
  }

  return value;
}

function assertCell(value: string): asserts value is Cell {
  const [payloadKind, strategy, extra] = value.split("::");

  if (
    extra !== undefined ||
    !PAYLOAD_KINDS.has(payloadKind as PayloadKind) ||
    !STRATEGIES.has(strategy as Strategy)
  ) {
    throw new Error(`Unknown CP3-C cell: ${value}`);
  }
}
