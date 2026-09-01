import { cpus } from "node:os";

import { normalizeResponse, runtimeReply } from "../../src/runtime/response.ts";

import type { RuntimeRouteContext } from "../../src/runtime/types.ts";

const SAMPLES = 7;
const TARGET_MS = 80;

let sink: unknown;

const request = new Request("http://gelis.test/users/123?hello=world");

const url = request.url;

const rawResponse = new Response(null, {
  status: 204,
});

const jsonPayload = {
  id: "123",
  ok: true,
};

const replyJson = runtimeReply.status(201, jsonPayload);

const serializedJson = JSON.stringify(jsonPayload);

const JSON_HEADERS = Object.freeze({
  "content-type": "application/json",
}) satisfies HeadersInit;

const syncHandler: (context: RuntimeRouteContext) => Response = () =>
  rawResponse;

const asyncHandler: (context: RuntimeRouteContext) => Promise<Response> =
  async () => rawResponse;

const context: RuntimeRouteContext = {
  request,

  params: {
    id: "123",
  },

  query: undefined,
  body: undefined,

  reply: {
    status() {},
  },
};

type ComponentCase =
  | {
      name: string;
      async: false;
      operation: SyncOperation;
    }
  | {
      name: string;
      async: true;
      operation: AsyncOperation;
    };

interface ComponentRow {
  scenario: string;
  nsPerOp: number;
  opsPerSecond: number;
}

const cases: ComponentCase[] = [
  {
    name: "pathname-new-url",

    async: false,

    operation() {
      sink = new URL(url).pathname;
    },
  },

  {
    name: "pathname-fast-scan",

    async: false,

    operation() {
      sink = pathnameFromAbsoluteUrl(url);
    },
  },

  {
    name: "context-create",

    async: false,

    operation() {
      sink = {
        request,

        params: {
          id: "123",
        },

        query: undefined,
        body: undefined,

        reply: context.reply,
      };
    },
  },

  {
    name: "handler-sync",

    async: false,

    operation() {
      sink = syncHandler(context);
    },
  },

  {
    name: "normalize-raw",

    async: false,

    operation() {
      sink = normalizeResponse(rawResponse);
    },
  },

  {
    name: "normalize-json",

    async: false,

    operation() {
      sink = normalizeResponse(jsonPayload);
    },
  },

  {
    name: "normalize-string",

    async: false,

    operation() {
      sink = normalizeResponse("hello");
    },
  },

  {
    name: "normalize-undefined",

    async: false,

    operation() {
      sink = normalizeResponse(undefined);
    },
  },

  {
    name: "normalize-reply-json",

    async: false,

    operation() {
      sink = normalizeResponse(replyJson);
    },
  },

  {
    name: "json-stringify",

    async: false,

    operation() {
      sink = JSON.stringify(jsonPayload);
    },
  },

  {
    name: "response-json-direct",

    async: false,

    operation() {
      sink = Response.json(jsonPayload);
    },
  },

  {
    name: "response-json-manual",

    async: false,

    operation() {
      sink = new Response(
        JSON.stringify(jsonPayload),

        {
          headers: JSON_HEADERS,
        },
      );
    },
  },

  {
    name: "response-json-pre-serialized",

    async: false,

    operation() {
      sink = new Response(
        serializedJson,

        {
          headers: JSON_HEADERS,
        },
      );
    },
  },

  {
    name: "await-sync-handler",

    async: true,

    async operation() {
      sink = await syncHandler(context);
    },
  },

  {
    name: "await-async-handler",

    async: true,

    async operation() {
      sink = await asyncHandler(context);
    },
  },

  {
    name: "promise-check-sync",

    async: false,

    operation() {
      const result = syncHandler(context);

      if (
        result !== null &&
        (typeof result === "object" || typeof result === "function") &&
        "then" in result
      ) {
        sink = true;
      } else {
        sink = result;
      }
    },
  },
];

const rows: ComponentRow[] = [];

for (const benchmark of cases) {
  const nsPerOp = benchmark.async
    ? await benchmarkAsync(benchmark.operation)
    : benchmarkSync(benchmark.operation);

  rows.push({
    scenario: benchmark.name,

    nsPerOp,

    opsPerSecond: 1_000_000_000 / nsPerOp,
  });
}

console.log("\nGelis runtime component benchmark");

console.log(`Runtime:     bun ${Bun.version}`);

console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);

console.log(`Samples:     ${SAMPLES}\n`);

console.table(
  rows.map((row) => ({
    scenario: row.scenario,

    "ns/op": Math.round(row.nsPerOp),

    "ops/s": Math.round(row.opsPerSecond).toLocaleString("en-US"),
  })),
);

function pathnameFromAbsoluteUrl(value: string): string {
  const scheme = value.indexOf("://");

  if (scheme === -1) {
    return new URL(value).pathname;
  }

  const authorityStart = scheme + 3;

  const pathStart = value.indexOf("/", authorityStart);

  const queryStart = value.indexOf("?", authorityStart);

  const hashStart = value.indexOf("#", authorityStart);

  if (
    pathStart === -1 ||
    (queryStart !== -1 && queryStart < pathStart) ||
    (hashStart !== -1 && hashStart < pathStart)
  ) {
    return "/";
  }

  let pathEnd = value.length;

  if (queryStart !== -1 && queryStart > pathStart) {
    pathEnd = queryStart;
  }

  if (hashStart !== -1 && hashStart > pathStart && hashStart < pathEnd) {
    pathEnd = hashStart;
  }

  return value.slice(pathStart, pathEnd);
}

function benchmarkSync(operation: SyncOperation): number {
  for (let index = 0; index < 10_000; index++) {
    operation();
  }

  let iterations = 1000;

  while (true) {
    const elapsed = measureSyncMs(operation, iterations);

    if (elapsed >= 10) {
      iterations = scaledIterations(iterations, elapsed);

      break;
    }

    iterations *= 2;
  }

  const samples: number[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const elapsed = measureSyncMs(operation, iterations);

    samples.push((elapsed * 1_000_000) / iterations);
  }

  return median(samples);
}

async function benchmarkAsync(operation: AsyncOperation): Promise<number> {
  for (let index = 0; index < 2000; index++) {
    await operation();
  }

  let iterations = 100;

  while (true) {
    const elapsed = await measureAsyncMs(operation, iterations);

    if (elapsed >= 10) {
      iterations = scaledIterations(iterations, elapsed);

      break;
    }

    iterations *= 2;
  }

  const samples: number[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const elapsed = await measureAsyncMs(operation, iterations);

    samples.push((elapsed * 1_000_000) / iterations);
  }

  return median(samples);
}

function measureSyncMs(operation: SyncOperation, iterations: number): number {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    operation();
  }

  return performance.now() - start;
}

async function measureAsyncMs(
  operation: AsyncOperation,
  iterations: number,
): Promise<number> {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    await operation();
  }

  return performance.now() - start;
}

function scaledIterations(iterations: number, elapsed: number): number {
  return Math.max(
    1,

    Math.round((iterations * TARGET_MS) / Math.max(elapsed, 0.001)),
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    const value = sorted[middle];

    if (value === undefined) {
      throw new Error("Cannot compute median of an empty sample set");
    }

    return value;
  }

  const left = sorted[middle - 1];
  const right = sorted[middle];

  if (left === undefined || right === undefined) {
    throw new Error("Cannot compute median of an empty sample set");
  }

  return (left + right) / 2;
}

void sink;
