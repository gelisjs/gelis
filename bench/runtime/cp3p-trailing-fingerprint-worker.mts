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
const DYNAMIC_PATH = `/r/${LAST}/${PARAM_VALUE}`;
const DYNAMIC_URL = `http://gelis.test${DYNAMIC_PATH}`;
const DYNAMIC_REQUEST = new Request(DYNAMIC_URL);
const MIXED_STATIC_PATH = `/s/${MIXED_LAST}`;
const MIXED_STATIC_REQUEST = new Request(
  `http://gelis.test${MIXED_STATIC_PATH}`,
);
const MIXED_DYNAMIC_PATH = `/d/${MIXED_LAST}/${PARAM_VALUE}`;
const MIXED_DYNAMIC_REQUEST = new Request(
  `http://gelis.test${MIXED_DYNAMIC_PATH}`,
);
const COLLISION_PATH = collisionRequestPath(LAST);
const COLLISION_REQUEST = new Request(`http://gelis.test${COLLISION_PATH}`);
const EMPTY_PARAMS = Object.freeze({}) as Record<string, string>;

type Implementation = "current" | "fingerprint";
type BodyKind = "string" | "json";
type Cell =
  | "current-trailing-stable"
  | "fingerprint-trailing-stable"
  | "current-trailing-request"
  | "fingerprint-trailing-request"
  | "current-pipeline-string"
  | "fingerprint-pipeline-string"
  | "current-pipeline-json"
  | "fingerprint-pipeline-json"
  | "current-mixed-static-request"
  | "fingerprint-mixed-static-request"
  | "current-mixed-dynamic-request"
  | "fingerprint-mixed-dynamic-request"
  | "current-collision-request"
  | "fingerprint-collision-request";

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

interface Matcher {
  match(method: string, pathname: string): RuntimeRouteMatch | undefined;
}

interface FingerprintTrailingRoute {
  readonly route: RuntimeRouteRecord;
  readonly paramName: string;
}

interface FingerprintUniqueEntry {
  readonly kind: "unique";
  readonly prefix: string;
  readonly trailing: FingerprintTrailingRoute;
}

interface FingerprintCollisionEntry {
  readonly kind: "collision";
  readonly routes: Map<string, FingerprintTrailingRoute>;
}

type FingerprintEntry = FingerprintUniqueEntry | FingerprintCollisionEntry;

interface FingerprintMethodRoutes {
  readonly staticRoutes: Map<string, RuntimeRouteRecord>;
  readonly trailing: FingerprintTrailingIndex;
}

const CELLS = new Set<Cell>([
  "current-trailing-stable",
  "fingerprint-trailing-stable",
  "current-trailing-request",
  "fingerprint-trailing-request",
  "current-pipeline-string",
  "fingerprint-pipeline-string",
  "current-pipeline-json",
  "fingerprint-pipeline-json",
  "current-mixed-static-request",
  "fingerprint-mixed-static-request",
  "current-mixed-dynamic-request",
  "fingerprint-mixed-dynamic-request",
  "current-collision-request",
  "fingerprint-collision-request",
]);

const args = readArgs(process.argv.slice(2));
const requestedCell = required(args.cell, "--cell");
assertCell(requestedCell);
const cell = requestedCell;
const probeOnly = args.probeOnly === "true";

assertCandidateSemantics();
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
    case "current-trailing-stable":
      return trailingCell("current", false);
    case "fingerprint-trailing-stable":
      return trailingCell("fingerprint", false);
    case "current-trailing-request":
      return trailingCell("current", true);
    case "fingerprint-trailing-request":
      return trailingCell("fingerprint", true);
    case "current-pipeline-string":
      return pipelineCell("current", "string");
    case "fingerprint-pipeline-string":
      return pipelineCell("fingerprint", "string");
    case "current-pipeline-json":
      return pipelineCell("current", "json");
    case "fingerprint-pipeline-json":
      return pipelineCell("fingerprint", "json");
    case "current-mixed-static-request":
      return mixedCell("current", false);
    case "fingerprint-mixed-static-request":
      return mixedCell("fingerprint", false);
    case "current-mixed-dynamic-request":
      return mixedCell("current", true);
    case "fingerprint-mixed-dynamic-request":
      return mixedCell("fingerprint", true);
    case "current-collision-request":
      return collisionCell("current");
    case "fingerprint-collision-request":
      return collisionCell("fingerprint");
  }
}

function trailingCell(
  implementation: Implementation,
  requestDerived: boolean,
): PreparedCell {
  const matcher = buildTrailingMatcher(implementation, "string");
  const stablePathname = DYNAMIC_PATH;

  const run = () => {
    const pathname = requestDerived
      ? pathnameFromRequestUrl(DYNAMIC_REQUEST.url)
      : stablePathname;
    const match = matcher.match("GET", pathname);
    if (match === undefined) throw new Error("trailing route miss");
    return match;
  };

  return {
    operation: () => {
      const match = run();
      return match.route.path.length + (match.params.id?.length ?? 0);
    },
    assertCorrectness: () => {
      assertDynamicMatch(run(), `/r/${LAST}/:id`);
    },
  };
}

function pipelineCell(
  implementation: Implementation,
  bodyKind: BodyKind,
): PreparedCell {
  const matcher = buildTrailingMatcher(implementation, bodyKind);
  const expectJson = bodyKind === "json";
  const expectedBody = expectJson
    ? JSON.stringify({ id: PARAM_VALUE })
    : PARAM_VALUE;

  const run = (): Response => {
    const pathname = pathnameFromRequestUrl(DYNAMIC_REQUEST.url);
    const match = matcher.match("GET", pathname);
    if (match === undefined) throw new Error("pipeline route miss");
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

function mixedCell(
  implementation: Implementation,
  dynamic: boolean,
): PreparedCell {
  const matcher = buildMixedMatcher(implementation);
  const request = dynamic ? MIXED_DYNAMIC_REQUEST : MIXED_STATIC_REQUEST;
  const expectedPath = dynamic ? `/d/${MIXED_LAST}/:id` : `/s/${MIXED_LAST}`;

  const run = () => {
    const pathname = pathnameFromRequestUrl(request.url);
    const match = matcher.match("GET", pathname);
    if (match === undefined) throw new Error("mixed route miss");
    return match;
  };

  return {
    operation: () => {
      const match = run();
      return (
        match.route.path.length +
        (dynamic
          ? (match.params.id?.length ?? 0)
          : Object.keys(match.params).length)
      );
    },
    assertCorrectness: () => {
      const match = run();
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
    },
  };
}

function collisionCell(implementation: Implementation): PreparedCell {
  const matcher = buildCollisionMatcher(implementation);

  const run = () => {
    const pathname = pathnameFromRequestUrl(COLLISION_REQUEST.url);
    const match = matcher.match("GET", pathname);
    if (match === undefined) throw new Error("collision route miss");
    return match;
  };

  return {
    operation: () => {
      const match = run();
      return match.route.path.length + (match.params.id?.length ?? 0);
    },
    assertCorrectness: () => {
      assertDynamicMatch(run(), collisionRoutePath(LAST));
    },
  };
}

function buildTrailingMatcher(
  implementation: Implementation,
  bodyKind: BodyKind,
): Matcher {
  const matcher: Router | FingerprintRouter =
    implementation === "current" ? new Router() : new FingerprintRouter();

  for (let index = 0; index < ROUTES; index++) {
    registerMatcher(matcher, createRoute(`/r/${index}/:id`, bodyKind));
  }

  return matcher;
}

function buildMixedMatcher(implementation: Implementation): Matcher {
  const matcher: Router | FingerprintRouter =
    implementation === "current" ? new Router() : new FingerprintRouter();

  for (let index = 0; index < MIXED_ROUTES_PER_KIND; index++) {
    registerMatcher(matcher, createRoute(`/s/${index}`, "string"));
    registerMatcher(matcher, createRoute(`/d/${index}/:id`, "string"));
  }

  return matcher;
}

function buildCollisionMatcher(implementation: Implementation): Matcher {
  const matcher: Router | FingerprintRouter =
    implementation === "current" ? new Router() : new FingerprintRouter();

  for (let index = 0; index < ROUTES; index++) {
    registerMatcher(matcher, createRoute(collisionRoutePath(index), "string"));
  }

  return matcher;
}

function registerMatcher(
  matcher: Router | FingerprintRouter,
  route: RuntimeRouteRecord,
): void {
  matcher.register(route);
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

class FingerprintRouter implements Matcher {
  #methods = new Map<string, FingerprintMethodRoutes>();

  register(route: RuntimeRouteRecord): void {
    let table = this.#methods.get(route.method);
    if (table === undefined) {
      table = {
        staticRoutes: new Map(),
        trailing: new FingerprintTrailingIndex(),
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
        `CP3-P candidate supports trailing params only: ${route.path}`,
      );
    }

    const slash = route.path.lastIndexOf("/");
    if (slash < 0)
      throw new Error(`Invalid trailing-param route: ${route.path}`);

    table.trailing.register(route.path.slice(0, slash + 1), {
      route,
      paramName,
    });
  }

  match(method: string, pathname: string): RuntimeRouteMatch | undefined {
    const table = this.#methods.get(method);
    if (table === undefined) return undefined;

    const staticRoute = table.staticRoutes.get(pathname);
    if (staticRoute !== undefined) {
      return {
        route: staticRoute,
        params: EMPTY_PARAMS,
      };
    }

    return table.trailing.match(pathname);
  }
}

class FingerprintTrailingIndex {
  readonly #entries = new Map<number, FingerprintEntry>();

  register(prefix: string, trailing: FingerprintTrailingRoute): void {
    const key = prefixFingerprint(prefix, prefix.length);
    const existing = this.#entries.get(key);

    if (existing === undefined) {
      this.#entries.set(key, {
        kind: "unique",
        prefix,
        trailing,
      });
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

  match(pathname: string): RuntimeRouteMatch | undefined {
    if (pathname === "/") return undefined;

    const slash = pathname.lastIndexOf("/");
    if (slash < 0) return undefined;
    const prefixEnd = slash + 1;
    const key = prefixFingerprint(pathname, prefixEnd);
    const entry = this.#entries.get(key);
    if (entry === undefined) return undefined;

    let trailing: FingerprintTrailingRoute | undefined;

    if (entry.kind === "unique") {
      if (
        entry.prefix.length !== prefixEnd ||
        !pathname.startsWith(entry.prefix)
      ) {
        return undefined;
      }
      trailing = entry.trailing;
    } else {
      const prefix = pathname.slice(0, prefixEnd);
      trailing = entry.routes.get(prefix);
      if (trailing === undefined) return undefined;
    }

    const encodedValue = pathname.slice(prefixEnd);
    return {
      route: trailing.route,
      params: {
        [trailing.paramName]: decodeParam(encodedValue),
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

function codeBefore(value: string, end: number, distance: number): number {
  const index = end - distance;
  return index >= 0 ? value.charCodeAt(index) : 0;
}

function assertCandidateSemantics(): void {
  const candidate = new FingerprintRouter();

  candidate.register(createRoute("/collision/:id", "string"));
  candidate.register(createRoute("/collision/fixed", "string"));
  candidate.register(createRoute("/named/:slug", "string"));
  candidate.register(createRoute("/nested/deep/:id", "string"));

  const staticMatch = candidate.match("GET", "/collision/fixed");
  if (staticMatch?.route.path !== "/collision/fixed") {
    throw new Error("candidate static precedence mismatch");
  }

  const dynamicMatch = candidate.match("GET", "/collision/value");
  if (
    dynamicMatch?.route.path !== "/collision/:id" ||
    dynamicMatch.params.id !== "value"
  ) {
    throw new Error("candidate dynamic match mismatch");
  }

  const namedMatch = candidate.match("GET", "/named/a%20b");
  if (
    namedMatch?.route.path !== "/named/:slug" ||
    namedMatch.params.slug !== "a b"
  ) {
    throw new Error("candidate percent-decoding mismatch");
  }

  if (candidate.match("POST", "/collision/value") !== undefined) {
    throw new Error("candidate method isolation mismatch");
  }

  let duplicateRejected = false;
  try {
    candidate.register(createRoute("/collision/:other", "string"));
  } catch {
    duplicateRejected = true;
  }
  if (!duplicateRejected) {
    throw new Error("candidate duplicate trailing prefix was not rejected");
  }

  const collisionCandidate = new FingerprintRouter();
  collisionCandidate.register(createRoute(collisionRoutePath(1), "string"));
  collisionCandidate.register(createRoute(collisionRoutePath(2), "string"));
  const collisionMatch = collisionCandidate.match(
    "GET",
    collisionRequestPath(2),
  );
  if (
    collisionMatch?.route.path !== collisionRoutePath(2) ||
    collisionMatch.params.id !== PARAM_VALUE
  ) {
    throw new Error("candidate fingerprint collision fallback mismatch");
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
    throw new Error(`Unknown CP3-P cell: ${value}`);
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
