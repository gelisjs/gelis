import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Hono } from "hono";
import { timeout as honoTimeout } from "hono/timeout";

const WARMUP_ASYNC = 4_000;
const WARMUP_SYNC = 10_000;
const TARGET_MS = 120;
const MIN_CALIBRATION_MS = 20;
const DIRECT_TIMEOUT_MS = 60_000;
const FIRE_TIMEOUT_MS = 10;

type Framework = "gelis" | "hono";
type DirectScenario =
  | "application-sync-static-204"
  | "application-async-static-204"
  | "route-sync-static-204"
  | "route-async-static-204";
type Mode = "direct" | "route-scale" | "fire";

interface DirectWorkerResult {
  readonly mode: "direct";
  readonly framework: Framework;
  readonly scenario: DirectScenario;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number;
  readonly sink: number;
}

interface RouteScaleWorkerResult {
  readonly mode: "route-scale";
  readonly routes: 1_000 | 5_000;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number;
  readonly sink: number;
}

interface FireWorkerResult {
  readonly mode: "fire";
  readonly framework: Framework;
  readonly durationMs: number;
  readonly elapsedMs: number;
  readonly status: number;
}

interface BenchmarkGelisApp {
  use(plugin: unknown): unknown;
  get(
    path: string,
    handler: (context: { readonly request: Request }) => unknown,
  ): unknown;
  get(
    path: string,
    options: { readonly timeout: number },
    handler: (context: { readonly request: Request }) => unknown,
  ): unknown;
  fetch(request: Request): Response | Promise<Response>;
}

interface ParsedArgs {
  readonly mode?: string | undefined;
  readonly framework?: string | undefined;
  readonly scenario?: string | undefined;
  readonly routes?: string | undefined;
  readonly candidateRoot?: string | undefined;
}

interface BenchmarkDispatch {
  readonly dispatch: (request: Request) => Response | Promise<Response>;
}

const args = readArgs(process.argv.slice(2));
const mode = required(args.mode, "--mode") as Mode;
assertMode(mode);

if (mode === "direct") {
  console.log(JSON.stringify(await runDirect(args)));
} else if (mode === "route-scale") {
  console.log(JSON.stringify(await runRouteScale(args)));
} else {
  console.log(JSON.stringify(await runFire(args)));
}

async function runDirect(args: ParsedArgs): Promise<DirectWorkerResult> {
  const framework = required(args.framework, "--framework") as Framework;
  const scenario = required(args.scenario, "--scenario") as DirectScenario;
  const candidateRoot = required(args.candidateRoot, "--candidate-root");

  assertFramework(framework);
  assertDirectScenario(scenario);

  const benchmark =
    framework === "gelis"
      ? await createGelisDirectBenchmark(candidateRoot, scenario)
      : createHonoDirectBenchmark(scenario);
  const request = new Request("http://gelis.test/resource");

  await verifyDispatch(benchmark, request, `${framework}/${scenario}`);

  let sink = 0;
  const operation = async () => {
    const result = benchmark.dispatch(request);
    const response = result instanceof Response ? result : await result;

    if (response.status !== 204) {
      throw new Error(`${framework}/${scenario} returned ${response.status}`);
    }

    sink ^= response.status;
  };

  for (let index = 0; index < WARMUP_ASYNC; index++) {
    await operation();
  }

  const iterations = await calibrateAsync(operation);
  const elapsed = await measureAsync(operation, iterations);

  return {
    mode: "direct",
    framework,
    scenario,
    iterations,
    warmups: WARMUP_ASYNC,
    nsPerOp: (elapsed * 1_000_000) / iterations,
    sink,
  };
}

async function runRouteScale(args: ParsedArgs): Promise<RouteScaleWorkerResult> {
  const candidateRoot = required(args.candidateRoot, "--candidate-root");
  const routes = Number(required(args.routes, "--routes"));

  if (routes !== 1_000 && routes !== 5_000) {
    throw new Error(`P11-G10 route-scale requires 1000 or 5000 routes, got ${routes}`);
  }

  const benchmark = await createGelisRouteScaleBenchmark(candidateRoot, routes);
  const request = new Request("http://gelis.test/route/0");

  const verification = benchmark.dispatch(request);
  if (!(verification instanceof Response) || verification.status !== 204) {
    throw new Error("P11-G10 route-scale synchronous verification failed");
  }

  let sink = 0;
  const operation = () => {
    const response = benchmark.dispatch(request);

    if (!(response instanceof Response) || response.status !== 204) {
      throw new Error("P11-G10 route-scale synchronous operation mismatch");
    }

    sink ^= response.status;
  };

  for (let index = 0; index < WARMUP_SYNC; index++) {
    operation();
  }

  const iterations = calibrateSync(operation);
  const elapsed = measureSync(operation, iterations);

  return {
    mode: "route-scale",
    routes,
    iterations,
    warmups: WARMUP_SYNC,
    nsPerOp: (elapsed * 1_000_000) / iterations,
    sink,
  };
}

async function runFire(args: ParsedArgs): Promise<FireWorkerResult> {
  const framework = required(args.framework, "--framework") as Framework;
  const candidateRoot = required(args.candidateRoot, "--candidate-root");

  assertFramework(framework);

  const benchmark =
    framework === "gelis"
      ? await createGelisFireBenchmark(candidateRoot)
      : createHonoFireBenchmark();
  const request = new Request("http://gelis.test/resource");
  const started = performance.now();
  const response = await benchmark.dispatch(request);
  const elapsedMs = performance.now() - started;

  if (response.status !== 504) {
    throw new Error(`${framework} timeout-fire diagnostic returned ${response.status}`);
  }

  return {
    mode: "fire",
    framework,
    durationMs: FIRE_TIMEOUT_MS,
    elapsedMs,
    status: response.status,
  };
}

async function createGelisDirectBenchmark(
  candidateRoot: string,
  scenario: DirectScenario,
): Promise<BenchmarkDispatch> {
  const { Gelis, timeout } = await importGelisTimeout(candidateRoot);
  const app = new Gelis();
  const applicationTimeout = scenario.startsWith("application-");
  const asynchronous = scenario.includes("-async-");

  app.use(
    applicationTimeout
      ? timeout({ duration: DIRECT_TIMEOUT_MS })
      : timeout(),
  );

  const handler = asynchronous
    ? () => Promise.resolve(new Response(null, { status: 204 }))
    : () => new Response(null, { status: 204 });

  if (applicationTimeout) {
    app.get("/resource", handler);
  } else {
    app.get("/resource", { timeout: DIRECT_TIMEOUT_MS }, handler);
  }

  return {
    dispatch: (request) => app.fetch(request),
  };
}

function createHonoDirectBenchmark(scenario: DirectScenario): BenchmarkDispatch {
  const app = new Hono();
  const applicationTimeout = scenario.startsWith("application-");
  const asynchronous = scenario.includes("-async-");

  if (applicationTimeout) {
    app.use("*", honoTimeout(DIRECT_TIMEOUT_MS));
  } else {
    app.use("/resource", honoTimeout(DIRECT_TIMEOUT_MS));
  }

  if (asynchronous) {
    app.get("/resource", async () => new Response(null, { status: 204 }));
  } else {
    app.get("/resource", () => new Response(null, { status: 204 }));
  }

  return {
    dispatch: (request) => app.request(request),
  };
}

async function createGelisRouteScaleBenchmark(
  candidateRoot: string,
  routes: 1_000 | 5_000,
): Promise<BenchmarkDispatch> {
  const { Gelis, timeout } = await importGelisTimeout(candidateRoot);
  const app = new Gelis();

  app.use(timeout());

  for (let index = 0; index < routes; index++) {
    app.get(
      `/route/${index}`,
      { timeout: DIRECT_TIMEOUT_MS },
      () => new Response(null, { status: 204 }),
    );
  }

  return {
    dispatch: (request) => app.fetch(request),
  };
}

async function createGelisFireBenchmark(
  candidateRoot: string,
): Promise<BenchmarkDispatch> {
  const { Gelis, timeout } = await importGelisTimeout(candidateRoot);
  const app = new Gelis();

  app.use(timeout({ duration: FIRE_TIMEOUT_MS }));
  app.get("/resource", () => new Promise<Response>(() => {}));

  return {
    dispatch: (request) => app.fetch(request),
  };
}

function createHonoFireBenchmark(): BenchmarkDispatch {
  const app = new Hono();

  app.use("*", honoTimeout(FIRE_TIMEOUT_MS));
  app.get("/resource", () => new Promise<Response>(() => {}));

  return {
    dispatch: (request) => app.request(request),
  };
}

async function importGelisTimeout(candidateRoot: string): Promise<{
  Gelis: new () => BenchmarkGelisApp;
  timeout: (options?: { readonly duration?: number }) => unknown;
}> {
  const coreUrl = pathToFileURL(resolve(candidateRoot, "src/index.ts")).href;
  const timeoutUrl = pathToFileURL(
    resolve(candidateRoot, "src/timeout/index.ts"),
  ).href;

  const [coreModule, timeoutModule] = await Promise.all([
    import(coreUrl) as Promise<{
      Gelis: new () => BenchmarkGelisApp;
    }>,
    import(timeoutUrl) as Promise<{
      timeout: (options?: { readonly duration?: number }) => unknown;
    }>,
  ]);

  return {
    Gelis: coreModule.Gelis,
    timeout: timeoutModule.timeout,
  };
}

async function verifyDispatch(
  benchmark: BenchmarkDispatch,
  request: Request,
  identity: string,
): Promise<void> {
  const result = benchmark.dispatch(request);
  const response = result instanceof Response ? result : await result;

  if (response.status !== 204) {
    throw new Error(`${identity} verification returned ${response.status}`);
  }
}

function readArgs(values: readonly string[]): ParsedArgs {
  const entries = new Map<string, string>();

  for (const value of values) {
    if (!value.startsWith("--")) {
      continue;
    }

    const separator = value.indexOf("=");
    if (separator === -1) {
      continue;
    }

    entries.set(value.slice(2, separator), value.slice(separator + 1));
  }

  return {
    mode: entries.get("mode"),
    framework: entries.get("framework"),
    scenario: entries.get("scenario"),
    routes: entries.get("routes"),
    candidateRoot: entries.get("candidate-root"),
  };
}

function required(value: string | undefined, name: string): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

function assertMode(value: string): asserts value is Mode {
  if (value !== "direct" && value !== "route-scale" && value !== "fire") {
    throw new Error(`Unknown P11-G10 worker mode: ${value}`);
  }
}

function assertFramework(value: string): asserts value is Framework {
  if (value !== "gelis" && value !== "hono") {
    throw new Error(`Unknown framework: ${value}`);
  }
}

function assertDirectScenario(value: string): asserts value is DirectScenario {
  if (
    value !== "application-sync-static-204" &&
    value !== "application-async-static-204" &&
    value !== "route-sync-static-204" &&
    value !== "route-async-static-204"
  ) {
    throw new Error(`Unknown timeout scenario: ${value}`);
  }
}

async function calibrateAsync(operation: () => Promise<void>): Promise<number> {
  let iterations = 100;

  while (true) {
    const elapsed = await measureAsync(operation, iterations);

    if (elapsed >= MIN_CALIBRATION_MS) {
      return Math.max(
        1,
        Math.round((iterations * TARGET_MS) / Math.max(elapsed, 0.001)),
      );
    }

    iterations *= 2;
  }
}

async function measureAsync(
  operation: () => Promise<void>,
  iterations: number,
): Promise<number> {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    await operation();
  }

  return performance.now() - start;
}

function calibrateSync(operation: () => void): number {
  let iterations = 1_000;

  while (true) {
    const elapsed = measureSync(operation, iterations);

    if (elapsed >= MIN_CALIBRATION_MS) {
      return Math.max(
        1,
        Math.round((iterations * TARGET_MS) / Math.max(elapsed, 0.001)),
      );
    }

    iterations *= 2;
  }
}

function measureSync(operation: () => void, iterations: number): number {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    operation();
  }

  return performance.now() - start;
}
