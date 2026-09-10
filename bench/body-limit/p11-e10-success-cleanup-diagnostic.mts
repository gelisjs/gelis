// prettier-ignore
{
const UNDER_BYTES = 768;
const STREAM_CHUNKS = [new Uint8Array(384), new Uint8Array(384)] as const;

const WARMUPS = 1_000;
const TARGET_MS = 100;
const MIN_CALIBRATION_MS = 20;

const scenarios = ["buffered-under", "streamed-under"] as const;
const strategies = ["retain-lock", "release-lock"] as const;

type Scenario = (typeof scenarios)[number];
type Strategy = (typeof strategies)[number];

console.log("P11-E10 success cleanup diagnostic");
console.log(`Bun: ${Bun.version}`);
console.log(`Payload: ${UNDER_BYTES} bytes`);
console.log("Diagnostic only: measures releaseLock() after full consumption.\n");
console.log("| scenario | strategy | ns/op | used | locked |");
console.log("| --- | --- | ---: | --- | --- |");

for (const scenario of scenarios) {
  for (const strategy of strategies) {
    let used = false;
    let locked = false;

    const operation = async () => {
      const request = createRequest(scenario);
      const body = request.body;

      if (body === null) {
        throw new Error("Expected request body");
      }

      const bytes = await readAll(body, strategy);

      if (bytes !== UNDER_BYTES) {
        throw new Error("Unexpected byte count");
      }

      used = request.bodyUsed;
      locked = body.locked;

      if (!used) {
        throw new Error("Request body was not consumed");
      }
    };

    for (let index = 0; index < WARMUPS; index++) {
      await operation();
    }

    const iterations = await calibrate(operation);
    const elapsed = await measure(operation, iterations);
    const nsPerOp = (elapsed * 1_000_000) / iterations;
    const cells = [
      scenario,
      strategy,
      nsPerOp.toFixed(1),
      used ? "yes" : "no",
      locked ? "yes" : "no",
    ];

    console.log(`| ${cells.join(" | ")} |`);
  }
}

async function readAll(
  body: ReadableStream<Uint8Array>,
  strategy: Strategy,
): Promise<number> {
  const reader = body.getReader();
  let total = 0;

  while (true) {
    const result = await reader.read();

    if (result.done) {
      if (strategy === "release-lock") {
        reader.releaseLock();
      }

      return total;
    }

    total += result.value.byteLength;
  }
}

function createRequest(scenario: Scenario): Request {
  if (scenario === "buffered-under") {
    return new Request("http://gelis.test/upload", {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(UNDER_BYTES),
      },
      body: new Uint8Array(UNDER_BYTES),
      duplex: "half",
    } as RequestInit & { duplex: "half" });
  }

  return new Request("http://gelis.test/upload", {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
    },
    body: createBodyStream(STREAM_CHUNKS),
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
}
