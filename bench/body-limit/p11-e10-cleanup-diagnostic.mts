const LIMIT_BYTES = 1_024;
const OVER_STREAM_CHUNKS = [new Uint8Array(768), new Uint8Array(768)] as const;

const WARMUPS = 1_000;
const TARGET_MS = 100;
const MIN_CALIBRATION_MS = 20;

type Strategy =
  | "no-cleanup"
  | "release-only"
  | "reader-cancel-only"
  | "reader-cancel-release"
  | "reader-cancel-finally"
  | "body-cancel-after-release";

const strategies: readonly Strategy[] = [
  "no-cleanup",
  "release-only",
  "reader-cancel-only",
  "reader-cancel-release",
  "reader-cancel-finally",
  "body-cancel-after-release",
];

console.log("P11-E10 overflow cleanup diagnostic");
console.log(`Bun: ${Bun.version}`);
console.log(`Limit: ${LIMIT_BYTES} bytes`);
console.log(
  "Diagnostic only: no-cleanup controls are NOT production candidates.\n",
);
console.log("| strategy | ns/op | body locked | result |");
console.log("| --- | ---: | --- | --- |");

for (const strategy of strategies) {
  let locked = false;

  const operation = async () => {
    const request = createOverflowRequest();
    const body = request.body;

    if (body === null) {
      throw new Error("Expected overflow request body");
    }

    const result = await readOverflow(body, strategy);

    if (result !== "overflow") {
      throw new Error(`${strategy} did not detect overflow`);
    }

    locked = body.locked;
  };

  for (let index = 0; index < WARMUPS; index++) {
    await operation();
  }

  const iterations = await calibrate(operation);
  const elapsed = await measure(operation, iterations);
  const nsPerOp = (elapsed * 1_000_000) / iterations;

  console.log(
    `| ${strategy} | ${nsPerOp.toFixed(1)} | ${locked ? "yes" : "no"} | overflow |`,
  );
}

async function readOverflow(
  body: ReadableStream<Uint8Array>,
  strategy: Strategy,
): Promise<"overflow"> {
  if (strategy === "reader-cancel-finally") {
    return readOverflowWithFinally(body);
  }

  const reader = body.getReader();
  let total = 0;

  while (true) {
    const result = await reader.read();

    if (result.done) {
      reader.releaseLock();
      throw new Error("Expected overflow before end of stream");
    }

    total += result.value.byteLength;

    if (total <= LIMIT_BYTES) {
      continue;
    }

    switch (strategy) {
      case "no-cleanup":
        return "overflow";
      case "release-only":
        reader.releaseLock();
        return "overflow";
      case "reader-cancel-only":
        cancelReader(reader);
        return "overflow";
      case "reader-cancel-release":
        cancelReader(reader);
        reader.releaseLock();
        return "overflow";
      case "body-cancel-after-release":
        reader.releaseLock();
        cancelBody(body);
        return "overflow";
      case "reader-cancel-finally":
        throw new Error("unreachable");
    }
  }
}

async function readOverflowWithFinally(
  body: ReadableStream<Uint8Array>,
): Promise<"overflow"> {
  const reader = body.getReader();
  let total = 0;

  try {
    while (true) {
      const result = await reader.read();

      if (result.done) {
        throw new Error("Expected overflow before end of stream");
      }

      total += result.value.byteLength;

      if (total > LIMIT_BYTES) {
        cancelReader(reader);
        return "overflow";
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): void {
  try {
    void reader.cancel().catch(() => undefined);
  } catch {
    // Diagnostic intentionally ignores cleanup failure after confirmed overflow.
  }
}

function cancelBody(body: ReadableStream<Uint8Array>): void {
  try {
    void body.cancel().catch(() => undefined);
  } catch {
    // Diagnostic intentionally ignores cleanup failure after confirmed overflow.
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
