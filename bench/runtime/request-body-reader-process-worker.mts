import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROUTES = 5_000;
const TARGET_INDEX = ROUTES - 1;
const WARMUP_ITERATIONS = 10_000;
const MEASURED_ITERATIONS = 20_000;

type Workload = "body-json" | "query-body-json";

interface AppLike {
  post(path: string, options: object, handler: () => unknown): unknown;
  fetch(request: Request): Response | Promise<Response>;
}

interface GelisConstructor {
  new (): AppLike;
}

const args = process.argv.slice(2);
const root = readArgument(args, "--root=");
const workload = readWorkload(args);

const module = (await import(
  pathToFileURL(resolve(root, "src/index.ts")).href
)) as {
  readonly Gelis: GelisConstructor;
};

const app = createApplication(module.Gelis, workload);
const request = createRequest(workload);

let sink = 0;

await verifyCorrectness(app, request);
await warmup(app, request);

writeMessage({
  type: "ready",
  workload,
});

const input = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

for await (const line of input) {
  if (line === "measure") {
    Bun.gc(true);

    const ns = await measure(app, request);

    writeMessage({
      type: "measurement",
      ns,
    });

    continue;
  }

  if (line === "close") {
    input.close();
    break;
  }

  throw new Error(`Unknown worker command: ${line}`);
}

void sink;

function createApplication(
  Constructor: GelisConstructor,
  selectedWorkload: Workload,
): AppLike {
  const application = new Constructor();

  const Body = {
    "~standard": {
      version: 1,
      vendor: "gelis-bench",
      validate(value: unknown) {
        return {
          value,
        };
      },
    },
  };

  const Query = {
    "~standard": {
      version: 1,
      vendor: "gelis-bench",
      validate(value: unknown) {
        return {
          value,
        };
      },
    },
  };

  const response = new Response("ok");

  for (let index = 0; index < ROUTES; index++) {
    const path = `/r/${index}`;

    if (selectedWorkload === "body-json") {
      application.post(
        path,
        {
          body: Body,
        },
        () => response,
      );

      continue;
    }

    application.post(
      path,
      {
        query: Query,
        body: Body,
      },
      () => response,
    );
  }

  return application;
}

function createRequest(selectedWorkload: Workload): Request {
  const baseUrl = `http://gelis.test/r/${TARGET_INDEX}`;

  const url =
    selectedWorkload === "query-body-json" ? `${baseUrl}?q=1` : baseUrl;

  const rawBody = {
    value: "gelis",
  };

  const headers = {
    get(name: string): string | null {
      return name.toLowerCase() === "content-type" ? "application/json" : null;
    },
  };

  return {
    method: "POST",
    url,
    headers,

    json() {
      return Promise.resolve(rawBody);
    },
  } as unknown as Request;
}

async function verifyCorrectness(
  application: AppLike,
  request: Request,
): Promise<void> {
  const response = await application.fetch(request);

  if (!(response instanceof Response)) {
    throw new Error("Worker application did not return a Response");
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
  const start = performance.now();

  for (let index = 0; index < MEASURED_ITERATIONS; index++) {
    await consume(application.fetch(request));
  }

  return ((performance.now() - start) * 1_000_000) / MEASURED_ITERATIONS;
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
  const argument = values.find((value) => value.startsWith("--workload="));

  const value = argument?.slice("--workload=".length);

  if (value === "body-json" || value === "query-body-json") {
    return value;
  }

  throw new Error("Expected --workload=body-json|query-body-json");
}

function writeMessage(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}
