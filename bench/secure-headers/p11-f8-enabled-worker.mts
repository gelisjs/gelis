import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const WARMUP_ASYNC = 4_000;
const TARGET_MS = 120;
const MIN_CALIBRATION_MS = 20;

const CSP_VALUE = "default-src 'self'; object-src 'none'";

type Framework = "gelis" | "hono";
type EnabledScenario =
  | "default-static-204"
  | "default-static-json"
  | "managed-overwrite-delete"
  | "explicit-isolation"
  | "static-csp";

interface WorkerResult {
  readonly mode: "enabled";
  readonly framework: Framework;
  readonly scenario: EnabledScenario;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number;
  readonly sink: number;
}

interface BenchmarkGelisApp {
  use(plugin: unknown): unknown;
  get(path: string, handler: () => unknown): unknown;
  fetch(request: Request): Response | Promise<Response>;
}

interface ParsedArgs {
  readonly framework?: string | undefined;
  readonly scenario?: string | undefined;
  readonly candidateRoot?: string | undefined;
}

const args = readArgs(process.argv.slice(2));
console.log(JSON.stringify(await runEnabled(args)));

async function runEnabled(args: ParsedArgs): Promise<WorkerResult> {
  const framework = required(args.framework, "--framework") as Framework;
  const scenario = required(args.scenario, "--scenario") as EnabledScenario;
  const candidateRoot = required(args.candidateRoot, "--candidate-root");

  assertFramework(framework);
  assertEnabledScenario(scenario);

  const dispatch =
    framework === "gelis"
      ? await createGelisDispatch(candidateRoot, scenario)
      : await createHonoDispatch(scenario);

  const request = new Request("http://gelis.test/resource");
  const verification = await dispatch(request);
  assertEquivalentResponse(framework, scenario, verification);

  let sink = 0;
  const expectedStatus = scenario === "default-static-json" ? 200 : 204;

  const operation = async () => {
    const response = await dispatch(request);

    if (response.status !== expectedStatus) {
      throw new Error(
        `${framework}/${scenario} returned ${response.status}, expected ${expectedStatus}`,
      );
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

async function createGelisDispatch(
  candidateRoot: string,
  scenario: EnabledScenario,
): Promise<(request: Request) => Response | Promise<Response>> {
  const coreUrl = pathToFileURL(resolve(candidateRoot, "src/index.ts")).href;
  const secureHeadersUrl = pathToFileURL(
    resolve(candidateRoot, "src/secure-headers/index.ts"),
  ).href;

  const [coreModule, secureHeadersModule] = await Promise.all([
    import(coreUrl) as Promise<{
      Gelis: new () => BenchmarkGelisApp;
    }>,
    import(secureHeadersUrl) as Promise<{
      secureHeaders: (options?: Record<string, unknown>) => unknown;
    }>,
  ]);

  const app = new coreModule.Gelis();
  const options = gelisOptionsFor(scenario);
  app.use(
    options === undefined
      ? secureHeadersModule.secureHeaders()
      : secureHeadersModule.secureHeaders(options),
  );

  registerGelisRoute(app, scenario);

  return (request) => app.fetch(request);
}

async function createHonoDispatch(
  scenario: EnabledScenario,
): Promise<(request: Request) => Response | Promise<Response>> {
  const [{ Hono }, { secureHeaders }] = await Promise.all([
    import("hono"),
    import("hono/secure-headers"),
  ]);

  const app = new Hono();
  app.use("*", secureHeaders(honoOptionsFor(scenario)));

  if (scenario === "default-static-json") {
    app.get("/resource", (context) => context.json({ ok: true }));
  } else if (scenario === "managed-overwrite-delete") {
    app.get(
      "/resource",
      () =>
        new Response(null, {
          status: 204,
          headers: conflictingHeaders(),
        }),
    );
  } else {
    app.get("/resource", () => new Response(null, { status: 204 }));
  }

  return (request) => app.request(request);
}

function registerGelisRoute(
  app: BenchmarkGelisApp,
  scenario: EnabledScenario,
): void {
  if (scenario === "default-static-json") {
    app.get("/resource", () => ({ ok: true }));
    return;
  }

  if (scenario === "managed-overwrite-delete") {
    app.get(
      "/resource",
      () =>
        new Response(null, {
          status: 204,
          headers: conflictingHeaders(),
        }),
    );
    return;
  }

  app.get("/resource", () => new Response(null, { status: 204 }));
}

function gelisOptionsFor(
  scenario: EnabledScenario,
): Record<string, unknown> | undefined {
  if (scenario === "explicit-isolation") {
    return {
      crossOriginOpenerPolicy: "same-origin",
      crossOriginResourcePolicy: "same-origin",
      originAgentCluster: true,
    };
  }

  if (scenario === "static-csp") {
    return {
      contentSecurityPolicy: CSP_VALUE,
    };
  }

  return undefined;
}

function honoOptionsFor(scenario: EnabledScenario) {
  const base = {
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

  if (scenario === "explicit-isolation") {
    return {
      ...base,
      crossOriginResourcePolicy: "same-origin",
      crossOriginOpenerPolicy: "same-origin",
      originAgentCluster: "?1",
    };
  }

  if (scenario === "static-csp") {
    return {
      ...base,
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        objectSrc: ["'none'"],
      },
    };
  }

  return base;
}

function conflictingHeaders(): HeadersInit {
  return {
    "Strict-Transport-Security": "max-age=1",
    "X-Content-Type-Options": "invalid",
    "Referrer-Policy": "unsafe-url",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1",
    "X-Powered-By": "benchmark",
  };
}

function assertEquivalentResponse(
  framework: Framework,
  scenario: EnabledScenario,
  response: Response,
): void {
  const expectedStatus = scenario === "default-static-json" ? 200 : 204;

  if (response.status !== expectedStatus) {
    throw new Error(
      `${framework}/${scenario} verification returned ${response.status}, expected ${expectedStatus}`,
    );
  }

  if (scenario === "default-static-json") {
    const contentType = response.headers.get("content-type");
    if (contentType === null || !contentType.startsWith("application/json")) {
      throw new Error(`${framework}/${scenario} did not return JSON`);
    }
  }

  const expected = new Map<string, string>([
    ["strict-transport-security", "max-age=31536000"],
    ["x-content-type-options", "nosniff"],
    ["referrer-policy", "no-referrer"],
    ["x-frame-options", "SAMEORIGIN"],
    ["x-xss-protection", "0"],
  ]);

  if (scenario === "explicit-isolation") {
    expected.set("cross-origin-opener-policy", "same-origin");
    expected.set("cross-origin-resource-policy", "same-origin");
    expected.set("origin-agent-cluster", "?1");
  }

  if (scenario === "static-csp") {
    expected.set("content-security-policy", CSP_VALUE);
  }

  const policyHeaders = [
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

  for (const name of policyHeaders) {
    const actual = response.headers.get(name);
    const expectedValue = expected.get(name);

    if (expectedValue === undefined) {
      if (actual !== null) {
        throw new Error(
          `${framework}/${scenario} emitted unexpected ${name}: ${actual}`,
        );
      }
      continue;
    }

    if (actual !== expectedValue) {
      throw new Error(
        `${framework}/${scenario} ${name} mismatch: ${String(actual)} !== ${expectedValue}`,
      );
    }
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
    framework: entries.get("framework"),
    scenario: entries.get("scenario"),
    candidateRoot: entries.get("candidate-root"),
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

function assertEnabledScenario(
  value: string,
): asserts value is EnabledScenario {
  if (
    value !== "default-static-204" &&
    value !== "default-static-json" &&
    value !== "managed-overwrite-delete" &&
    value !== "explicit-isolation" &&
    value !== "static-csp"
  ) {
    throw new Error(`Unknown enabled secure-headers scenario: ${value}`);
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
