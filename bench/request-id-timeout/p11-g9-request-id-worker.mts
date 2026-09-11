import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Hono } from "hono";
import { requestId as honoRequestId } from "hono/request-id";

const WARMUP_ASYNC = 4_000;
const TARGET_MS = 120;
const MIN_CALIBRATION_MS = 20;

const HEADER_NAME = "X-Request-Id";
const TRUSTED_ID = "req_trusted-42";
const INVALID_ID = "invalid id";
const CUSTOM_ID = "req_custom_generator";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Framework = "gelis" | "hono";
type RequestIdScenario =
  | "default-generated"
  | "trusted-valid-inbound"
  | "invalid-inbound-fallback"
  | "custom-generator";

interface WorkerResult {
  readonly mode: "request-id";
  readonly framework: Framework;
  readonly scenario: RequestIdScenario;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number;
  readonly sink: number;
}

interface BenchmarkGelisApp {
  use(plugin: unknown): unknown;
  get(
    path: string,
    handler: (context: { readonly request: Request }) => unknown,
  ): unknown;
  fetch(request: Request): Response | Promise<Response>;
}

interface ParsedArgs {
  readonly framework?: string | undefined;
  readonly scenario?: string | undefined;
  readonly candidateRoot?: string | undefined;
}

const args = readArgs(process.argv.slice(2));
console.log(JSON.stringify(await runRequestId(args)));

async function runRequestId(args: ParsedArgs): Promise<WorkerResult> {
  const framework = required(args.framework, "--framework") as Framework;
  const scenario = required(args.scenario, "--scenario") as RequestIdScenario;
  const candidateRoot = required(args.candidateRoot, "--candidate-root");

  assertFramework(framework);
  assertScenario(scenario);

  const benchmark =
    framework === "gelis"
      ? await createGelisBenchmark(candidateRoot, scenario)
      : createHonoBenchmark(scenario);

  const request = createScenarioRequest(scenario);
  const verification = await benchmark.dispatch(request);
  assertEquivalentResult(
    framework,
    scenario,
    verification,
    benchmark.observed(),
  );

  let sink = 0;
  const operation = async () => {
    const response = await benchmark.dispatch(request);
    const observed = benchmark.observed();
    const propagated = response.headers.get(HEADER_NAME);

    if (
      response.status !== 204 ||
      observed === undefined ||
      propagated === null ||
      observed !== propagated
    ) {
      throw new Error(`${framework}/${scenario} request-ID operation mismatch`);
    }

    sink ^= response.status + observed.length;
  };

  for (let index = 0; index < WARMUP_ASYNC; index++) {
    await operation();
  }

  const iterations = await calibrateAsync(operation);
  const elapsed = await measureAsync(operation, iterations);

  return {
    mode: "request-id",
    framework,
    scenario,
    iterations,
    warmups: WARMUP_ASYNC,
    nsPerOp: (elapsed * 1_000_000) / iterations,
    sink,
  };
}

interface BenchmarkDispatch {
  readonly dispatch: (request: Request) => Response | Promise<Response>;
  readonly observed: () => string | undefined;
}

async function createGelisBenchmark(
  candidateRoot: string,
  scenario: RequestIdScenario,
): Promise<BenchmarkDispatch> {
  const coreUrl = pathToFileURL(resolve(candidateRoot, "src/index.ts")).href;
  const requestIdUrl = pathToFileURL(
    resolve(candidateRoot, "src/request-id/index.ts"),
  ).href;

  const [coreModule, requestIdModule] = await Promise.all([
    import(coreUrl) as Promise<{
      Gelis: new () => BenchmarkGelisApp;
    }>,
    import(requestIdUrl) as Promise<{
      requestId: (options?: Record<string, unknown>) => {
        get(request: Request): string | undefined;
      };
    }>,
  ]);

  const app = new coreModule.Gelis();
  const ids = requestIdModule.requestId(gelisOptionsFor(scenario));
  let observed: string | undefined;

  app.use(ids);
  app.get("/resource", ({ request }) => {
    observed = ids.get(request);
    return new Response(null, { status: 204 });
  });

  return {
    dispatch: (request) => app.fetch(request),
    observed: () => observed,
  };
}

function createHonoBenchmark(scenario: RequestIdScenario): BenchmarkDispatch {
  const app = new Hono<{ Variables: { requestId: string } }>();
  let observed: string | undefined;

  app.use("*", honoRequestId(honoOptionsFor(scenario)));
  app.get("/resource", (context) => {
    observed = context.get("requestId");
    return new Response(null, { status: 204 });
  });

  return {
    dispatch: (request) => app.request(request),
    observed: () => observed,
  };
}

function gelisOptionsFor(
  scenario: RequestIdScenario,
): Record<string, unknown> | undefined {
  if (scenario === "trusted-valid-inbound") {
    return { trustIncoming: true };
  }

  if (scenario === "invalid-inbound-fallback") {
    return { trustIncoming: true };
  }

  if (scenario === "custom-generator") {
    return { generator: () => CUSTOM_ID };
  }

  return undefined;
}

function honoOptionsFor(scenario: RequestIdScenario) {
  if (scenario === "custom-generator") {
    return { generator: () => CUSTOM_ID };
  }

  return undefined;
}

function createScenarioRequest(scenario: RequestIdScenario): Request {
  if (scenario === "trusted-valid-inbound") {
    return new Request("http://gelis.test/resource", {
      headers: { [HEADER_NAME]: TRUSTED_ID },
    });
  }

  if (scenario === "invalid-inbound-fallback") {
    return new Request("http://gelis.test/resource", {
      headers: { [HEADER_NAME]: INVALID_ID },
    });
  }

  return new Request("http://gelis.test/resource");
}

function assertEquivalentResult(
  framework: Framework,
  scenario: RequestIdScenario,
  response: Response,
  observed: string | undefined,
): void {
  if (response.status !== 204) {
    throw new Error(
      `${framework}/${scenario} verification returned ${response.status}`,
    );
  }

  const propagated = response.headers.get(HEADER_NAME);
  if (observed === undefined || propagated === null || observed !== propagated) {
    throw new Error(`${framework}/${scenario} did not propagate handler ID`);
  }

  if (scenario === "trusted-valid-inbound") {
    if (observed !== TRUSTED_ID) {
      throw new Error(`${framework}/${scenario} did not adopt trusted inbound ID`);
    }
    return;
  }

  if (scenario === "custom-generator") {
    if (observed !== CUSTOM_ID) {
      throw new Error(`${framework}/${scenario} custom generator mismatch`);
    }
    return;
  }

  if (!UUID_PATTERN.test(observed)) {
    throw new Error(`${framework}/${scenario} did not generate a UUID`);
  }

  if (scenario === "invalid-inbound-fallback" && observed === INVALID_ID) {
    throw new Error(`${framework}/${scenario} adopted invalid inbound ID`);
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

function assertScenario(value: string): asserts value is RequestIdScenario {
  if (
    value !== "default-generated" &&
    value !== "trusted-valid-inbound" &&
    value !== "invalid-inbound-fallback" &&
    value !== "custom-generator"
  ) {
    throw new Error(`Unknown request-ID scenario: ${value}`);
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
