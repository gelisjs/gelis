import type { StandardSchemaV1 } from "../../src/index.ts";

import { Gelis } from "../../src/index.ts";
import { bodyLimit } from "../../src/body-limit/index.ts";

const LIMIT_BYTES = 1_024;
const OVER_BYTES = 1_536;
const WARMUPS = 2_000;
const TARGET_MS = 120;
const MIN_CALIBRATION_MS = 20;

interface WorkerResult {
  readonly routeCount: number;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number;
  readonly sink: number;
}

const routeCount = readRouteCount();
const dispatch = createDispatch(routeCount);
const targetPath = `/route-${routeCount - 1}`;
let sink = 0;

const operation = async () => {
  const request = createOverflowRequest(targetPath);
  const response = await dispatch(request);

  if (response.status !== 413) {
    throw new Error(`Expected 413, received ${response.status}`);
  }

  if (request.bodyUsed) {
    throw new Error(
      "Header fast reject unexpectedly consumed the request body",
    );
  }

  sink += response.status;
};

for (let index = 0; index < WARMUPS; index++) {
  await operation();
}

const iterations = await calibrate(operation);
const elapsed = await measure(operation, iterations);
const result: WorkerResult = {
  routeCount,
  iterations,
  warmups: WARMUPS,
  nsPerOp: (elapsed * 1_000_000) / iterations,
  sink,
};

console.log(JSON.stringify(result));

function createDispatch(
  count: number,
): (request: Request) => Response | Promise<Response> {
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

  for (let index = 0; index < count; index++) {
    app.post(
      `/route-${index}`,
      {
        body: Bytes,
        bodyParser: "arrayBuffer",
      },
      () => {
        throw new Error("Header fast reject reached the route handler");
      },
    );
  }

  app.use(
    bodyLimit({
      maxBytes: LIMIT_BYTES,
      onExceeded() {
        return new Response(null, { status: 413 });
      },
    }),
  );

  return (request) => app.fetch(request);
}

function createOverflowRequest(path: string): Request {
  return new Request(`http://gelis.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(OVER_BYTES),
    },
    body: new Uint8Array(OVER_BYTES),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

function readRouteCount(): number {
  const argument = process.argv.find((value) => value.startsWith("--routes="));
  const value = argument === undefined ? NaN : Number(argument.slice(9));

  if (value !== 1_000 && value !== 5_000) {
    throw new Error(`P11-E11 worker requires --routes=1000 or --routes=5000`);
  }

  return value;
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
