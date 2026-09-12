import { Router } from "../../src/runtime/router.ts";
import { normalizeResponse, runtimeReply } from "../../src/runtime/response.ts";
import { pathnameFromRequestUrl } from "../../src/runtime/url.ts";
import { RUNTIME_ROUTE_PLAIN } from "../../src/runtime/types.ts";

import type { RuntimeRouteMatch } from "../../src/runtime/router.ts";
import type {
  RuntimeRouteContext,
  RuntimeRouteHandler,
  RuntimeRouteRecord,
} from "../../src/runtime/types.ts";

const ROUTES = 5_000;
const MIXED_ROUTES_PER_KIND = ROUTES / 2;
const LAST = ROUTES - 1;
const MIXED_LAST = MIXED_ROUTES_PER_KIND - 1;
const WARMUP = 20_000;
const TARGET_MS = 120;
const MIN_CALIBRATION_MS = 20;
const PARAM_VALUE = "value-42";
const MIXED_STATIC_PATH = `/s/${MIXED_LAST}`;
const MIXED_STATIC_REQUEST = new Request(
  `http://gelis.test${MIXED_STATIC_PATH}`,
);
const MIXED_DYNAMIC_PATH = `/d/${MIXED_LAST}/${PARAM_VALUE}`;
const MIXED_DYNAMIC_REQUEST = new Request(
  `http://gelis.test${MIXED_DYNAMIC_PATH}`,
);
const DYNAMIC_PATH = `/r/${LAST}/${PARAM_VALUE}`;
const DYNAMIC_REQUEST = new Request(`http://gelis.test${DYNAMIC_PATH}`);
const COLLISION_PATH = collisionRequestPath(LAST);
const COLLISION_REQUEST = new Request(`http://gelis.test${COLLISION_PATH}`);
const EMPTY_PARAMS = Object.freeze({}) as Record<string, string>;

type Mode = "current" | "fingerprint";
type BodyKind = "string" | "json";
type Cell =
  | "production-mixed-static-request"
  | "shared-current-mixed-static-request"
  | "shared-fingerprint-mixed-static-request"
  | "production-mixed-dynamic-request"
  | "shared-current-mixed-dynamic-request"
  | "shared-fingerprint-mixed-dynamic-request"
  | "shared-current-pipeline-string"
  | "shared-fingerprint-pipeline-string"
  | "shared-current-pipeline-json"
  | "shared-fingerprint-pipeline-json"
  | "shared-current-collision-request"
  | "shared-fingerprint-collision-request";

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

interface SharedTrailingRoute {
  readonly route: RuntimeRouteRecord;
  readonly paramName: string;
}

interface FingerprintUniqueEntry {
  readonly kind: "unique";
  readonly prefix: string;
  readonly trailing: SharedTrailingRoute;
}

interface FingerprintCollisionEntry {
  readonly kind: "collision";
  readonly routes: Map<string, SharedTrailingRoute>;
}

type FingerprintEntry = FingerprintUniqueEntry | FingerprintCollisionEntry;

interface SharedMethodRoutes {
  readonly staticRoutes: Map<string, RuntimeRouteRecord>;
  readonly currentTrailing: Map<string, SharedTrailingRoute>;
  readonly fingerprintTrailing: FingerprintTrailingIndex;
}

const CELLS = new Set<Cell>([
  "production-mixed-static-request",
  "shared-current-mixed-static-request",
  "shared-fingerprint-mixed-static-request",
  "production-mixed-dynamic-request",
  "shared-current-mixed-dynamic-request",
  "shared-fingerprint-mixed-dynamic-request",
  "shared-current-pipeline-string",
  "shared-fingerprint-pipeline-string",
  "shared-current-pipeline-json",
  "shared-fingerprint-pipeline-json",
  "shared-current-collision-request",
  "shared-fingerprint-collision-request",
]);

const args = readArgs(process.argv.slice(2));
const requestedCell = required(args.cell, "--cell");
assertCell(requestedCell);
const cell = requestedCell;
const probeOnly = args.probeOnly === "true";

assertSharedSemantics();
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
    case "production-mixed-static-request":
      return productionMixedCell(false);
    case "shared-current-mixed-static-request":
      return sharedMixedCell("current", false);
    case "shared-fingerprint-mixed-static-request":
      return sharedMixedCell("fingerprint", false);
    case "production-mixed-dynamic-request":
      return productionMixedCell(true);
    case "shared-current-mixed-dynamic-request":
      return sharedMixedCell("current", true);
    case "shared-fingerprint-mixed-dynamic-request":
      return sharedMixedCell("fingerprint", true);
    case "shared-current-pipeline-string":
      return sharedPipelineCell("current", "string");
    case "shared-fingerprint-pipeline-string":
      return sharedPipelineCell("fingerprint", "string");
    case "shared-current-pipeline-json":
      return sharedPipelineCell("current", "json");
    case "shared-fingerprint-pipeline-json":
      return sharedPipelineCell("fingerprint", "json");
    case "shared-current-collision-request":
      return sharedCollisionCell("current");
    case "shared-fingerprint-collision-request":
      return sharedCollisionCell("fingerprint");
  }
}

function productionMixedCell(dynamic: boolean): PreparedCell {
  const router = buildProductionMixedRouter();
  const request = dynamic ? MIXED_DYNAMIC_REQUEST : MIXED_STATIC_REQUEST;
  const expectedPath = dynamic ? `/d/${MIXED_LAST}/:id` : `/s/${MIXED_LAST}`;

  const run = () => {
    const pathname = pathnameFromRequestUrl(request.url);
    const match = router.match("GET", pathname);
    if (match === undefined) throw new Error("production mixed route miss");
    return match;
  };

  return {
    operation: () => consumeMatch(run(), dynamic),
    assertCorrectness: () => assertMixedMatch(run(), expectedPath, dynamic),
  };
}

function sharedMixedCell(mode: Mode, dynamic: boolean): PreparedCell {
  const router = buildSharedMixedRouter();
  const request = dynamic ? MIXED_DYNAMIC_REQUEST : MIXED_STATIC_REQUEST;
  const expectedPath = dynamic ? `/d/${MIXED_LAST}/:id` : `/s/${MIXED_LAST}`;

  const run = () => {
    const pathname = pathnameFromRequestUrl(request.url);
    const match = router.match(mode, "GET", pathname);
    if (match === undefined) throw new Error("shared mixed route miss");
    return match;
  };

  return {
    operation: () => consumeMatch(run(), dynamic),
    assertCorrectness: () => assertMixedMatch(run(), expectedPath, dynamic),
  };
}

function sharedPipelineCell(mode: Mode, bodyKind: BodyKind): PreparedCell {
  const router = buildSharedTrailingRouter(bodyKind);
  const expectJson = bodyKind === "json";
  const expectedBody = expectJson
    ? JSON.stringify({ id: PARAM_VALUE })
    : PARAM_VALUE;

  const run = (): Response => {
    const pathname = pathnameFromRequestUrl(DYNAMIC_REQUEST.url);
    const match = router.match(mode, "GET", pathname);
    if (match === undefined) throw new Error("shared pipeline route miss");
    const value = match.route.handler(
      createContext(DYNAMIC_REQUEST, match.params),
    );
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

function sharedCollisionCell(mode: Mode): PreparedCell {
  const router = buildSharedCollisionRouter();

  const run = () => {
    const pathname = pathnameFromRequestUrl(COLLISION_REQUEST.url);
    const match = router.match(mode, "GET", pathname);
    if (match === undefined) throw new Error("shared collision route miss");
    return match;
  };

  return {
    operation: () => consumeMatch(run(), true),
    assertCorrectness: () => {
      assertDynamicMatch(run(), collisionRoutePath(LAST));
    },
  };
}

function buildProductionMixedRouter(): Router {
  const router = new Router();
  for (let index = 0; index < MIXED_ROUTES_PER_KIND; index++) {
    router.register(createRoute(`/s/${index}`, "string"));
    router.register(createRoute(`/d/${index}/:id`, "string"));
  }
  return router;
}

function buildSharedMixedRouter(): SharedRouter {
  const router = new SharedRouter();
  for (let index = 0; index < MIXED_ROUTES_PER_KIND; index++) {
    router.register(createRoute(`/s/${index}`, "string"));
    router.register(createRoute(`/d/${index}/:id`, "string"));
  }
  return router;
}

function buildSharedTrailingRouter(bodyKind: BodyKind): SharedRouter {
  const router = new SharedRouter();
  for (let index = 0; index < ROUTES; index++) {
    router.register(createRoute(`/r/${index}/:id`, bodyKind));
  }
  return router;
}

function buildSharedCollisionRouter(): SharedRouter {
  const router = new SharedRouter();
  for (let index = 0; index < ROUTES; index++) {
    router.register(createRoute(collisionRoutePath(index), "string"));
  }
  return router;
}

function createRoute(path: string, bodyKind: BodyKind): RuntimeRouteRecord {
  const handler: RuntimeRouteHandler =
    bodyKind === "json" ? () => ({ id: PARAM_VALUE }) : () => PARAM_VALUE;

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

class SharedRouter {
  #methods = new Map<string, SharedMethodRoutes>();

  register(route: RuntimeRouteRecord): void {
    let table = this.#methods.get(route.method);
    if (table === undefined) {
      table = {
        staticRoutes: new Map(),
        currentTrailing: new Map(),
        fingerprintTrailing: new FingerprintTrailingIndex(),
      };
      this.#methods.set(route.method, table);
    }

    const segments = splitPath(route.path);
    let paramCount = 0;
    let paramName: string | undefined;

    for (const segment of segments) {
      if (!segment.startsWith(":")) continue;
      paramCount++;
      paramName = segment.slice(1);
    }

    if (paramCount === 0) {
      if (table.staticRoutes.has(route.path)) {
        throw new Error(`Duplicate route: ${route.method} ${route.path}`);
      }
      table.staticRoutes.set(route.path, route);
      return;
    }

    const finalSegment = segments.at(-1);
    if (
      paramCount !== 1 ||
      paramName === undefined ||
      finalSegment === undefined ||
      !finalSegment.startsWith(":")
    ) {
      throw new Error(
        `CP3-Q shared router supports trailing params only: ${route.path}`,
      );
    }

    const slash = route.path.lastIndexOf("/");
    if (slash < 0)
      throw new Error(`Invalid trailing-param route: ${route.path}`);
    const prefix = route.path.slice(0, slash + 1);

    if (table.currentTrailing.has(prefix)) {
      throw new Error(`Duplicate trailing prefix: ${prefix}`);
    }

    const trailing = { route, paramName } satisfies SharedTrailingRoute;
    table.currentTrailing.set(prefix, trailing);
    table.fingerprintTrailing.register(prefix, trailing);
  }

  match(
    mode: Mode,
    method: string,
    pathname: string,
  ): RuntimeRouteMatch | undefined {
    const table = this.#methods.get(method);
    if (table === undefined) return undefined;

    const staticRoute = table.staticRoutes.get(pathname);
    if (staticRoute !== undefined) {
      return {
        route: staticRoute,
        params: EMPTY_PARAMS,
      };
    }

    if (pathname === "/") return undefined;
    const slash = pathname.lastIndexOf("/");
    if (slash < 0) return undefined;
    const prefixEnd = slash + 1;

    let trailing: SharedTrailingRoute | undefined;

    if (mode === "current") {
      trailing = table.currentTrailing.get(pathname.slice(0, prefixEnd));
    } else {
      trailing = table.fingerprintTrailing.match(pathname, prefixEnd);
    }

    if (trailing === undefined) return undefined;

    const value = pathname.slice(prefixEnd);
    return {
      route: trailing.route,
      params: {
        [trailing.paramName]: decodeParam(value),
      },
    };
  }
}

class FingerprintTrailingIndex {
  readonly #entries = new Map<number, FingerprintEntry>();

  register(prefix: string, trailing: SharedTrailingRoute): void {
    const key = prefixFingerprint(prefix, prefix.length);
    const existing = this.#entries.get(key);

    if (existing === undefined) {
      this.#entries.set(key, { kind: "unique", prefix, trailing });
      return;
    }

    if (existing.kind === "unique") {
      if (existing.prefix === prefix) {
        throw new Error(`Duplicate trailing prefix: ${prefix}`);
      }
      this.#entries.set(key, {
        kind: "collision",
        routes: new Map([
          [existing.prefix, existing.trailing],
          [prefix, trailing],
        ]),
      });
      return;
    }

    if (existing.routes.has(prefix)) {
      throw new Error(`Duplicate trailing prefix: ${prefix}`);
    }
    existing.routes.set(prefix, trailing);
  }

  match(pathname: string, prefixEnd: number): SharedTrailingRoute | undefined {
    const key = prefixFingerprint(pathname, prefixEnd);
    const entry = this.#entries.get(key);
    if (entry === undefined) return undefined;

    if (entry.kind === "unique") {
      if (
        entry.prefix.length !== prefixEnd ||
        !pathname.startsWith(entry.prefix)
      ) {
        return undefined;
      }
      return entry.trailing;
    }

    return entry.routes.get(pathname.slice(0, prefixEnd));
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

function codeBefore(value: string, end: number, distance: number): number {
  const index = end - distance;
  return index >= 0 ? value.charCodeAt(index) : 0;
}

function assertSharedSemantics(): void {
  const router = new SharedRouter();
  router.register(createRoute("/collision/:id", "string"));
  router.register(createRoute("/collision/fixed", "string"));
  router.register(createRoute("/named/:slug", "string"));

  for (const mode of ["current", "fingerprint"] as const) {
    const staticMatch = router.match(mode, "GET", "/collision/fixed");
    if (staticMatch?.route.path !== "/collision/fixed") {
      throw new Error(`${mode} static precedence mismatch`);
    }

    const dynamicMatch = router.match(mode, "GET", "/collision/value");
    if (
      dynamicMatch?.route.path !== "/collision/:id" ||
      dynamicMatch.params.id !== "value"
    ) {
      throw new Error(`${mode} dynamic match mismatch`);
    }

    const namedMatch = router.match(mode, "GET", "/named/a%20b");
    if (
      namedMatch?.route.path !== "/named/:slug" ||
      namedMatch.params.slug !== "a b"
    ) {
      throw new Error(`${mode} percent-decoding mismatch`);
    }

    if (router.match(mode, "POST", "/collision/value") !== undefined) {
      throw new Error(`${mode} method isolation mismatch`);
    }
  }

  let duplicateRejected = false;
  try {
    router.register(createRoute("/collision/:other", "string"));
  } catch {
    duplicateRejected = true;
  }
  if (!duplicateRejected) {
    throw new Error("shared duplicate trailing prefix was not rejected");
  }

  const collisionRouter = new SharedRouter();
  collisionRouter.register(createRoute(collisionRoutePath(1), "string"));
  collisionRouter.register(createRoute(collisionRoutePath(2), "string"));
  const collisionMatch = collisionRouter.match(
    "fingerprint",
    "GET",
    collisionRequestPath(2),
  );
  if (
    collisionMatch?.route.path !== collisionRoutePath(2) ||
    collisionMatch.params.id !== PARAM_VALUE
  ) {
    throw new Error("shared fingerprint collision fallback mismatch");
  }
}

function consumeMatch(match: RuntimeRouteMatch, dynamic: boolean): number {
  return (
    match.route.path.length +
    (dynamic
      ? (match.params.id?.length ?? 0)
      : Object.keys(match.params).length)
  );
}

function assertMixedMatch(
  match: RuntimeRouteMatch,
  expectedPath: string,
  dynamic: boolean,
): void {
  if (match.route.path !== expectedPath) {
    throw new Error(
      `mixed route mismatch: expected ${expectedPath}, got ${match.route.path}`,
    );
  }
  if (dynamic) {
    if (match.params.id !== PARAM_VALUE) {
      throw new Error(`mixed dynamic param mismatch: ${match.params.id}`);
    }
  } else if (Object.keys(match.params).length !== 0) {
    throw new Error("mixed static route unexpectedly produced params");
  }
}

function assertDynamicMatch(
  match: RuntimeRouteMatch,
  expectedPath: string,
): void {
  if (match.route.path !== expectedPath) {
    throw new Error(
      `dynamic route mismatch: expected ${expectedPath}, got ${match.route.path}`,
    );
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

function collisionRoutePath(index: number): string {
  return `/collision/${index.toString().padStart(4, "0")}aaaa/:id`;
}

function collisionRequestPath(index: number): string {
  return `/collision/${index.toString().padStart(4, "0")}aaaa/${PARAM_VALUE}`;
}

function splitPath(path: string): string[] {
  if (path === "/") return [];
  return path.slice(1).split("/");
}

function decodeParam(value: string): string {
  if (!value.includes("%")) return value;
  return decodeURIComponent(value);
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
    throw new Error(`Unknown CP3-Q cell: ${value}`);
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
