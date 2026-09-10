import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const WARMUP_SYNC = 20_000;
const WARMUP_ASYNC = 4_000;
const TARGET_MS = 120;
const MIN_CALIBRATION_MS = 20;

type ZeroScenario =
  "static-raw" | "dynamic-raw" | "static-json" | "dynamic-json";

type EnabledScenario =
  | "actual-wildcard"
  | "actual-allowlist"
  | "actual-credentialed"
  | "preflight-static-methods"
  | "actual-dynamic-origin";

type Mode = "zero-unused" | "enabled" | "scaling";
type Framework = "gelis" | "hono";

interface WorkerResult {
  readonly mode: Mode;
  readonly framework: Framework;
  readonly scenario: string;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number;
  readonly sink: number;
  readonly routes?: number;
}

const args = readArgs(process.argv.slice(2));

if (args.mode === "zero-unused") {
  console.log(JSON.stringify(await runZeroUnused(args)));
} else if (args.mode === "enabled") {
  console.log(JSON.stringify(await runEnabled(args)));
} else {
  console.log(JSON.stringify(await runScaling(args)));
}

async function runZeroUnused(args: ParsedArgs): Promise<WorkerResult> {
  const root = required(args.root, "--root");
  const scenario = required(args.scenario, "--scenario") as ZeroScenario;
  assertZeroScenario(scenario);

  const moduleUrl = pathToFileURL(resolve(root, "src/index.ts")).href;
  const module = (await import(moduleUrl)) as {
    Gelis: new () => {
      get(path: string, handler: (context: unknown) => unknown): unknown;
      fetch(request: Request): Response | Promise<Response>;
    };
  };

  const app = new module.Gelis();
  const perKind = 1_250;

  for (let index = 0; index < perKind; index++) {
    app.get(`/sr/${index}`, () => new Response("ok"));
    app.get(`/dr/${index}/:id`, () => new Response("ok"));
    app.get(`/sj/${index}`, () => ({ ok: true }));
    app.get(`/dj/${index}/:id`, () => ({ ok: true }));
  }

  const last = perKind - 1;
  const path =
    scenario === "static-raw"
      ? `/sr/${last}`
      : scenario === "dynamic-raw"
        ? `/dr/${last}/42`
        : scenario === "static-json"
          ? `/sj/${last}`
          : `/dj/${last}/42`;

  const request = new Request(`http://gelis.test${path}`);
  let sink = 0;

  const operation = () => {
    const response = app.fetch(request);

    if (isPromiseLike(response)) {
      throw new Error(
        `Zero-unused ${scenario} unexpectedly became asynchronous`,
      );
    }

    if (!(response instanceof Response) || response.status !== 200) {
      throw new Error(`Zero-unused ${scenario} correctness validation failed`);
    }

    sink ^= response.status;
  };

  for (let index = 0; index < WARMUP_SYNC; index++) {
    operation();
  }

  const iterations = calibrateSync(operation);
  const elapsed = measureSync(operation, iterations);

  return {
    mode: "zero-unused",
    framework: "gelis",
    scenario,
    iterations,
    warmups: WARMUP_SYNC,
    nsPerOp: (elapsed * 1_000_000) / iterations,
    sink,
    routes: perKind * 4,
  };
}

async function runEnabled(args: ParsedArgs): Promise<WorkerResult> {
  const framework = required(args.framework, "--framework") as Framework;
  const scenario = required(args.scenario, "--scenario") as EnabledScenario;

  assertFramework(framework);
  assertEnabledScenario(scenario);

  const ORIGIN = "https://client.example";
  const OTHER = "https://other.example";

  let dispatch: (request: Request) => Response | Promise<Response>;

  if (framework === "gelis") {
    const [{ Gelis }, { cors }] = await Promise.all([
      import("../../src/index.ts"),
      import("../../src/cors/index.ts"),
    ]);

    const app = new Gelis();

    switch (scenario) {
      case "actual-wildcard":
        app.use(cors());
        break;
      case "actual-allowlist":
        app.use(cors({ origin: [ORIGIN, OTHER] }));
        break;
      case "actual-credentialed":
        app.use(cors({ origin: [ORIGIN, OTHER], credentials: true }));
        break;
      case "preflight-static-methods":
        app.use(
          cors({
            methods: ["GET", "POST"],
            allowHeaders: ["X-Token"],
          }),
        );
        break;
      case "actual-dynamic-origin":
        app.use(cors({ origin: (origin) => origin === ORIGIN }));
        break;
    }

    app.get("/resource", () => new Response("ok"));
    if (scenario === "preflight-static-methods") {
      app.post("/resource", () => new Response("ok"));
    }

    dispatch = (request) => app.fetch(request);
  } else {
    const [{ Hono }, { cors }] = await Promise.all([
      import("hono"),
      import("hono/cors"),
    ]);

    const app = new Hono();

    switch (scenario) {
      case "actual-wildcard":
        app.use("*", cors({ origin: "*" }));
        break;
      case "actual-allowlist":
        app.use("*", cors({ origin: [ORIGIN, OTHER] }));
        break;
      case "actual-credentialed":
        app.use("*", cors({ origin: [ORIGIN, OTHER], credentials: true }));
        break;
      case "preflight-static-methods":
        app.use(
          "*",
          cors({
            origin: "*",
            allowMethods: ["GET", "POST"],
            allowHeaders: ["X-Token"],
          }),
        );
        break;
      case "actual-dynamic-origin":
        app.use(
          "*",
          cors({
            origin: (origin) => (origin === ORIGIN ? origin : undefined),
          }),
        );
        break;
    }

    app.get("/resource", () => new Response("ok"));
    if (scenario === "preflight-static-methods") {
      app.post("/resource", () => new Response("ok"));
    }

    dispatch = (request) => app.request(request);
  }

  const request =
    scenario === "preflight-static-methods"
      ? new Request("http://gelis.test/resource", {
          method: "OPTIONS",
          headers: {
            Origin: ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "X-Token",
          },
        })
      : new Request("http://gelis.test/resource", {
          headers: { Origin: ORIGIN },
        });

  let sink = 0;

  const operation = async () => {
    const response = await dispatch(request);
    const expectedStatus = scenario === "preflight-static-methods" ? 204 : 200;

    if (response.status !== expectedStatus) {
      throw new Error(
        `${framework}/${scenario} returned ${response.status}, expected ${expectedStatus}`,
      );
    }

    const allowOrigin = response.headers.get("access-control-allow-origin");
    const expectedOrigin =
      scenario === "actual-wildcard" || scenario === "preflight-static-methods"
        ? "*"
        : ORIGIN;

    if (allowOrigin !== expectedOrigin) {
      throw new Error(
        `${framework}/${scenario} CORS origin mismatch: ${String(allowOrigin)}`,
      );
    }

    if (
      scenario === "actual-credentialed" &&
      response.headers.get("access-control-allow-credentials") !== "true"
    ) {
      throw new Error(`${framework}/${scenario} credentials grant missing`);
    }

    if (scenario === "preflight-static-methods") {
      const methods = response.headers.get("access-control-allow-methods");
      if (
        methods === null ||
        !methods
          .split(",")
          .map((value) => value.trim())
          .includes("POST")
      ) {
        throw new Error(
          `${framework}/${scenario} POST preflight grant missing`,
        );
      }
    }

    sink ^= response.status;
  };

  for (let index = 0; index < WARMUP_ASYNC; index++) {
    await operation();
  }

  const iterations = await calibrateAsync(operation);
  const elapsed = await measureAsync(operation, iterations);

  return {
    mode: "enabled",
    framework,
    scenario,
    iterations,
    warmups: WARMUP_ASYNC,
    nsPerOp: (elapsed * 1_000_000) / iterations,
    sink,
  };
}

async function runScaling(args: ParsedArgs): Promise<WorkerResult> {
  const routes = Number(required(args.routes, "--routes"));

  if (routes !== 1_000 && routes !== 5_000) {
    throw new Error(
      "P11-D scaling worker expects --routes=1000 or --routes=5000",
    );
  }

  const [{ Gelis }, { cors }] = await Promise.all([
    import("../../src/index.ts"),
    import("../../src/cors/index.ts"),
  ]);

  const app = new Gelis();
  app.use(cors());

  for (let index = 0; index < routes; index++) {
    app.get(`/resource/${index}`, () => new Response("ok"));
  }

  const request = new Request(`http://gelis.test/resource/${routes - 1}`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://client.example",
      "Access-Control-Request-Method": "GET",
    },
  });

  let sink = 0;

  const operation = () => {
    const response = app.fetch(request);

    if (isPromiseLike(response)) {
      throw new Error("Static CORS preflight unexpectedly became asynchronous");
    }

    if (response.status !== 204) {
      throw new Error(`Scaling preflight returned ${response.status}`);
    }

    const methods = response.headers.get("access-control-allow-methods");
    if (methods === null || !methods.includes("GET")) {
      throw new Error("Scaling preflight did not advertise GET");
    }

    sink ^= response.status;
  };

  for (let index = 0; index < WARMUP_SYNC; index++) {
    operation();
  }

  const iterations = calibrateSync(operation);
  const elapsed = measureSync(operation, iterations);

  return {
    mode: "scaling",
    framework: "gelis",
    scenario: `preflight-${routes}`,
    iterations,
    warmups: WARMUP_SYNC,
    nsPerOp: (elapsed * 1_000_000) / iterations,
    sink,
    routes,
  };
}

interface ParsedArgs {
  readonly mode: Mode;
  readonly framework?: string | undefined;
  readonly scenario?: string | undefined;
  readonly root?: string | undefined;
  readonly routes?: string | undefined;
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

  const mode = entries.get("mode");
  if (mode !== "zero-unused" && mode !== "enabled" && mode !== "scaling") {
    throw new Error("Expected --mode=zero-unused, enabled, or scaling");
  }

  return {
    mode,
    framework: entries.get("framework"),
    scenario: entries.get("scenario"),
    root: entries.get("root"),
    routes: entries.get("routes"),
  };
}

function required(value: string | undefined, name: string): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

function assertFramework(value: string): asserts value is Framework {
  if (value !== "gelis" && value !== "hono") {
    throw new Error(`Unknown framework: ${value}`);
  }
}

function assertZeroScenario(value: string): asserts value is ZeroScenario {
  if (
    value !== "static-raw" &&
    value !== "dynamic-raw" &&
    value !== "static-json" &&
    value !== "dynamic-json"
  ) {
    throw new Error(`Unknown zero-unused scenario: ${value}`);
  }
}

function assertEnabledScenario(
  value: string,
): asserts value is EnabledScenario {
  if (
    value !== "actual-wildcard" &&
    value !== "actual-allowlist" &&
    value !== "actual-credentialed" &&
    value !== "preflight-static-methods" &&
    value !== "actual-dynamic-origin"
  ) {
    throw new Error(`Unknown enabled scenario: ${value}`);
  }
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

function measureSync(operation: () => void, iterations: number): number {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    operation();
  }

  return performance.now() - start;
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

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return false;
  }

  return typeof (value as { then?: unknown }).then === "function";
}
