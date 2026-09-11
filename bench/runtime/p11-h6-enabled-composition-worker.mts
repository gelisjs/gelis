import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Hono } from "hono";
import { cors as honoCors } from "hono/cors";
import { requestId as honoRequestId } from "hono/request-id";
import { secureHeaders as honoSecureHeaders } from "hono/secure-headers";
import { timeout as honoTimeout } from "hono/timeout";

const WARMUP_ASYNC = 4_000;
const TARGET_MS = 120;
const MIN_CALIBRATION_MS = 20;

const ORIGIN = "https://client.test";
const FIXED_REQUEST_ID = "req_p11_h6_fixed";
const TIMEOUT_MS = 60_000;
const BODY_LIMIT_BYTES = 1_024;
const JSON_BODY = '{"value":"ok"}';

type Framework = "gelis" | "hono";
type DirectScenario = "actual-cors-static-204" | "actual-cors-static-json";
type Mode = "direct" | "route-scale";

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

interface BenchmarkGelisApp {
  use(plugin: unknown): unknown;
  get(path: string, handler: () => unknown): unknown;
  post(
    path: string,
    options: Record<string, unknown>,
    handler: (context: { readonly body: { readonly value: string } }) => unknown,
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
} else {
  console.log(JSON.stringify(await runRouteScale(args)));
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

  const verification = await resolveResponse(
    benchmark.dispatch(createDirectRequest()),
  );
  await assertEquivalentDirectResponse(framework, scenario, verification);

  let sink = 0;
  const operation = async (request: Request) => {
    const response = await resolveResponse(benchmark.dispatch(request));
    const expectedStatus = scenario === "actual-cors-static-json" ? 200 : 204;

    if (response.status !== expectedStatus) {
      throw new Error(
        `${framework}/${scenario} returned ${response.status}, expected ${expectedStatus}`,
      );
    }

    sink ^= response.status + (response.headers.get("x-request-id")?.length ?? 0);
  };

  const warmupRequests = createDirectRequests(WARMUP_ASYNC);
  for (let index = 0; index < warmupRequests.length; index++) {
    await operation(warmupRequests[index]!);
  }

  const iterations = await calibrateAsync(operation, createDirectRequests);
  const measuredRequests = createDirectRequests(iterations);
  const elapsed = await measureAsync(operation, measuredRequests);

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

async function createGelisDirectBenchmark(
  candidateRoot: string,
  scenario: DirectScenario,
): Promise<BenchmarkDispatch> {
  const coreUrl = pathToFileURL(resolve(candidateRoot, "src/index.ts")).href;
  const corsUrl = pathToFileURL(resolve(candidateRoot, "src/cors/index.ts")).href;
  const secureHeadersUrl = pathToFileURL(
    resolve(candidateRoot, "src/secure-headers/index.ts"),
  ).href;
  const requestIdUrl = pathToFileURL(
    resolve(candidateRoot, "src/request-id/index.ts"),
  ).href;
  const timeoutUrl = pathToFileURL(
    resolve(candidateRoot, "src/timeout/index.ts"),
  ).href;

  const [coreModule, corsModule, secureHeadersModule, requestIdModule, timeoutModule] =
    await Promise.all([
      import(coreUrl) as Promise<{ Gelis: new () => BenchmarkGelisApp }>,
      import(corsUrl) as Promise<{
        cors: (options?: Record<string, unknown>) => unknown;
      }>,
      import(secureHeadersUrl) as Promise<{
        secureHeaders: (options?: Record<string, unknown>) => unknown;
      }>,
      import(requestIdUrl) as Promise<{
        requestId: (options?: Record<string, unknown>) => unknown;
      }>,
      import(timeoutUrl) as Promise<{
        timeout: (options?: { readonly duration?: number }) => unknown;
      }>,
    ]);

  const app = new coreModule.Gelis();

  app.use(corsModule.cors({ origin: ORIGIN }));
  app.use(secureHeadersModule.secureHeaders());
  app.use(
    requestIdModule.requestId({
      generator: () => FIXED_REQUEST_ID,
    }),
  );
  app.use(timeoutModule.timeout({ duration: TIMEOUT_MS }));

  if (scenario === "actual-cors-static-json") {
    app.get("/resource", () => ({ ok: true }));
  } else {
    app.get("/resource", () => new Response(null, { status: 204 }));
  }

  return {
    dispatch: (request) => app.fetch(request),
  };
}

function createHonoDirectBenchmark(
  scenario: DirectScenario,
): BenchmarkDispatch {
  const app = new Hono<{ Variables: { requestId: string } }>();

  app.use("*", honoCors({ origin: ORIGIN }));
  app.use("*", honoSecureHeaders(honoSecureHeadersOptions()));
  app.use(
    "*",
    honoRequestId({
      generator: () => FIXED_REQUEST_ID,
    }),
  );
  app.use("*", honoTimeout(TIMEOUT_MS));

  if (scenario === "actual-cors-static-json") {
    app.get("/resource", (context) => context.json({ ok: true }));
  } else {
    app.get("/resource", (context) => context.body(null, 204));
  }

  return {
    dispatch: (request) => app.request(request),
  };
}

async function assertEquivalentDirectResponse(
  framework: Framework,
  scenario: DirectScenario,
  response: Response,
): Promise<void> {
  const expectedStatus = scenario === "actual-cors-static-json" ? 200 : 204;

  if (response.status !== expectedStatus) {
    throw new Error(
      `${framework}/${scenario} verification returned ${response.status}, expected ${expectedStatus}`,
    );
  }

  if (response.headers.get("access-control-allow-origin") !== ORIGIN) {
    throw new Error(`${framework}/${scenario} CORS origin mismatch`);
  }

  assertVaryOrigin(framework, scenario, response.headers.get("vary"));
  assertSecurityHeaders(framework, scenario, response.headers);

  if (response.headers.get("x-request-id") !== FIXED_REQUEST_ID) {
    throw new Error(`${framework}/${scenario} request ID mismatch`);
  }

  if (scenario === "actual-cors-static-json") {
    const contentType = response.headers.get("content-type");
    if (contentType === null || !contentType.startsWith("application/json")) {
      throw new Error(`${framework}/${scenario} did not return JSON`);
    }

    const body = (await response.json()) as unknown;
    if (
      body === null ||
      typeof body !== "object" ||
      !("ok" in body) ||
      body.ok !== true
    ) {
      throw new Error(`${framework}/${scenario} JSON body mismatch`);
    }
  } else {
    const body = await response.text();
    if (body !== "") {
      throw new Error(`${framework}/${scenario} 204 response was not bodyless`);
    }
  }
}

async function runRouteScale(
  args: ParsedArgs,
): Promise<RouteScaleWorkerResult> {
  const candidateRoot = required(args.candidateRoot, "--candidate-root");
  const routes = Number(required(args.routes, "--routes"));

  if (routes !== 1_000 && routes !== 5_000) {
    throw new Error(
      `P11-H6 route-scale requires 1000 or 5000 routes, got ${routes}`,
    );
  }

  const benchmark = await createGelisRouteScaleBenchmark(candidateRoot, routes);
  const verification = await resolveResponse(
    benchmark.dispatch(createRouteScaleRequest()),
  );

  if (verification.status !== 204) {
    throw new Error(
      `P11-H6 route-scale verification returned ${verification.status}`,
    );
  }

  let sink = 0;
  const operation = async (request: Request) => {
    const response = await resolveResponse(benchmark.dispatch(request));

    if (response.status !== 204) {
      throw new Error(
        `P11-H6 route-scale operation returned ${response.status}`,
      );
    }

    sink ^= response.status;
  };

  const warmupRequests = createRouteScaleRequests(WARMUP_ASYNC);
  for (let index = 0; index < warmupRequests.length; index++) {
    await operation(warmupRequests[index]!);
  }

  const iterations = await calibrateAsync(
    operation,
    createRouteScaleRequests,
  );
  const measuredRequests = createRouteScaleRequests(iterations);
  const elapsed = await measureAsync(operation, measuredRequests);

  return {
    mode: "route-scale",
    routes,
    iterations,
    warmups: WARMUP_ASYNC,
    nsPerOp: (elapsed * 1_000_000) / iterations,
    sink,
  };
}

async function createGelisRouteScaleBenchmark(
  candidateRoot: string,
  routes: 1_000 | 5_000,
): Promise<BenchmarkDispatch> {
  const coreUrl = pathToFileURL(resolve(candidateRoot, "src/index.ts")).href;
  const timeoutUrl = pathToFileURL(
    resolve(candidateRoot, "src/timeout/index.ts"),
  ).href;

  const [coreModule, timeoutModule] = await Promise.all([
    import(coreUrl) as Promise<{ Gelis: new () => BenchmarkGelisApp }>,
    import(timeoutUrl) as Promise<{
      timeout: (options?: { readonly duration?: number }) => unknown;
    }>,
  ]);

  const app = new coreModule.Gelis();
  const Body = {
    "~standard": {
      version: 1,
      vendor: "p11-h6",
      validate(value: unknown) {
        if (
          typeof value !== "object" ||
          value === null ||
          !("value" in value) ||
          typeof value.value !== "string"
        ) {
          return { issues: [{ message: "Expected string value" }] };
        }

        return { value: { value: value.value } };
      },
    },
  } as const;

  app.use(timeoutModule.timeout());

  for (let index = 0; index < routes; index++) {
    app.post(
      `/route/${index}`,
      {
        body: Body,
        bodyParser: "json",
        bodyLimit: BODY_LIMIT_BYTES,
        timeout: TIMEOUT_MS,
      },
      () => new Response(null, { status: 204 }),
    );
  }

  return {
    dispatch: (request) => app.fetch(request),
  };
}

function createDirectRequest(): Request {
  return new Request("http://gelis.test/resource", {
    headers: { Origin: ORIGIN },
  });
}

function createDirectRequests(count: number): Request[] {
  const requests = new Array<Request>(count);

  for (let index = 0; index < count; index++) {
    requests[index] = createDirectRequest();
  }

  return requests;
}

function createRouteScaleRequest(): Request {
  return new Request("http://gelis.test/route/0", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON_BODY,
  });
}

function createRouteScaleRequests(count: number): Request[] {
  const requests = new Array<Request>(count);

  for (let index = 0; index < count; index++) {
    requests[index] = createRouteScaleRequest();
  }

  return requests;
}

function honoSecureHeadersOptions() {
  return {
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
    originAgentCluster: false,
    referrerPolicy: "no-referrer",
    strictTransportSecurity: "max-age=31536000",
    xContentTypeOptions: "nosniff",
    xDnsPrefetchControl: false,
    xDownloadOptions: false,
    xFrameOptions: "SAMEORIGIN",
    xPermittedCrossDomainPolicies: false,
    xXssProtection: "0",
    removePoweredBy: true,
    permissionsPolicy: {},
  } as const;
}

function assertSecurityHeaders(
  framework: Framework,
  scenario: string,
  headers: Headers,
): void {
  const expected = new Map<string, string>([
    ["strict-transport-security", "max-age=31536000"],
    ["x-content-type-options", "nosniff"],
    ["referrer-policy", "no-referrer"],
    ["x-frame-options", "SAMEORIGIN"],
    ["x-xss-protection", "0"],
  ]);

  const names = [
    "strict-transport-security",
    "x-content-type-options",
    "referrer-policy",
    "x-frame-options",
    "x-xss-protection",
    "x-powered-by",
    "content-security-policy",
    "content-security-policy-report-only",
    "cross-origin-embedder-policy",
    "cross-origin-opener-policy",
    "cross-origin-resource-policy",
    "origin-agent-cluster",
    "permissions-policy",
    "x-dns-prefetch-control",
    "x-download-options",
    "x-permitted-cross-domain-policies",
  ] as const;

  for (const name of names) {
    const actual = headers.get(name);
    const expectedValue = expected.get(name);

    if (expectedValue === undefined) {
      if (actual !== null) {
        throw new Error(
          `${framework}/${scenario} emitted unexpected ${name}: ${actual}`,
        );
      }
    } else if (actual !== expectedValue) {
      throw new Error(
        `${framework}/${scenario} ${name} mismatch: ${String(actual)} !== ${expectedValue}`,
      );
    }
  }
}

function assertVaryOrigin(
  framework: Framework,
  scenario: string,
  vary: string | null,
): void {
  if (vary === null) {
    throw new Error(`${framework}/${scenario} missing Vary: Origin`);
  }

  const fields = vary
    .split(",")
    .map((field) => field.trim().toLowerCase())
    .filter((field) => field.length > 0);

  if (!fields.includes("origin")) {
    throw new Error(
      `${framework}/${scenario} Vary did not include Origin: ${vary}`,
    );
  }
}

async function calibrateAsync(
  operation: (request: Request) => Promise<void>,
  createRequests: (count: number) => Request[],
): Promise<number> {
  let iterations = 100;

  while (true) {
    const requests = createRequests(iterations);
    const elapsed = await measureAsync(operation, requests);

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
  operation: (request: Request) => Promise<void>,
  requests: readonly Request[],
): Promise<number> {
  const start = performance.now();

  for (let index = 0; index < requests.length; index++) {
    await operation(requests[index]!);
  }

  return performance.now() - start;
}

async function resolveResponse(
  value: Response | Promise<Response>,
): Promise<Response> {
  return value instanceof Response ? value : await value;
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
  if (value !== "direct" && value !== "route-scale") {
    throw new Error(`Unknown P11-H6 worker mode: ${value}`);
  }
}

function assertFramework(value: string): asserts value is Framework {
  if (value !== "gelis" && value !== "hono") {
    throw new Error(`Unknown framework: ${value}`);
  }
}

function assertDirectScenario(
  value: string,
): asserts value is DirectScenario {
  if (
    value !== "actual-cors-static-204" &&
    value !== "actual-cors-static-json"
  ) {
    throw new Error(`Unknown P11-H6 direct scenario: ${value}`);
  }
}
