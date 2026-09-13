import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROUTES = 5_000;
const MIXED_ROUTES_PER_KIND = ROUTES / 2;
const LAST = ROUTES - 1;
const MIXED_LAST = MIXED_ROUTES_PER_KIND - 1;
const PARAM_VALUE = "value-42";
const WARMUP = 20_000;
const TARGET_MS = 120;
const MIN_CALIBRATION_MS = 20;

type Variant = "control" | "candidate";
type Unit = "ns/op" | "ms" | "bytes";
type Cell =
  | "static-only-raw"
  | "mixed-static-raw"
  | "mixed-dynamic-raw"
  | "mixed-dynamic-json"
  | "mixed-same-length-dynamic-raw"
  | "trailing-dynamic-raw"
  | "trailing-dynamic-json"
  | "generic-dynamic-raw"
  | "collision-dynamic-raw"
  | "all-dynamic-raw"
  | "static-registration"
  | "static-memory";

type Operation = () => number;

type HandlerContext = {
  readonly params: Record<string, string>;
};

interface GelisLike {
  get(path: string, handler: (context: HandlerContext) => unknown): unknown;
  all(path: string, handler: (context: HandlerContext) => unknown): unknown;
  fetch(request: Request): Response | PromiseLike<Response>;
}

interface GelisConstructor {
  new (): GelisLike;
}

interface RuntimeRouteLike {
  readonly method: string;
  readonly path: string;
  readonly handler: (context: HandlerContext) => unknown;
  readonly flags: number;
  readonly input: undefined;
  readonly beforeHandle: undefined;
  readonly afterHandle: undefined;
  readonly responses: undefined;
}

interface RouterMatchLike {
  readonly route: RuntimeRouteLike;
  readonly params: Record<string, string>;
}

interface RouterLike {
  register(route: RuntimeRouteLike): void;
  match(method: string, pathname: string): RouterMatchLike | undefined;
}

interface RouterConstructor {
  new (): RouterLike;
}

interface WorkerResult {
  readonly cell: Cell;
  readonly variant: Variant;
  readonly probeOnly: boolean;
  readonly metric: number | null;
  readonly unit: Unit;
  readonly iterations: number;
  readonly warmups: number;
  readonly sink: number;
}

interface PreparedCell {
  readonly unit: Unit;
  readonly operation?: Operation;
  readonly singleMeasure?: () => { metric: number; sink: number };
  readonly assertCorrectness: () => void | Promise<void>;
}

const CELLS = new Set<Cell>([
  "static-only-raw",
  "mixed-static-raw",
  "mixed-dynamic-raw",
  "mixed-dynamic-json",
  "mixed-same-length-dynamic-raw",
  "trailing-dynamic-raw",
  "trailing-dynamic-json",
  "generic-dynamic-raw",
  "collision-dynamic-raw",
  "all-dynamic-raw",
  "static-registration",
  "static-memory",
]);

const args = readArgs(process.argv.slice(2));
const requestedCell = required(args.cell, "--cell");
assertCell(requestedCell);
const cell = requestedCell;
const variant = requiredVariant(args.variant);
const sourceRoot = required(args.sourceRoot, "--source-root");
const probeOnly = args.probeOnly === "true";

const appPath = join(sourceRoot, "src/app.ts");
const routerPath = join(sourceRoot, "src/runtime/router.ts");

const appModule = (await import(
  `${pathToFileURL(appPath).href}?cp4o-app=${process.pid}-${Date.now()}`
)) as { Gelis?: GelisConstructor };
const Gelis = appModule.Gelis;
if (Gelis === undefined) {
  throw new Error(`Gelis export missing from ${appPath}`);
}

const routerModule = (await import(
  `${pathToFileURL(routerPath).href}?cp4o-router=${process.pid}-${Date.now()}`
)) as { Router?: RouterConstructor };
const Router = routerModule.Router;
if (Router === undefined) {
  throw new Error(`Router export missing from ${routerPath}`);
}

const prepared = prepareCell(Gelis, Router, cell);
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
    unit: prepared.unit,
    iterations,
    warmups: WARMUP,
    sink,
  };
  console.log(JSON.stringify(result));
}

function prepareCell(
  Gelis: GelisConstructor,
  Router: RouterConstructor,
  cell: Cell,
): PreparedCell {
  switch (cell) {
    case "static-only-raw":
      return staticOnlyCell(Gelis);
    case "mixed-static-raw":
      return mixedCell(Gelis, "static", "raw");
    case "mixed-dynamic-raw":
      return mixedCell(Gelis, "dynamic", "raw");
    case "mixed-dynamic-json":
      return mixedCell(Gelis, "dynamic", "json");
    case "mixed-same-length-dynamic-raw":
      return mixedSameLengthCell(Gelis);
    case "trailing-dynamic-raw":
      return trailingCell(Gelis, "raw");
    case "trailing-dynamic-json":
      return trailingCell(Gelis, "json");
    case "generic-dynamic-raw":
      return genericCell(Gelis);
    case "collision-dynamic-raw":
      return collisionCell(Gelis);
    case "all-dynamic-raw":
      return allCell(Gelis);
    case "static-registration":
      return staticRegistrationCell(Router);
    case "static-memory":
      return staticMemoryCell(Router);
  }
}

function staticOnlyCell(Gelis: GelisConstructor): PreparedCell {
  const app = new Gelis();
  for (let index = 0; index < ROUTES; index++) {
    app.get(`/s/${index}`, () => "static");
  }

  const request = new Request(`http://gelis.test/s/${LAST}?source=cp4i`);
  return responseCell(app, request, "static", false);
}

function mixedCell(
  Gelis: GelisConstructor,
  target: "static" | "dynamic",
  bodyKind: "raw" | "json",
): PreparedCell {
  const app = new Gelis();

  for (let index = 0; index < MIXED_ROUTES_PER_KIND; index++) {
    app.get(`/s/${index}`, () => "static");
    app.get(`/d/${index}/:id`, ({ params }) =>
      bodyKind === "json" ? { id: params.id } : params.id,
    );
  }

  if (target === "static") {
    const request = new Request(
      `http://gelis.test/s/${MIXED_LAST}?source=cp4i`,
    );
    return responseCell(app, request, "static", false);
  }

  const request = new Request(
    `http://gelis.test/d/${MIXED_LAST}/${PARAM_VALUE}?source=cp4i`,
  );
  const expected =
    bodyKind === "json" ? JSON.stringify({ id: PARAM_VALUE }) : PARAM_VALUE;
  return responseCell(app, request, expected, bodyKind === "json");
}

function mixedSameLengthCell(Gelis: GelisConstructor): PreparedCell {
  const app = new Gelis();

  for (let index = 0; index < MIXED_ROUTES_PER_KIND; index++) {
    const token = index.toString().padStart(4, "0");
    app.get(`/s/${token}/abcdefgh`, () => "static");
    app.get(`/d/${token}/:id`, ({ params }) => params.id);
  }

  const token = MIXED_LAST.toString().padStart(4, "0");
  const requestPath = `/d/${token}/${PARAM_VALUE}`;
  const staticLength = `/s/${token}/abcdefgh`.length;
  if (requestPath.length !== staticLength) {
    throw new Error(
      `same-length setup mismatch: dynamic=${requestPath.length}, static=${staticLength}`,
    );
  }

  const request = new Request(`http://gelis.test${requestPath}?source=cp4i`);
  return responseCell(app, request, PARAM_VALUE, false);
}

function trailingCell(
  Gelis: GelisConstructor,
  bodyKind: "raw" | "json",
): PreparedCell {
  const app = new Gelis();

  for (let index = 0; index < ROUTES; index++) {
    app.get(`/r/${index}/:id`, ({ params }) =>
      bodyKind === "json" ? { id: params.id } : params.id,
    );
  }

  const request = new Request(
    `http://gelis.test/r/${LAST}/${PARAM_VALUE}?source=cp4i`,
  );
  const expected =
    bodyKind === "json" ? JSON.stringify({ id: PARAM_VALUE }) : PARAM_VALUE;
  return responseCell(app, request, expected, bodyKind === "json");
}

function genericCell(Gelis: GelisConstructor): PreparedCell {
  const app = new Gelis();

  for (let index = 0; index < ROUTES; index++) {
    app.get(`/g/${index}/:left/x/:right`, ({ params }) => params.right);
  }

  const request = new Request(
    `http://gelis.test/g/${LAST}/left/x/right?source=cp4i`,
  );
  return responseCell(app, request, "right", false);
}

function collisionCell(Gelis: GelisConstructor): PreparedCell {
  const app = new Gelis();

  for (let index = 0; index < ROUTES; index++) {
    app.get(collisionRoutePath(index), ({ params }) => params.id);
  }

  const request = new Request(
    `http://gelis.test${collisionRequestPath(LAST)}?source=cp4i`,
  );
  return responseCell(app, request, PARAM_VALUE, false);
}

function allCell(Gelis: GelisConstructor): PreparedCell {
  const app = new Gelis();

  for (let index = 0; index < ROUTES; index++) {
    app.all(`/a/${index}/:id`, ({ params }) => params.id);
  }

  const request = new Request(
    `http://gelis.test/a/${LAST}/${PARAM_VALUE}?source=cp4i`,
    { method: "PATCH" },
  );
  return responseCell(app, request, PARAM_VALUE, false);
}

function staticRegistrationCell(Router: RouterConstructor): PreparedCell {
  const routes = buildStaticRoutes();

  return {
    unit: "ms",
    assertCorrectness: () => {
      const router = registerRoutes(Router, routes);
      assertLastStaticMatch(router);
    },
    singleMeasure: () => {
      const warmupRouter = registerRoutes(Router, routes);
      assertLastStaticMatch(warmupRouter);
      forceGc();

      const start = performance.now();
      const router = registerRoutes(Router, routes);
      const elapsed = performance.now() - start;
      const match = assertLastStaticMatch(router);
      return {
        metric: elapsed,
        sink: match.route.path.length,
      };
    },
  };
}

function staticMemoryCell(Router: RouterConstructor): PreparedCell {
  const routes = buildStaticRoutes();

  return {
    unit: "bytes",
    assertCorrectness: () => {
      const router = registerRoutes(Router, routes);
      assertLastStaticMatch(router);
    },
    singleMeasure: () => {
      forceGc();
      const before = process.memoryUsage().heapUsed;
      const router = registerRoutes(Router, routes);
      forceGc();
      const after = process.memoryUsage().heapUsed;
      const match = assertLastStaticMatch(router);
      const delta = after - before;
      if (delta <= 0) {
        throw new Error(`non-positive static router heap delta: ${delta}`);
      }
      return {
        metric: delta,
        sink: match.route.path.length,
      };
    },
  };
}

function buildStaticRoutes(): RuntimeRouteLike[] {
  const routes: RuntimeRouteLike[] = [];
  for (let index = 0; index < ROUTES; index++) {
    routes.push(createStaticRoute(`/s/${index}`));
  }
  return routes;
}

function createStaticRoute(path: string): RuntimeRouteLike {
  return {
    method: "GET",
    path,
    handler: () => "static",
    flags: 0,
    input: undefined,
    beforeHandle: undefined,
    afterHandle: undefined,
    responses: undefined,
  };
}

function registerRoutes(
  Router: RouterConstructor,
  routes: readonly RuntimeRouteLike[],
): RouterLike {
  const router = new Router();
  for (const route of routes) router.register(route);
  return router;
}

function assertLastStaticMatch(router: RouterLike): RouterMatchLike {
  const match = router.match("GET", `/s/${LAST}`);
  if (match?.route.path !== `/s/${LAST}`) {
    throw new Error(`last static route mismatch: ${match?.route.path}`);
  }
  return match;
}

function responseCell(
  app: GelisLike,
  request: Request,
  expectedBody: string,
  expectJson: boolean,
): PreparedCell {
  const run = (): Response => {
    const response = app.fetch(request);
    assertSync(response, "app.fetch");
    return response;
  };

  return {
    unit: "ns/op",
    operation: () => consumeResponse(run()),
    assertCorrectness: async () => {
      const response = run();
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
    },
  };
}

function consumeResponse(response: Response): number {
  return response.status + (response.headers.get("content-type")?.length ?? 0);
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
  readonly sourceRoot: string | undefined;
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
    sourceRoot: entries.get("source-root"),
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
  if (value === "control" || value === "candidate") {
    return value;
  }
  throw new Error(`Invalid --variant: ${String(value)}`);
}

function assertCell(value: string): asserts value is Cell {
  if (!CELLS.has(value as Cell)) {
    throw new Error(`Unknown CP4-D cell: ${value}`);
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
