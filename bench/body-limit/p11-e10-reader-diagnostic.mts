const LIMIT_BYTES = 1_024;
const UNDER_BYTES = new Uint8Array(768);
const UNDER_STREAM_CHUNKS = [new Uint8Array(384), new Uint8Array(384)] as const;
const OVER_STREAM_CHUNKS = [new Uint8Array(768), new Uint8Array(768)] as const;

const WARMUPS = 1_000;
const TARGET_MS = 100;
const MIN_CALIBRATION_MS = 20;

type Scenario = "buffered-under" | "streamed-under" | "stream-overflow";
type Strategy =
  | "native-arraybuffer"
  | "bun-to-bytes"
  | "standard-reader"
  | "byob-reader"
  | "peek-reader"
  | "read-many";

interface ReadResult {
  readonly ok: boolean;
  readonly bytes: number;
}

const scenarios: readonly Scenario[] = [
  "buffered-under",
  "streamed-under",
  "stream-overflow",
];

const strategies: readonly Strategy[] = [
  "native-arraybuffer",
  "bun-to-bytes",
  "standard-reader",
  "byob-reader",
  "peek-reader",
  "read-many",
];

console.log("P11-E10 body reader diagnostic");
console.log(`Bun: ${Bun.version}`);
console.log(`Limit: ${LIMIT_BYTES} bytes`);
console.log(
  "Diagnostic only: native full-body consumers are NOT acceptance candidates.\n",
);
console.log("| scenario | strategy | ns/op | result |");
console.log("| --- | --- | ---: | --- |");

for (const scenario of scenarios) {
  for (const strategy of strategies) {
    if (
      strategy === "byob-reader" &&
      !supportsByobReader(createRequest(scenario))
    ) {
      console.log(`| ${scenario} | ${strategy} | n/a | unsupported |`);
      continue;
    }

    const operation = async () => {
      const request = createRequest(scenario);
      const result = await readWithStrategy(request, strategy);
      const expectedOk = scenario !== "stream-overflow";

      if (result.ok !== expectedOk) {
        throw new Error(
          `${scenario}/${strategy} ok=${result.ok}, expected ${expectedOk}`,
        );
      }

      if (result.ok && result.bytes !== UNDER_BYTES.byteLength) {
        throw new Error(
          `${scenario}/${strategy} bytes=${result.bytes}, expected ${UNDER_BYTES.byteLength}`,
        );
      }
    };

    for (let index = 0; index < WARMUPS; index++) {
      await operation();
    }

    const iterations = await calibrate(operation);
    const elapsed = await measure(operation, iterations);
    const nsPerOp = (elapsed * 1_000_000) / iterations;

    console.log(
      `| ${scenario} | ${strategy} | ${nsPerOp.toFixed(1)} | ${scenario === "stream-overflow" ? "overflow" : "under"} |`,
    );
  }
}

async function readWithStrategy(
  request: Request,
  strategy: Strategy,
): Promise<ReadResult> {
  switch (strategy) {
    case "native-arraybuffer": {
      const bytes = (await request.arrayBuffer()).byteLength;
      return { ok: bytes <= LIMIT_BYTES, bytes };
    }
    case "bun-to-bytes": {
      const body = request.body;
      if (body === null) return { ok: true, bytes: 0 };
      const bytes = (await Bun.readableStreamToBytes(body)).byteLength;
      return { ok: bytes <= LIMIT_BYTES, bytes };
    }
    case "standard-reader":
      return readStandard(request);
    case "byob-reader":
      return readByob(request);
    case "peek-reader":
      return readPeek(request);
    case "read-many":
      return readMany(request);
  }
}

async function readStandard(request: Request): Promise<ReadResult> {
  const body = request.body;
  if (body === null) return { ok: true, bytes: 0 };

  const reader = body.getReader();
  let total = 0;

  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return { ok: true, bytes: total };

      if (result.value.byteLength > LIMIT_BYTES - total) {
        void reader.cancel().catch(() => undefined);
        return { ok: false, bytes: total + result.value.byteLength };
      }

      total += result.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
}

async function readByob(request: Request): Promise<ReadResult> {
  const body = request.body;
  if (body === null) return { ok: true, bytes: 0 };

  const reader = body.getReader({ mode: "byob" });
  let total = 0;

  try {
    while (true) {
      const remaining = LIMIT_BYTES + 1 - total;
      const result = await reader.read(new Uint8Array(remaining));

      if (result.done) {
        return { ok: true, bytes: total };
      }

      total += result.value.byteLength;

      if (total > LIMIT_BYTES) {
        void reader.cancel().catch(() => undefined);
        return { ok: false, bytes: total };
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function supportsByobReader(request: Request): boolean {
  const body = request.body;
  if (body === null) return true;

  try {
    const reader = body.getReader({ mode: "byob" });
    reader.releaseLock();
    return true;
  } catch {
    return false;
  }
}

function readPeek(request: Request): Promise<ReadResult> {
  const body = request.body;
  if (body === null) return Promise.resolve({ ok: true, bytes: 0 });

  const reader = body.getReader();
  let total = 0;

  const consume = (
    result: Awaited<ReturnType<typeof reader.read>>,
  ): ReadResult | undefined => {
    if (result.done) return { ok: true, bytes: total };

    if (result.value.byteLength > LIMIT_BYTES - total) {
      void reader.cancel().catch(() => undefined);
      return { ok: false, bytes: total + result.value.byteLength };
    }

    total += result.value.byteLength;
    return undefined;
  };

  const next = (): ReadResult | Promise<ReadResult> => {
    while (true) {
      const promise = reader.read();

      if (Bun.peek.status(promise) === "fulfilled") {
        const result = Bun.peek(promise) as Awaited<
          ReturnType<typeof reader.read>
        >;
        const consumed = consume(result);
        if (consumed !== undefined) return consumed;
        continue;
      }

      return promise.then((result) => consume(result) ?? next());
    }
  };

  try {
    const result = next();
    return result instanceof Promise
      ? result.finally(() => reader.releaseLock())
      : Promise.resolve(result).finally(() => reader.releaseLock());
  } catch (error) {
    reader.releaseLock();
    return Promise.reject(error);
  }
}

async function readMany(request: Request): Promise<ReadResult> {
  const body = request.body;
  if (body === null) return { ok: true, bytes: 0 };

  const reader = body.getReader();
  let total = 0;

  try {
    while (true) {
      const result = await reader.readMany();

      for (const chunk of result.value) {
        if (chunk.byteLength > LIMIT_BYTES - total) {
          void reader.cancel().catch(() => undefined);
          return { ok: false, bytes: total + chunk.byteLength };
        }

        total += chunk.byteLength;
      }

      if (result.done) return { ok: true, bytes: total };
    }
  } finally {
    reader.releaseLock();
  }
}

function createRequest(scenario: Scenario): Request {
  const headers = new Headers({
    "content-type": "application/octet-stream",
  });

  let body: Uint8Array | ReadableStream<Uint8Array>;

  switch (scenario) {
    case "buffered-under":
      headers.set("content-length", String(UNDER_BYTES.byteLength));
      body = UNDER_BYTES;
      break;
    case "streamed-under":
      body = createBodyStream(UNDER_STREAM_CHUNKS);
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
