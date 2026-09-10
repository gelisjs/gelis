import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROUTES = 5_000;
const TARGET_INDEX = ROUTES - 1;
const WARMUP_ITERATIONS = 10_000;
const MEASURED_ITERATIONS = 20_000;

type Workload = "json" | "query-json" | "multipart";
type Scenario = "normal" | "aot";

interface RuntimeRouteContext {
  readonly body: unknown;
  readonly query: unknown;
}

type RuntimeRouteHandler = (context: RuntimeRouteContext) => unknown;

interface AppLike {
  post(path: string, options: object, handler: RuntimeRouteHandler): unknown;
  fetch(request: Request): Response | Promise<Response>;
}

interface GelisConstructor {
  new (): AppLike;
}

interface SemanticPlan {
  readonly shapeFingerprint: string;
}

interface ToolingModules {
  readonly compileSemanticRoutePlan: (
    routes: readonly {
      readonly method: string;
      readonly path: string;
    }[],
  ) => Promise<SemanticPlan>;
  readonly compileFlatAotArtifact: (plan: SemanticPlan) => unknown;
  readonly captureFlatAotManagedInput: (
    options: object,
    handler: RuntimeRouteHandler,
  ) => unknown;
  readonly createFlatAotRuntimeAdapter: (
    artifact: unknown,
    expectedShapeFingerprint: string,
  ) => (
    app: AppLike,
    handlers: readonly RuntimeRouteHandler[],
    inputBindings?: readonly unknown[],
  ) => void;
}

const args = process.argv.slice(2);
const root = readArgument(args, "--root=");
const workload = readWorkload(args);
const scenario = readScenario(args);

const indexModule = (await import(
  pathToFileURL(resolve(root, "src/index.ts")).href
)) as {
  readonly Gelis: GelisConstructor;
};

const semanticModule = (await import(
  pathToFileURL(resolve(root, "src/tooling/semantic-route-plan-compiler.ts"))
    .href
)) as Pick<ToolingModules, "compileSemanticRoutePlan">;

const artifactModule = (await import(
  pathToFileURL(resolve(root, "src/tooling/flat-aot-artifact-compiler.ts")).href
)) as Pick<ToolingModules, "compileFlatAotArtifact">;

const adapterModule = (await import(
  pathToFileURL(resolve(root, "src/runtime/flat-aot-runtime-adapter.ts")).href
)) as Pick<
  ToolingModules,
  "captureFlatAotManagedInput" | "createFlatAotRuntimeAdapter"
>;

const tooling: ToolingModules = {
  ...semanticModule,
  ...artifactModule,
  ...adapterModule,
};

const app = await createApplication(
  indexModule.Gelis,
  tooling,
  workload,
  scenario,
);
const request = createRequest(workload);

let sink = 0;

await verifyCorrectness(app, request);
await warmup(app, request);

writeMessage({ type: "ready", workload, scenario });

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of input) {
  if (line === "measure") {
    Bun.gc(true);
    writeMessage({ type: "measurement", ns: await measure(app, request) });
    continue;
  }

  if (line === "close") {
    input.close();
    break;
  }

  throw new Error(`Unknown worker command: ${line}`);
}

void sink;

async function createApplication(
  Constructor: GelisConstructor,
  modules: ToolingModules,
  selectedWorkload: Workload,
  selectedScenario: Scenario,
): Promise<AppLike> {
  const application = new Constructor();
  const Body = createIdentitySchema();
  const Query = createIdentitySchema();
  const options = createOptions(selectedWorkload, Body, Query);
  const response = new Response("ok");
  const handler: RuntimeRouteHandler = () => response;

  if (selectedScenario === "normal") {
    for (let index = 0; index < ROUTES; index++) {
      application.post(`/r/${index}`, options, handler);
    }

    return application;
  }

  const shapes = new Array<{ method: string; path: string }>(ROUTES);
  const handlers = new Array<RuntimeRouteHandler>(ROUTES);
  const inputBindings = new Array<unknown>(ROUTES);

  for (let index = 0; index < ROUTES; index++) {
    shapes[index] = {
      method: "POST",
      path: `/r/${index}`,
    };

    inputBindings[index] = modules.captureFlatAotManagedInput(options, handler);
  }

  const plan = await modules.compileSemanticRoutePlan(shapes);
  const artifact = modules.compileFlatAotArtifact(plan);
  const install = modules.createFlatAotRuntimeAdapter(
    artifact,
    plan.shapeFingerprint,
  );

  install(application, handlers, inputBindings);
  return application;
}

function createIdentitySchema(): object {
  return {
    "~standard": {
      version: 1 as const,
      vendor: "gelis-p9-e5-e",
      validate(value: unknown) {
        return { value };
      },
    },
  };
}

function createOptions(
  selectedWorkload: Workload,
  Body: object,
  Query: object,
): object {
  if (selectedWorkload === "json") {
    return {
      body: Body,
    };
  }

  if (selectedWorkload === "query-json") {
    return {
      query: Query,
      body: Body,
    };
  }

  return {
    body: Body,
    bodyParser: "multipart",
  };
}

function createRequest(selectedWorkload: Workload): Request {
  if (selectedWorkload === "multipart") {
    const boundary = "gelis-p9-e5-e-boundary";
    const body = new TextEncoder().encode(
      [
        `--${boundary}`,
        'Content-Disposition: form-data; name="name"',
        "",
        "gelis",
        `--${boundary}`,
        'Content-Disposition: form-data; name=""',
        "",
        "blank",
        `--${boundary}--`,
        "",
      ].join("\r\n"),
    );

    return {
      method: "POST",
      url: `http://gelis.test/r/${TARGET_INDEX}`,
      headers: createHeaders(`multipart/form-data; boundary=${boundary}`),
      arrayBuffer() {
        return Promise.resolve(body.buffer);
      },
    } as unknown as Request;
  }

  const query = selectedWorkload === "query-json" ? "?q=1" : "";

  return {
    method: "POST",
    url: `http://gelis.test/r/${TARGET_INDEX}${query}`,
    headers: createHeaders("application/json"),
    json() {
      return Promise.resolve({ value: "gelis" });
    },
  } as unknown as Request;
}

function createHeaders(contentType: string): {
  get(name: string): string | null;
} {
  return {
    get(name: string): string | null {
      return name.toLowerCase() === "content-type" ? contentType : null;
    },
  };
}

async function verifyCorrectness(
  application: AppLike,
  request: Request,
): Promise<void> {
  const response = await application.fetch(request);

  if (!(response instanceof Response)) {
    throw new Error("P9-E5-E worker did not return a Response");
  }

  if (response.status !== 200) {
    throw new Error(`Unexpected worker response status: ${response.status}`);
  }
}

async function warmup(application: AppLike, request: Request): Promise<void> {
  for (let index = 0; index < WARMUP_ITERATIONS; index++) {
    await consume(application.fetch(request));
  }
}

async function measure(
  application: AppLike,
  request: Request,
): Promise<number> {
  const started = performance.now();

  for (let index = 0; index < MEASURED_ITERATIONS; index++) {
    await consume(application.fetch(request));
  }

  return ((performance.now() - started) * 1_000_000) / MEASURED_ITERATIONS;
}

async function consume(result: Response | Promise<Response>): Promise<void> {
  const response = await result;
  sink += response.status;
}

function readArgument(values: readonly string[], prefix: string): string {
  const argument = values.find((value) => value.startsWith(prefix));
  const value = argument?.slice(prefix.length);

  if (!value) {
    throw new Error(`Expected ${prefix}<value>`);
  }

  return resolve(value);
}

function readWorkload(values: readonly string[]): Workload {
  const value = values
    .find((entry) => entry.startsWith("--workload="))
    ?.slice("--workload=".length);

  if (value === "json" || value === "query-json" || value === "multipart") {
    return value;
  }

  throw new Error("Expected --workload=json|query-json|multipart");
}

function readScenario(values: readonly string[]): Scenario {
  const value = values
    .find((entry) => entry.startsWith("--scenario="))
    ?.slice("--scenario=".length);

  if (value === "normal" || value === "aot") {
    return value;
  }

  throw new Error("Expected --scenario=normal|aot");
}

function writeMessage(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}
