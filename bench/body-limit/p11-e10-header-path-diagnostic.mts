const LIMIT_BYTES = 1_024;
const OVER_STREAM_CHUNKS = [new Uint8Array(768), new Uint8Array(768)] as const;

const WARMUPS = 2_000;
const TARGET_MS = 120;
const MIN_CALIBRATION_MS = 20;

type Strategy =
  | "direct-reader"
  | "get-content-length"
  | "has-gated-content-length"
  | "hono-style-header-check";

const strategies: readonly Strategy[] = [
  "direct-reader",
  "get-content-length",
  "has-gated-content-length",
  "hono-style-header-check",
];

console.log("P11-E10 header path diagnostic");
console.log(`Bun: ${Bun.version}`);
console.log(`Limit: ${LIMIT_BYTES} bytes`);
console.log("Scenario: streamed overflow with no Content-Length/Transfer-Encoding.\n");
console.log("| strategy | ns/op | result |");
console.log("| --- | ---: | --- |");

for (const strategy of strategies) {
  const operation = async () => {
    const request = createOverflowRequest();
    const result = await read(strategy, request);

    if (result) {
      throw new Error(`${strategy} accepted overflow`);
    }
  };

  for (let index = 0; index < WARMUPS; index++) {
    await operation();
  }

  const iterations = await calibrate(operation);
  const elapsed = await measure(operation, iterations);
  const nsPerOp = (elapsed * 1_000_000) / iterations;

  console.log(`| ${strategy} | ${nsPerOp.toFixed(1)} | overflow |`);
}

async function read(strategy: Strategy, request: Request): Promise<boolean> {
  switch (strategy) {
    case "direct-reader":
      return readBody(request);

    case "get-content-length": {
      const contentLength = request.headers.get("content-length");
      if (contentLength !== null && Number(contentLength) > LIMIT_BYTES) {
        return false;
      }
      return readBody(request);
    }

    case "has-gated-content-length": {
      if (request.headers.has("content-length")) {
        const contentLength = request.headers.get("content-length");
        if (contentLength !== null && Number(contentLength) > LIMIT_BYTES) {
          return false;
        }
      }
      return readBody(request);
    }

    case "hono-style-header-check": {
      const hasTransferEncoding = request.headers.has("transfer-encoding");
      const hasContentLength = request.headers.has("content-length");

      if (hasContentLength && !hasTransferEncoding) {
        const contentLength = Number.parseInt(
          request.headers.get("content-length") ?? "0",
          10,
        );
        if (contentLength > LIMIT_BYTES) {
          return false;
        }
      }

      return readBody(request);
    }
  }
}

async function readBody(request: Request): Promise<boolean> {
  const body = request.body;
  if (body === null) return true;

  const reader = body.getReader();
  let total = 0;

  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return true;

      const chunk = result.value;
      if (chunk.byteLength > LIMIT_BYTES - total) {
        void reader.cancel().catch(() => undefined);
        return false;
      }

      total += chunk.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
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
