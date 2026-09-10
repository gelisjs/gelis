import type { StandardSchemaV1 } from "../../src/index.ts";

import { Gelis } from "../../src/index.ts";
import { bodyLimit } from "../../src/body-limit/index.ts";
import { compileRuntimeLimitedBodyReader } from "../../src/runtime/body-limit.ts";

const LIMIT_BYTES = 1_024;
const UNDER_BYTES = 768;
const OVER_STREAM_CHUNKS = [new Uint8Array(768), new Uint8Array(768)] as const;

const WARMUPS = 2_000;
const TARGET_MS = 120;
const MIN_CALIBRATION_MS = 20;

type Strategy =
  | "core-reader"
  | "plain-route-reader"
  | "managed-body-limit"
  | "hono-body-limit";

const strategies: readonly Strategy[] = [
  "core-reader",
  "plain-route-reader",
  "managed-body-limit",
  "hono-body-limit",
];

const coreReader = compileRuntimeLimitedBodyReader(LIMIT_BYTES);
const plainDispatch = createPlainDispatch();
const managedDispatch = createManagedDispatch();
const honoDispatch = await createHonoDispatch();

console.log("P11-E10 overflow path diagnostic");
console.log(`Bun: ${Bun.version}`);
console.log(`Limit: ${LIMIT_BYTES} bytes`);
console.log("Diagnostic only: decomposes the streamed-overflow path.\n");
console.log("| strategy | ns/op | status |");
console.log("| --- | ---: | ---: |");

for (const strategy of strategies) {
  const operation = operationFor(strategy);

  for (let index = 0; index < WARMUPS; index++) {
    await operation();
  }

  const iterations = await calibrate(operation);
  const elapsed = await measure(operation, iterations);
  const nsPerOp = (elapsed * 1_000_000) / iterations;

  console.log(`| ${strategy} | ${nsPerOp.toFixed(1)} | 413 |`);
}

function operationFor(strategy: Strategy): () => Promise<void> {
  switch (strategy) {
    case "core-reader":
      return async () => {
        const request = createOverflowRequest();
        const result = await coreReader(request);

        if (result.ok) {
          throw new Error("Core limited reader accepted overflow");
        }
      };
    case "plain-route-reader":
      return async () => {
        const response = await plainDispatch(createOverflowRequest());
        if (response.status !== 413) {
          throw new Error(`Plain Gelis overflow returned ${response.status}`);
        }
      };
    case "managed-body-limit":
      return async () => {
        const response = await managedDispatch(createOverflowRequest());
        if (response.status !== 413) {
          throw new Error(`Managed Gelis overflow returned ${response.status}`);
        }
      };
    case "hono-body-limit":
      return async () => {
        const response = await honoDispatch(createOverflowRequest());
        if (response.status !== 413) {
          throw new Error(`Hono overflow returned ${response.status}`);
        }
      };
  }
}

function createPlainDispatch(): (
  request: Request,
) => Response | Promise<Response> {
  const app = new Gelis();

  app.post("/upload", async ({ request }) => {
    const result = await coreReader(request);

    return result.ok
      ? new Response(null, { status: 500 })
      : new Response(null, { status: 413 });
  });

  return (request) => app.fetch(request);
}

function createManagedDispatch(): (
  request: Request,
) => Response | Promise<Response> {
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
      if (body.byteLength !== UNDER_BYTES) {
        throw new Error(`Unexpected managed body length: ${body.byteLength}`);
      }

      return new Response(null, { status: 204 });
    },
  );

  return (request) => app.fetch(request);
}

async function createHonoDispatch(): Promise<
  (request: Request) => Response | Promise<Response>
> {
  const [{ Hono }, { bodyLimit: honoBodyLimit }] = await Promise.all([
    import("hono"),
    import("hono/body-limit"),
  ]);

  const app = new Hono();

  app.post(
    "/upload",
    honoBodyLimit({
      maxSize: LIMIT_BYTES,
      onError() {
        return new Response(null, { status: 413 });
      },
    }),
    () => new Response(null, { status: 204 }),
  );

  return (request) => app.fetch(request);
}

function createOverflowRequest(): Request {
  return new Request("http://gelis.test/upload", {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
    },
    body: createBodyStream(OVER_STREAM_CHUNKS),
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

async function calibrate(operation: () => Promise<void>): Promise<number> {
  let iterations = 100;

  while (true) {
    const elapsed = await measure(operation, iterations);

    if (elapsed >= MIN_CALIBRATION_MS) {
      return Math.max(
        1,
        Math.round((iterations * TARGET_MS) / Math.max(elapsed, 0.001)),
      );
    }

    iterations *= 2;
  }
}

async function measure(
  operation: () => Promise<void>,
  iterations: number,
): Promise<number> {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    await operation();
  }

  return performance.now() - start;
}
