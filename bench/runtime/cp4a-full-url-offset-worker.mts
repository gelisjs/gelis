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
const DYNAMIC_REQUEST = new Request(`http://gelis.test${DYNAMIC_PATH}`);

type PayloadKind =
  | "string-stable"
  | "string-param"
  | "json-stable"
  | "json-param";

type Cell =
  | "current-router"
  | "offset-router"
  | "current-handler-param"
  | "offset-handler-param"
  | "current-pipeline-string-stable"
  | "offset-pipeline-string-stable"
  | "current-pipeline-string-param"
  | "offset-pipeline-string-param"
  | "current-pipeline-json-stable"
  | "offset-pipeline-json-stable"
  | "current-pipeline-json-param"
  | "offset-pipeline-json-param";

type Operation = () => number;

interface MatchResult {
  readonly route: RuntimeRouteRecord;
  readonly params: Record<string, string>;
}

interface PreparedCell {
  readonly operation: Operation;
  readonly assertCorrectness: () => void | Promise<void>;
}

interface WorkerResult {
  readonly cell: Cell;
  readonly probeOnly: boolean;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number | null;
  readonly sink: number;
}

interface OffsetTrailingRoute {
  readonly route: RuntimeRouteRecord;
  readonly paramName: string;
}

interface OffsetUniqueEntry {
  readonly kind: "unique";
  readonly prefix: string;
  readonly trailingRoute: OffsetTrailingRoute;
}

interface OffsetCollisionEntry {
  readonly kind: "collision";
  readonly routes: Map<string, OffsetTrailingRoute>;
}

type OffsetEntry = OffsetUniqueEntry | OffsetCollisionEntry;

const CELLS = new Set<Cell>([
  "current-router",
  "offset-router",
  "current-handler-param",
  "offset-handler-param",
  "current-pipeline-string-stable",
  "offset-pipeline-string-stable",
  "current-pipeline-string-param",
  "offset-pipeline-string-param",
  "current-pipeline-json-stable",
  "offset-pipeline-json-stable",
  "current-pipeline-json-param",
  "offset-pipeline-json-param",
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

function prepareCell(cell: Cell): PreparedCell {
  switch (cell) {
    case "current-router":
      return currentRouterCell();
    case "offset-router":
      return offsetRouterCell();
    case "current-handler-param":
      return currentHandlerParamCell();
    case "offset-handler-param":
      return offsetHandlerParamCell();
    case "current-pipeline-string-stable":
      return currentPipelineCell("string-stable");
    case "offset-pipeline-string-stable":
      return offsetPipelineCell("string-stable");
    case "current-pipeline-string-param":
      return currentPipelineCell("string-param");
    case "offset-pipeline-string-param":
      return offsetPipelineCell("string-param");
    case "current-pipeline-json-stable":
      return currentPipelineCell("json-stable");
    case "offset-pipeline-json-stable":
      return offsetPipelineCell("json-stable");
    case "current-pipeline-json-param":
      return currentPipelineCell("json-param");
    case "offset-pipeline-json-param":
      return offsetPipelineCell("json-param");
  }
}

function currentRouterCell(): PreparedCell {
  const router = buildCurrentRouter("string-param");

  const run = (): MatchResult => {
    const pathname = pathnameFromRequestUrl(DYNAMIC_REQUEST.url);
    const match = router.match("GET", pathname);
    if (match === undefined) throw new Error("current router miss");
    return match;
  };

  return {
    operation: () => consumeMatch(run()),
    assertCorrectness: () => assertDynamicMatch(run()),
  };
}

function offsetRouterCell(): PreparedCell {
  const router = buildOffsetRouter("string-param");

  const run = (): MatchResult => {
    const match = router.matchUrl("GET", DYNAMIC_REQUEST.url);
    if (match === undefined) throw new Error("offset router miss");
    return match;
  };

  return {
    operation: () => consumeMatch(run()),
    assertCorrectness: () => {
      assertDynamicMatch(run());
      assertOffsetExtraCorrectness(router);
    },
  };
}

function currentHandlerParamCell(): PreparedCell {
  const router = buildCurrentRouter("string-param");

  const run = (): unknown => {
    const pathname = pathnameFromRequestUrl(DYNAMIC_REQUEST.url);
    const match = router.match("GET", pathname);
    if (match === undefined) throw new Error("current handler route miss");
    const value = match.route.handler(
      createContext(DYNAMIC_REQUEST, match.params),
    );
    assertSync(value, "current handler result");
    return value;
  };

  return {
    operation: () => consumeStringValue(run()),
    assertCorrectness: () => assertHandlerValue(run(), "string-param"),
  };
}

function offsetHandlerParamCell(): PreparedCell {
  const router = buildOffsetRouter("string-param");

  const run = (): unknown => {
    const match = router.matchUrl("GET", DYNAMIC_REQUEST.url);
    if (match === undefined) throw new Error("offset handler route miss");
    const value = match.route.handler(
      createContext(DYNAMIC_REQUEST, match.params),
    );
    assertSync(value, "offset handler result");
    return value;
  };

  return {
    operation: () => consumeStringValue(run()),
    assertCorrectness: () => assertHandlerValue(run(), "string-param"),
  };
}

function currentPipelineCell(payloadKind: PayloadKind): PreparedCell {
  const router = buildCurrentRouter(payloadKind);

  const run = (): Response => {
    const pathname = pathnameFromRequestUrl(DYNAMIC_REQUEST.url);
    const match = router.match("GET", pathname);
    if (match === undefined) throw new Error("current pipeline route miss");
    const value = match.route.handler(
      createContext(DYNAMIC_REQUEST, match.params),
    );
    assertSync(value, "current pipeline handler result");
    return normalizeResponse(value);
  };

  return responsePreparedCell(run, payloadKind);
}

function offsetPipelineCell(payloadKind: PayloadKind): PreparedCell {
  const router = buildOffsetRouter(payloadKind);

  const run = (): Response => {
    const match = router.matchUrl("GET", DYNAMIC_REQUEST.url);
    if (match === undefined) throw new Error("offset pipeline route miss");
    const value = match.route.handler(
      createContext(DYNAMIC_REQUEST, match.params),
    );
    assertSync(value, "offset pipeline handler result");
    return normalizeResponse(value);
  };

  return responsePreparedCell(run, payloadKind);
}

function responsePreparedCell(
  run: () => Response,
  payloadKind: PayloadKind,
): PreparedCell {
  return {
    operation: () => {
      const response = run();
      return (
        response.status + (response.headers.get("content-type")?.length ?? 0)
      );
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

function buildCurrentRouter(payloadKind: PayloadKind): Router {
  const router = new Router();
  for (let index = 0; index < ROUTES; index++) {
    router.register(createRoute(`/r/${index}/:id`, payloadKind));
  }
  return router;
}

function buildOffsetRouter(payloadKind: PayloadKind): OffsetTrailingRouter {
  const router = new OffsetTrailingRouter();
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

class OffsetTrailingRouter {
  private readonly fingerprints = new Map<number, OffsetEntry>();

  register(route: RuntimeRouteRecord): void {
    const slash = route.path.lastIndexOf("/");
    if (slash < 0 || route.path.charCodeAt(slash + 1) !== 58) {
      throw new Error(`CP4-A offset router only accepts trailing params: ${route.path}`);
    }

    const prefix = route.path.slice(0, slash + 1);
    const paramName = route.path.slice(slash + 2);
    if (paramName.length === 0) {
      throw new Error(`Missing trailing param name: ${route.path}`);
    }

    const trailingRoute: OffsetTrailingRoute = { route, paramName };
    const key = prefixFingerprint(prefix, prefix.length);
    const existing = this.fingerprints.get(key);

    if (existing === undefined) {
      this.fingerprints.set(key, {
        kind: "unique",
        prefix,
        trailingRoute,
      });
      return;
    }

    if (existing.kind === "unique") {
      if (existing.prefix === prefix) {
        throw new Error(`Duplicate route prefix: ${prefix}`);
      }
      this.fingerprints.set(key, {
        kind: "collision",
        routes: new Map([
          [existing.prefix, existing.trailingRoute],
          [prefix, trailingRoute],
        ]),
      });
      return;
    }

    if (existing.routes.has(prefix)) {
      throw new Error(`Duplicate route prefix: ${prefix}`);
    }
    existing.routes.set(prefix, trailingRoute);
  }

  matchUrl(method: string, url: string): MatchResult | undefined {
    if (method !== "GET") return undefined;

    let authorityStart: number;
    if (
      url.charCodeAt(0) !== 104 ||
      url.charCodeAt(1) !== 116 ||
      url.charCodeAt(2) !== 116 ||
      url.charCodeAt(3) !== 112
    ) {
      return undefined;
    }

    if (
      url.charCodeAt(4) === 58 &&
      url.charCodeAt(5) === 47 &&
      url.charCodeAt(6) === 47
    ) {
      authorityStart = 7;
    } else if (
      url.charCodeAt(4) === 115 &&
      url.charCodeAt(5) === 58 &&
      url.charCodeAt(6) === 47 &&
      url.charCodeAt(7) === 47
    ) {
      authorityStart = 8;
    } else {
      return undefined;
    }

    const pathStart = url.indexOf("/", authorityStart);
    if (pathStart === -1) return undefined;

    const queryStart = url.indexOf("?", pathStart + 1);
    const pathEnd = queryStart === -1 ? url.length : queryStart;
    const slash = url.lastIndexOf("/", pathEnd - 1);
    if (slash < pathStart) return undefined;

    const prefixEnd = slash + 1;
    const prefixLength = prefixEnd - pathStart;
    const entry = this.fingerprints.get(
      prefixFingerprintRange(url, prefixEnd, prefixLength),
    );
    if (entry === undefined) return undefined;

    let trailingRoute: OffsetTrailingRoute | undefined;
    if (entry.kind === "unique") {
      if (
        entry.prefix.length === prefixLength &&
        url.startsWith(entry.prefix, pathStart)
      ) {
        trailingRoute = entry.trailingRoute;
      }
    } else {
      trailingRoute = entry.routes.get(url.slice(pathStart, prefixEnd));
    }

    if (trailingRoute === undefined) return undefined;

    const value = url.slice(prefixEnd, pathEnd);
    return {
      route: trailingRoute.route,
      params: {
        [trailingRoute.paramName]: decodeParam(value),
      },
    };
  }
}

function prefixFingerprint(value: string, end: number): number {
  let hash = Math.imul(end, -1640531527);
  hash = Math.imul(hash ^ codeBefore(value, end, 2), -2048144789);
  hash = Math.imul(hash ^ codeBefore(value, end, 3), -1028477387);
  hash = Math.imul(hash ^ codeBefore(value, end, 4), 668265263);
  hash = Math.imul(hash ^ codeBefore(value, end, 5), 374761393);
  return hash | 0;
}

function prefixFingerprintRange(
  value: string,
  absoluteEnd: number,
  prefixLength: number,
): number {
  let hash = Math.imul(prefixLength, -1640531527);
  hash = Math.imul(hash ^ codeBefore(value, absoluteEnd, 2), -2048144789);
  hash = Math.imul(hash ^ codeBefore(value, absoluteEnd, 3), -1028477387);
  hash = Math.imul(hash ^ codeBefore(value, absoluteEnd, 4), 668265263);
  hash = Math.imul(hash ^ codeBefore(value, absoluteEnd, 5), 374761393);
  return hash | 0;
}

function codeBefore(value: string, end: number, distance: number): number {
  const index = end - distance;
  return index >= 0 ? value.charCodeAt(index) : 0;
}

function decodeParam(value: string): string {
  return value.includes("%") ? decodeURIComponent(value) : value;
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

function consumeMatch(match: MatchResult): number {
  return match.route.path.length + (match.params.id?.length ?? 0);
}

function consumeStringValue(value: unknown): number {
  if (typeof value !== "string") throw new Error("expected string value");
  return value.length;
}

function assertDynamicMatch(match: MatchResult): void {
  if (match.route.path !== `/r/${LAST}/:id`) {
    throw new Error(`route path mismatch: ${match.route.path}`);
  }
  if (match.params.id !== PARAM_VALUE) {
    throw new Error(`route param mismatch: ${match.params.id}`);
  }
}

function assertOffsetExtraCorrectness(router: OffsetTrailingRouter): void {
  const queryMatch = router.matchUrl(
    "GET",
    `https://gelis.test/r/${LAST}/value-42?x=1`,
  );
  if (queryMatch === undefined || queryMatch.params.id !== "value-42") {
    throw new Error("offset query-bounded match failed");
  }

  const encodedMatch = router.matchUrl(
    "GET",
    `http://gelis.test/r/${LAST}/value%2042?x=1`,
  );
  if (encodedMatch === undefined || encodedMatch.params.id !== "value 42") {
    throw new Error("offset encoded param match failed");
  }

  if (router.matchUrl("GET", "http://gelis.test/missing/value-42") !== undefined) {
    throw new Error("offset unknown route unexpectedly matched");
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
  let iterations = 1_024;
  while (true) {
    const elapsed = measure(operation, iterations);
    if (elapsed >= MIN_CALIBRATION_MS) {
      return Math.max(
        iterations,
        Math.ceil((iterations * TARGET_MS) / Math.max(elapsed, 0.001)),
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
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing ${label}`);
  }
  return value;
}

function assertCell(value: string): asserts value is Cell {
  if (!CELLS.has(value as Cell)) {
    throw new Error(`Unknown CP4-A cell: ${value}`);
  }
}
