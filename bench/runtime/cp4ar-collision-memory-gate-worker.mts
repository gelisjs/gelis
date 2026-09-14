import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROUTES = 5_000;
const LAST = ROUTES - 1;
const RETAINED_ROUTERS = 32;
const PARAM_VALUE = "value-42";

type SourceLabel = "a" | "b";

interface RuntimeRouteLike {
  readonly method: string;
  readonly path: string;
  readonly handler: (context: { readonly params: Record<string, string> }) => unknown;
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
  readonly source: SourceLabel;
  readonly probeOnly: boolean;
  readonly metric: number | null;
  readonly unit: "bytes/router";
  readonly retainedRouters: number;
  readonly sink: number;
}

const args = readArgs(process.argv.slice(2));
const source = requiredSource(args.source);
const sourceRoot = required(args.sourceRoot, "--source-root");
const probeOnly = args.probeOnly === "true";

if (args.launchGate !== undefined) {
  await waitForLaunchGate(args.launchGate);
}

const routerPath = join(sourceRoot, "src/runtime/router.ts");
const routerModule = (await import(
  `${pathToFileURL(routerPath).href}?cp4ar-memory=${process.pid}-${Date.now()}`
)) as { Router?: RouterConstructor };
const Router = routerModule.Router;
if (Router === undefined) {
  throw new Error(`Router export missing from ${routerPath}`);
}

const routes = buildCollisionRoutes();
assertCorrectness(registerRoutes(Router, routes));

if (probeOnly) {
  emitResult(
    {
      source,
      probeOnly: true,
      metric: null,
      unit: "bytes/router",
      retainedRouters: RETAINED_ROUTERS,
      sink: 0,
    },
    args.resultFile,
  );
} else {
  {
    const warmupRouter = registerRoutes(Router, routes);
    assertCorrectness(warmupRouter);
  }

  forceGc();
  const before = process.memoryUsage().heapUsed;

  const retained: RouterLike[] = [];
  for (let index = 0; index < RETAINED_ROUTERS; index++) {
    retained.push(registerRoutes(Router, routes));
  }

  forceGc();
  const after = process.memoryUsage().heapUsed;
  const lastRouter = retained.at(-1);
  if (lastRouter === undefined) {
    throw new Error("missing retained router");
  }
  const match = assertCorrectness(lastRouter);
  const delta = after - before;
  if (delta <= 0) {
    throw new Error(`non-positive amplified collision router heap delta: ${delta}`);
  }

  emitResult(
    {
      source,
      probeOnly: false,
      metric: delta / RETAINED_ROUTERS,
      unit: "bytes/router",
      retainedRouters: RETAINED_ROUTERS,
      sink: match.route.path.length + retained.length,
    },
    args.resultFile,
  );
}

function buildCollisionRoutes(): RuntimeRouteLike[] {
  const routes: RuntimeRouteLike[] = [];
  for (let index = 0; index < ROUTES; index++) {
    routes.push({
      method: "GET",
      path: collisionRoutePath(index),
      handler: ({ params }) => params.id,
      flags: 0,
      input: undefined,
      beforeHandle: undefined,
      afterHandle: undefined,
      responses: undefined,
    });
  }
  return routes;
}

function registerRoutes(
  Router: RouterConstructor,
  routes: readonly RuntimeRouteLike[],
): RouterLike {
  const router = new Router();
  for (const route of routes) router.register(route);
  return router;
}

function assertCorrectness(router: RouterLike): RouterMatchLike {
  const pathname = collisionRequestPath(LAST);
  const match = router.match("GET", pathname);
  const expectedPath = collisionRoutePath(LAST);
  if (match?.route.path !== expectedPath) {
    throw new Error(
      `collision route mismatch: expected ${expectedPath}, got ${match?.route.path}`,
    );
  }
  if (match.params.id !== PARAM_VALUE) {
    throw new Error(
      `collision param mismatch: expected ${PARAM_VALUE}, got ${String(match.params.id)}`,
    );
  }
  return match;
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

interface ParsedArgs {
  readonly source: string | undefined;
  readonly sourceRoot: string | undefined;
  readonly probeOnly: string | undefined;
  readonly launchGate: string | undefined;
  readonly resultFile: string | undefined;
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
    source: entries.get("source"),
    sourceRoot: entries.get("source-root"),
    probeOnly: entries.get("probe-only"),
    launchGate: entries.get("launch-gate"),
    resultFile: entries.get("result-file"),
  };
}

function required(value: string | undefined, flag: string): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing ${flag}`);
  }
  return value;
}

function requiredSource(value: string | undefined): SourceLabel {
  if (value === "a" || value === "b") return value;
  throw new Error(`Invalid --source: ${String(value)}`);
}

function emitResult(result: WorkerResult, path: string | undefined): void {
  const json = JSON.stringify(result);
  if (path === undefined) {
    console.log(json);
    return;
  }
  writeFileSync(path, json, "utf8");
}

async function waitForLaunchGate(path: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      if (readFileSync(path, "utf8") === "go") return;
    } catch {
      // Parent creates the gate only after affinity and priority are applied.
    }
    await Bun.sleep(2);
  }
  throw new Error(`launch gate timeout: ${path}`);
}
