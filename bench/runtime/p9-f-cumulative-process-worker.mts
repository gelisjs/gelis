import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROUTES = 5_000;
const TARGET_INDEX = ROUTES - 1;
const WARMUP_ITERATIONS = 10_000;
const MEASURED_ITERATIONS = 20_000;

type Workload =
  | "plain-static"
  | "plain-dynamic"
  | "query-json"
  | "rich-managed";

interface RuntimeContext {
  readonly params: Record<string, string>;
  readonly query: unknown;
  readonly body: unknown;
}

type RuntimeHandler = (context: RuntimeContext) => unknown;

type RuntimeBeforeHandle = (context: RuntimeContext) => unknown;

type RuntimeAfterHandle = (
  context: RuntimeContext,
  result: unknown,
) => unknown;

interface AppLike {
  get(path: string, handler: RuntimeHandler): unknown;

  post(
    path: string,
    options: object,
    handler: RuntimeHandler,
    lifecycle?: {
      readonly beforeHandle?: RuntimeBeforeHandle;
      readonly afterHandle?: RuntimeAfterHandle;
    },
  ): unknown;

  fetch(request: Request): Response | Promise<Response>;
}

interface GelisConstructor {
  new (): AppLike;
}

const args = process.argv.slice(2);
const root = readArgument(args, "--root=");
const workload = readWorkload(args);

const loaded = (await import(
  pathToFileURL(resolve(root, "src/index.ts")).href
)) as {
  readonly Gelis: GelisConstructor;
};

const app = createApplication(loaded.Gelis, workload);
const request = createRequest(workload);

let sink = 0;

await verifyCorrectness(app, request, workload);
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

    writeMessage({
      type: "measurement",
      ns: await measure(app, request),
    });

    continue;
  }

  if (line === "close") {
    input.close();
    break;
  }

  throw new Error(`Unknown P9-F worker command: ${line}`);
}

void sink;

function createApplication(
  Constructor: GelisConstructor,
  selectedWorkload: Workload,
): AppLike {
  const application = new Constructor();
  const sharedResponse = new Response("ok");

  const Query = {
    "~standard": {
      version: 1 as const,
      vendor: "gelis-p9-f",
      validate(value: unknown) {
        return {
          value,
        };
      },
    },
  };

  const Body = {
    "~standard": {
      version: 1 as const,
      vendor: "gelis-p9-f",
      validate(value: unknown) {
        return {
          value,
        };
      },
    },
  };

  const ResponseBody = {
    "~standard": {
      version: 1 as const,
      vendor: "gelis-p9-f",
      validate(value: unknown) {
        return {
          value,
        };
      },
    },
  };

  for (let index = 0; index < ROUTES; index++) {
    if (selectedWorkload === "plain-static") {
      application.get(`/r/${index}`, () => sharedResponse);
      continue;
    }

    if (selectedWorkload === "plain-dynamic") {
      application.get(`/r/${index}/:id`, () => sharedResponse);
      continue;
    }

    if (selectedWorkload === "query-json") {
      application.post(
        `/r/${index}`,
        {
          query: Query,
          body: Body,
        },
        () => sharedResponse,
      );
      continue;
    }

    application.post(
      `/r/${index}/:id`,
      {
        query: Query,
        body: Body,
        responses: {
          200: {
            schema: ResponseBody,
            serialize: "json",
            validate: true,
          },
        },
      },
      ({ params, query, body }) => ({
        id: params.id,
        query,
        body,
      }),
      {
        beforeHandle() {},
        afterHandle() {},
      },
    );
  }

  return application;
}

function createRequest(selectedWorkload: Workload): Request {
  if (selectedWorkload === "plain-static") {
    return new Request(`http://gelis.test/r/${TARGET_INDEX}`);
  }

  if (selectedWorkload === "plain-dynamic") {
    return new Request(`http://gelis.test/r/${TARGET_INDEX}/target`);
  }

  const dynamicSuffix = selectedWorkload === "rich-managed" ? "/target" : "";
  const url =
    `http://gelis.test/r/${TARGET_INDEX}${dynamicSuffix}` +
    "?q=gelis";

  const payload = {
    value: "gelis",
  };

  return {
    method: "POST",
    url,
    headers: {
      get(name: string): string | null {
        return name.toLowerCase() === "content-type"
          ? "application/json"
          : null;
      },
    },
    json() {
      return Promise.resolve(payload);
    },
  } as unknown as Request;
}

async function verifyCorrectness(
  application: AppLike,
  request: Request,
  selectedWorkload: Workload,
): Promise<void> {
  const response = await application.fetch(request);

  if (!(response instanceof Response)) {
    throw new Error("P9-F worker did not return a Response");
  }

  if (response.status !== 200) {
    throw new Error(
      `P9-F worker returned status ${response.status} for ${selectedWorkload}`,
    );
  }

  if (selectedWorkload === "rich-managed") {
    const body = (await response.json()) as {
      readonly id?: unknown;
      readonly query?: unknown;
      readonly body?: unknown;
    };

    if (body.id !== "target" || body.query === undefined || body.body === undefined) {
      throw new Error("P9-F rich-managed correctness validation failed");
    }
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
  const argument = values.find((value) => value.startsWith("--workload="));
  const value = argument?.slice("--workload=".length);

  if (
    value === "plain-static" ||
    value === "plain-dynamic" ||
    value === "query-json" ||
    value === "rich-managed"
  ) {
    return value;
  }

  throw new Error(
    "Expected --workload=plain-static|plain-dynamic|query-json|rich-managed",
  );
}

function writeMessage(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}
