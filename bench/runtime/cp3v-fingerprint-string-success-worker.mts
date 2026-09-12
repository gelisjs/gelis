import { pathToFileURL } from "node:url";

import { pathnameFromRequestUrl } from "../../src/runtime/url.ts";
import { RUNTIME_ROUTE_PLAIN } from "../../src/runtime/types.ts";

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
const TRAILING_PATH = `/r/${LAST}/${PARAM_VALUE}`;
const TRAILING_REQUEST = new Request(`http://gelis.test${TRAILING_PATH}`);
const GENERIC_PATH = `/g/${LAST}/left/x/right`;
const GENERIC_REQUEST = new Request(`http://gelis.test${GENERIC_PATH}`);
const COLLISION_PATH = collisionRequestPath(LAST);
const COLLISION_REQUEST = new Request(`http://gelis.test${COLLISION_PATH}`);

type Variant = "production" | "candidate";
type BodyKind = "string" | "json";
type Cell =
  | "mixed-static-request"
  | "mixed-dynamic-request"
  | "generic-dynamic-request"
  | "pipeline-string"
  | "pipeline-json"
  | "collision-request"
  | "registration-trailing"
  | "memory-trailing";

type Operation = () => number;

type NormalizeResponse = (value: unknown) => Response;

interface RouterMatch {
  readonly route: RuntimeRouteRecord;
  readonly params: Record<string, string>;
}

interface RouterLike {
  register(route: RuntimeRouteRecord): void;
  registerBatchAtomic(routes: readonly RuntimeRouteRecord[]): void;
  match(method: string, pathname: string): RouterMatch | undefined;
  matchingMethods(pathname: string): string[];
}

interface RouterConstructor {
  new (): RouterLike;
}

interface ResponseModule {
  readonly normalizeResponse: NormalizeResponse;
  readonly runtimeReply: RuntimeRouteContext["reply"];
}

interface WorkerResult {
  readonly cell: Cell;
  readonly variant: Variant;
  readonly probeOnly: boolean;
  readonly metric: number | null;
  readonly unit: "ns/op" | "ms" | "bytes";
  readonly iterations: number;
  readonly warmups: number;
  readonly sink: number;
}

interface PreparedCell {
  readonly unit: WorkerResult["unit"];
  readonly operation?: Operation;
  readonly singleMeasure?: () => { metric: number; sink: number };
  readonly assertCorrectness: () => void | Promise<void>;
}

const CELLS = new Set<Cell>([
  "mixed-static-request",
  "mixed-dynamic-request",
  "generic-dynamic-request",
  "pipeline-string",
  "pipeline-json",
  "collision-request",
  "registration-trailing",
  "memory-trailing",
]);

const args = readArgs(process.argv.slice(2));
const requestedCell = required(args.cell, "--cell");
assertCell(requestedCell);
const cell = requestedCell;
const variant = requiredVariant(args.variant);
const routerPath = required(args.routerPath, "--router-path");
const responsePath = required(args.responsePath, "--response-path");
const probeOnly = args.probeOnly === "true";

const routerModule = (await import(
  `${pathToFileURL(routerPath).href}?cp3v-router=${process.pid}-${Date.now()}`
)) as { Router?: RouterConstructor };
const Router = routerModule.Router;
if (Router === undefined) {
  throw new Error(`Router export missing from ${routerPath}`);
}

const responseModule = (await import(
  `${pathToFileURL(responsePath).href}?cp3v-response=${process.pid}-${Date.now()}`
)) as Partial<ResponseModule>;
if (
  typeof responseModule.normalizeResponse !== "function" ||
  responseModule.runtimeReply === undefined
) {
  throw new Error(`Response exports missing from ${responsePath}`);
}
const normalizeResponse = responseModule.normalizeResponse;
const runtimeReply = responseModule.runtimeReply;

assertRouterSemantics(Router);
const prepared = prepareCell(Router, cell);
await prepared.assertCorrectness();

if (probeOnly) {
  const result: WorkerResult = {
    cell,
    variant,
    probeOnly: true,
    metric: null,
    unit: prepared.unit,
    iterations: 0,
    warmups: 0,
    sink: 0,
  };
  console.log(JSON.stringify(result));
} else if (prepared.singleMeasure !== undefined) {
  const measured = prepared.singleMeasure();
  const result: WorkerResult = {
    cell,
    variant,
    probeOnly: false,
    metric: measured.metric,
    unit: prepared.unit,
    iterations: 1,
    warmups: 1,
    sink: measured.sink,
  };
  console.log(JSON.stringify(result));
} else {
  const cellOperation = prepared.operation;
  if (cellOperation === undefined) {
    throw new Error(`Missing operation for ${cell}`);
  }

  let sink = 0;
  const operation = () => {
    const value = cellOperation();
    sink = ((sink << 5) - sink + value) | 0;
  };

  for (let index = 0; index < WARMUP; index++) operation();

  const iterations = calibrate(operation);
  const elapsed = measure(operation, iterations);
  const result: WorkerResult = {
    cell,
    variant,
    probeOnly: false,
    metric: (elapsed * 1_000_000) / iterations,
    unit: "ns/op",
    iterations,
    warmups: WARMUP,
    sink,
  };
  console.log(JSON.stringify(result));
}

function prepareCell(Router: RouterConstructor, cell: Cell): PreparedCell {
  switch (cell) {
    case "mixed-static-request":
      return mixedCell(Router, false);
    case "mixed-dynamic-request":
      return mixedCell(Router, true);
    case "generic-dynamic-request":
      return genericCell(Router);
    case "pipeline-string":
      return pipelineCell(Router, "string");
    case "pipeline-json":
      return pipelineCell(Router, "json");
    case "collision-request":
      return collisionCell(Router);
    case "registration-trailing":
      return registrationCell(Router);
    case "memory-trailing":
      return memoryCell(Router);
  }
}

function mixedCell(Router: RouterConstructor, dynamic: boolean): PreparedCell {
  const router = buildMixedRouter(Router);
  const request = dynamic ? MIXED_DYNAMIC_REQUEST : MIXED_STATIC_REQUEST;
  const expectedPath = dynamic ? `/d/${MIXED_LAST}/:id` : `/s/${MIXED_LAST}`;

  const run = () => {
    const match = router.match("GET", pathnameFromRequestUrl(request.url));
    if (match === undefined) throw new Error("mixed route miss");
    return match;
  };

  return {
    unit: "ns/op",
    operation: () => consumeMatch(run(), dynamic),
    assertCorrectness: () => assertMixedMatch(run(), expectedPath, dynamic),
  };
}

function genericCell(Router: RouterConstructor): PreparedCell {
  const router = new Router();
  for (let index = 0; index < ROUTES; index++) {
    router.register(createRoute(`/g/${index}/:left/x/:right`, "string"));
  }

  const run = () => {
    const match = router.match(
      "GET",
      pathnameFromRequestUrl(GENERIC_REQUEST.url),
    );
    if (match === undefined) throw new Error("generic route miss");
    return match;
  };

  return {
    unit: "ns/op",
    operation: () => {
      const match = run();
      return (
        match.route.path.length +
        (match.params.left?.length ?? 0) +
        (match.params.right?.length ?? 0)
      );
    },
    assertCorrectness: () => {
      const match = run();
      if (match.route.path !== `/g/${LAST}/:left/x/:right`) {
        throw new Error(`generic path mismatch: ${match.route.path}`);
      }
      if (match.params.left !== "left" || match.params.right !== "right") {
        throw new Error(
          `generic params mismatch: ${JSON.stringify(match.params)}`,
        );
      }
    },
  };
}

function pipelineCell(
  Router: RouterConstructor,
  bodyKind: BodyKind,
): PreparedCell {
  const router = buildTrailingRouter(Router, bodyKind);
  const expectedBody =
    bodyKind === "json" ? JSON.stringify({ id: PARAM_VALUE }) : PARAM_VALUE;

  const run = (): Response => {
    const match = router.match(
      "GET",
      pathnameFromRequestUrl(TRAILING_REQUEST.url),
    );
    if (match === undefined) throw new Error("pipeline route miss");
    const value = match.route.handler(
      createContext(TRAILING_REQUEST, match.params),
    );
    assertSync(value, "pipeline handler");
    return normalizeResponse(value);
  };

  return {
    unit: "ns/op",
    operation: () => run().status,
    assertCorrectness: async () => {
      await assertResponse(run(), expectedBody, bodyKind === "json");
    },
  };
}

function collisionCell(Router: RouterConstructor): PreparedCell {
  const router = new Router();
  for (let index = 0; index < ROUTES; index++) {
    router.register(createRoute(collisionRoutePath(index), "string"));
  }

  const run = () => {
    const match = router.match(
      "GET",
      pathnameFromRequestUrl(COLLISION_REQUEST.url),
    );
    if (match === undefined) throw new Error("collision route miss");
    return match;
  };

  return {
    unit: "ns/op",
    operation: () => consumeMatch(run(), true),
    assertCorrectness: () => {
      const match = run();
      if (match.route.path !== collisionRoutePath(LAST)) {
        throw new Error(`collision path mismatch: ${match.route.path}`);
      }
      if (match.params.id !== PARAM_VALUE) {
        throw new Error(`collision param mismatch: ${match.params.id}`);
      }
    },
  };
}

function registrationCell(Router: RouterConstructor): PreparedCell {
  const routes = buildTrailingRoutes("string");

  return {
    unit: "ms",
    assertCorrectness: () => {
      const router = registerRoutes(Router, routes);
      assertLastTrailingMatch(router);
    },
    singleMeasure: () => {
      const warmupRouter = registerRoutes(Router, routes);
      const warmupMatch = warmupRouter.match("GET", TRAILING_PATH);
      if (warmupMatch === undefined) {
        throw new Error("registration warmup miss");
      }
      forceGc();

      const start = performance.now();
      const router = registerRoutes(Router, routes);
      const elapsed = performance.now() - start;
      const match = router.match("GET", TRAILING_PATH);
      if (match === undefined) throw new Error("registration measured miss");
      return {
        metric: elapsed,
        sink: consumeMatch(match, true),
      };
    },
  };
}

function memoryCell(Router: RouterConstructor): PreparedCell {
  const routes = buildTrailingRoutes("string");

  return {
    unit: "bytes",
    assertCorrectness: () => {
      const router = registerRoutes(Router, routes);
      assertLastTrailingMatch(router);
    },
    singleMeasure: () => {
      forceGc();
      const before = process.memoryUsage().heapUsed;
      const router = registerRoutes(Router, routes);
      forceGc();
      const after = process.memoryUsage().heapUsed;
      const match = router.match("GET", TRAILING_PATH);
      if (match === undefined) throw new Error("memory measured miss");
      const delta = after - before;
      if (delta <= 0) {
        throw new Error(`non-positive router heap delta: ${delta}`);
      }
      return {
        metric: delta,
        sink: consumeMatch(match, true),
      };
    },
  };
}

function buildMixedRouter(Router: RouterConstructor): RouterLike {
  const router = new Router();
  for (let index = 0; index < MIXED_ROUTES_PER_KIND; index++) {
    router.register(createRoute(`/s/${index}`, "string"));
    router.register(createRoute(`/d/${index}/:id`, "string"));
  }
  return router;
}

function buildTrailingRouter(
  Router: RouterConstructor,
  bodyKind: BodyKind,
): RouterLike {
  return registerRoutes(Router, buildTrailingRoutes(bodyKind));
}

function buildTrailingRoutes(bodyKind: BodyKind): RuntimeRouteRecord[] {
  const routes: RuntimeRouteRecord[] = [];
  for (let index = 0; index < ROUTES; index++) {
    routes.push(createRoute(`/r/${index}/:id`, bodyKind));
  }
  return routes;
}

function registerRoutes(
  Router: RouterConstructor,
  routes: readonly RuntimeRouteRecord[],
): RouterLike {
  const router = new Router();
  for (const route of routes) router.register(route);
  return router;
}

function assertLastTrailingMatch(router: RouterLike): void {
  const match = router.match("GET", TRAILING_PATH);
  if (
    match?.route.path !== `/r/${LAST}/:id` ||
    match.params.id !== PARAM_VALUE
  ) {
    throw new Error("last trailing route mismatch");
  }
}

function createRoute(path: string, bodyKind: BodyKind): RuntimeRouteRecord {
  const handler: RuntimeRouteHandler =
    bodyKind === "json"
      ? ({ params }) => ({ id: params.id })
      : ({ params }) => params.id ?? PARAM_VALUE;

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

function createMethodRoute(method: string, path: string): RuntimeRouteRecord {
  return {
    ...createRoute(path, "string"),
    method,
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

function assertRouterSemantics(Router: RouterConstructor): void {
  const router = new Router();
  router.register(createRoute("/probe/:id", "string"));
  router.register(createRoute("/probe/fixed", "string"));
  router.register(createRoute("/named/:slug", "string"));
  router.register(createMethodRoute("POST", "/probe/:id"));

  const staticMatch = router.match("GET", "/probe/fixed");
  if (staticMatch?.route.path !== "/probe/fixed") {
    throw new Error("static precedence mismatch");
  }

  const trailingMatch = router.match("GET", "/probe/value");
  if (
    trailingMatch?.route.path !== "/probe/:id" ||
    trailingMatch.params.id !== "value"
  ) {
    throw new Error("trailing parameter mismatch");
  }

  const namedMatch = router.match("GET", "/named/a%20b");
  if (
    namedMatch?.route.path !== "/named/:slug" ||
    namedMatch.params.slug !== "a b"
  ) {
    throw new Error("named/decoded parameter mismatch");
  }

  if (router.match("DELETE", "/probe/value") !== undefined) {
    throw new Error("method isolation mismatch");
  }

  const methods = router.matchingMethods("/probe/value");
  if (!methods.includes("GET") || !methods.includes("POST")) {
    throw new Error(`matchingMethods mismatch: ${methods.join(",")}`);
  }

  let duplicateRejected = false;
  try {
    router.register(createRoute("/probe/:other", "string"));
  } catch {
    duplicateRejected = true;
  }
  if (!duplicateRejected) {
    throw new Error("duplicate trailing prefix not rejected");
  }

  const migrating = new Router();
  migrating.register(createRoute("/m/:id", "string"));
  migrating.register(createRoute("/m/:left/x/:right", "string"));
  const migratedTrailing = migrating.match("GET", "/m/value");
  const generic = migrating.match("GET", "/m/a/x/b");
  if (
    migratedTrailing?.params.id !== "value" ||
    generic?.params.left !== "a" ||
    generic.params.right !== "b"
  ) {
    throw new Error("generic-trie migration mismatch");
  }

  const batch = new Router();
  batch.register(createRoute("/base", "string"));
  batch.registerBatchAtomic([
    createRoute("/batch/static", "string"),
    createRoute("/batch/:id", "string"),
  ]);
  if (
    batch.match("GET", "/batch/static")?.route.path !== "/batch/static" ||
    batch.match("GET", "/batch/value")?.params.id !== "value"
  ) {
    throw new Error("registerBatchAtomic success mismatch");
  }

  let rollbackRejected = false;
  try {
    batch.registerBatchAtomic([
      createRoute("/rollback/new", "string"),
      createRoute("/base", "string"),
    ]);
  } catch {
    rollbackRejected = true;
  }
  if (!rollbackRejected || batch.match("GET", "/rollback/new") !== undefined) {
    throw new Error("registerBatchAtomic rollback mismatch");
  }

  const collision = new Router();
  collision.register(createRoute(collisionRoutePath(1), "string"));
  collision.register(createRoute(collisionRoutePath(2), "string"));
  const collisionMatch = collision.match("GET", collisionRequestPath(2));
  if (
    collisionMatch?.route.path !== collisionRoutePath(2) ||
    collisionMatch.params.id !== PARAM_VALUE
  ) {
    throw new Error("fingerprint collision exactness mismatch");
  }
}

function assertMixedMatch(
  match: RouterMatch,
  expectedPath: string,
  dynamic: boolean,
): void {
  if (match.route.path !== expectedPath) {
    throw new Error(`mixed path mismatch: ${match.route.path}`);
  }
  if (dynamic) {
    if (match.params.id !== PARAM_VALUE) {
      throw new Error(`mixed dynamic param mismatch: ${match.params.id}`);
    }
  } else if (Object.keys(match.params).length !== 0) {
    throw new Error("mixed static route unexpectedly produced params");
  }
}

function consumeMatch(match: RouterMatch, dynamic: boolean): number {
  return (
    match.route.path.length +
    (dynamic
      ? (match.params.id?.length ?? 0)
      : Object.keys(match.params).length)
  );
}

async function assertResponse(
  response: Response,
  expectedBody: string,
  expectJson: boolean,
): Promise<void> {
  if (response.status !== 200) {
    throw new Error(`response status mismatch: ${response.status}`);
  }
  if (response.statusText !== "") {
    throw new Error(`response statusText mismatch: ${response.statusText}`);
  }
  const body = await response.text();
  if (body !== expectedBody) {
    throw new Error(
      `response body mismatch: expected ${expectedBody}, got ${body}`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (expectJson) {
    const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
    if (mediaType !== "application/json") {
      throw new Error(`JSON media type mismatch: ${mediaType}`);
    }
  } else if (contentType !== "text/plain; charset=utf-8") {
    throw new Error(`text Content-Type mismatch: ${contentType}`);
  }
}

function collisionRoutePath(index: number): string {
  return `/collision/${index.toString().padStart(4, "0")}aaaa/:id`;
}

function collisionRequestPath(index: number): string {
  return `/collision/${index.toString().padStart(4, "0")}aaaa/${PARAM_VALUE}`;
}

function forceGc(): void {
  Bun.gc(true);
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
  readonly variant: string | undefined;
  readonly routerPath: string | undefined;
  readonly responsePath: string | undefined;
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
    variant: entries.get("variant"),
    routerPath: entries.get("router-path"),
    responsePath: entries.get("response-path"),
    probeOnly: entries.get("probe-only"),
  };
}

function required(value: string | undefined, flag: string): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing ${flag}`);
  }
  return value;
}

function requiredVariant(value: string | undefined): Variant {
  if (value === "production" || value === "candidate") return value;
  throw new Error(`Invalid --variant: ${value}`);
}

function assertCell(value: string): asserts value is Cell {
  if (!CELLS.has(value as Cell)) {
    throw new Error(`Unknown CP3-V cell: ${value}`);
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
