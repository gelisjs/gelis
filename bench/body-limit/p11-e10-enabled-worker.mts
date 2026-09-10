import type { StandardSchemaV1 } from "../../src/index.ts";

const LIMIT_BYTES = 1_024;
const UNDER_BYTES = new Uint8Array(768);
const OVER_BYTES = new Uint8Array(1_536);
const UNDER_STREAM_CHUNKS = [new Uint8Array(384), new Uint8Array(384)] as const;
const OVER_STREAM_CHUNKS = [new Uint8Array(768), new Uint8Array(768)] as const;

const WARMUP_ASYNC = 2_000;
const TARGET_MS = 120;
const MIN_CALIBRATION_MS = 20;

type Framework = "gelis" | "hono";
type Scenario =
  | "valid-header-under"
  | "streamed-under"
  | "header-fast-reject"
  | "stream-overflow";

interface WorkerResult {
  readonly framework: Framework;
  readonly scenario: Scenario;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number;
  readonly sink: number;
}

const args = readArgs(process.argv.slice(2));

console.log(JSON.stringify(await run(args)));

async function run(args: ParsedArgs): Promise<WorkerResult> {
  const framework = required(args.framework, "--framework") as Framework;
  const scenario = required(args.scenario, "--scenario") as Scenario;

  assertFramework(framework);
  assertScenario(scenario);

  const dispatch =
    framework === "gelis"
      ? await createGelisDispatch()
      : await createHonoDispatch();
  const expectedStatus = isUnderLimitScenario(scenario) ? 204 : 413;
  const expectedBodyUsed = scenario !== "header-fast-reject";
  let sink = 0;

  const operation = async () => {
    const request = createRequest(scenario);
    const response = await dispatch(request);

    if (response.status !== expectedStatus) {
      throw new Error(
        `${framework}/${scenario} returned ${response.status}, expected ${expectedStatus}`,
      );
    }

    if (request.bodyUsed !== expectedBodyUsed) {
      throw new Error(
        `${framework}/${scenario} bodyUsed=${request.bodyUsed}, expected ${expectedBodyUsed}`,
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
    framework,
    scenario,
    iterations,
    warmups: WARMUP_ASYNC,
    nsPerOp: (elapsed * 1_000_000) / iterations,
    sink,
  };
}

async function createGelisDispatch(): Promise<
  (request: Request) => Response | Promise<Response>
> {
  const [{ Gelis }, { bodyLimit }] = await Promise.all([
    import("../../src/index.ts"),
    import("../../src/body-limit/index.ts"),
  ]);

  const Bytes: StandardSchemaV1<ArrayBuffer, ArrayBuffer> = {
    "~standard": {
      version: 1 as const,
      vendor: "gelis-bench",
      validate(value: unknown) {
        return value instanceof ArrayBuffer
          ? { value }
          : { issues: [{ message: "Expected ArrayBuffer" }] };
      },
    },
  };

  const app = new Gelis();

  app.use(
    bodyLimit({
      maxBytes: LIMIT_BYTES,
      onExceeded() {
        return new Response(null, { status: 413 });
      },
    }),
  );

  app.post(
    "/upload",
    {
      body: Bytes,
      bodyParser: "arrayBuffer",
    },
    ({ body }) => {
      if (body.byteLength !== UNDER_BYTES.byteLength) {
        throw new Error(`Gelis body length mismatch: ${body.byteLength}`);
      }

      return new Response(null, { status: 204 });
    },
  );

  return (request) => app.fetch(request);
}

async function createHonoDispatch(): Promise<
  (request: Request) => Response | Promise<Response>
> {
  const [{ Hono }, { bodyLimit }] = await Promise.all([
    import("hono"),
    import("hono/body-limit"),
  ]);

  const app = new Hono();

  app.post(
    "/upload",
    bodyLimit({
      maxSize: LIMIT_BYTES,
      onError() {
        return new Response(null, { status: 413 });
      },
    }),
    async (context) => {
      const body = await context.req.arrayBuffer();

      if (body.byteLength !== UNDER_BYTES.byteLength) {
        throw new Error(`Hono body length mismatch: ${body.byteLength}`);
      }

      return new Response(null, { status: 204 });
    },
  );

  return (request) => app.fetch(request);
}

function createRequest(scenario: Scenario): Request {
  const headers = new Headers({
    "content-type": "application/octet-stream",
  });

  let body: Uint8Array | ReadableStream<Uint8Array>;

  switch (scenario) {
    case "valid-header-under":
      headers.set("content-length", String(UNDER_BYTES.byteLength));
      body = UNDER_BYTES;
      break;
    case "streamed-under":
      body = createBodyStream(UNDER_STREAM_CHUNKS);
      break;
    case "header-fast-reject":
      headers.set("content-length", String(OVER_BYTES.byteLength));
      body = OVER_BYTES;
      break;
    case "stream-overflow":
      body = createBodyStream(OVER_STREAM_CHUNKS);
      break;
  }

  return new Request("http://gelis.test/upload", {
    method: "POST",
    headers,
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

function createBodyStream(
  chunks: readonly Uint8Array[],
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

function isUnderLimitScenario(scenario: Scenario): boolean {
  return scenario === "valid-header-under" || scenario === "streamed-under";
}

interface ParsedArgs {
  readonly framework?: string | undefined;
  readonly scenario?: string | undefined;
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

function assertScenario(value: string): asserts value is Scenario {
  if (
    value !== "valid-header-under" &&
    value !== "streamed-under" &&
    value !== "header-fast-reject" &&
    value !== "stream-overflow"
  ) {
    throw new Error(`Unknown P11-E10 scenario: ${value}`);
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
