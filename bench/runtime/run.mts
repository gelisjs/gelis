import { mkdirSync, writeFileSync } from "node:fs";

import { cpus, totalmem } from "node:os";

import { resolve } from "node:path";

import { fileURLToPath } from "node:url";

import { Gelis } from "../../src/index.ts";

import { Router } from "../../src/runtime/router.ts";

import { runtimeReply } from "../../src/runtime/response.ts";

import type { RuntimeRouteRecord } from "../../src/runtime/types.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));

const RESULTS_DIR = resolve(HERE, "results");

const QUICK = process.argv.includes("--quick");

const SIZES = QUICK ? [100, 1000] : [1, 100, 1000, 5000];

const SAMPLES = QUICK ? 3 : 7;

const TARGET_MS = QUICK ? 40 : 80;

type RouteKind = "static" | "dynamic";

type ResponseKind = "raw" | "json";

interface RegistrationRow {
  kind: RouteKind;
  routes: number;
  milliseconds: number;
  routesPerMs: number;
}

interface DispatchRow {
  scenario: string;
  routes: number;
  nsPerOp: number;
  opsPerSecond: number;
}

interface RuntimeMetadata {
  generatedAt: string;
  runtime: string;
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  cpu: string;
  logicalCpus: number;
  totalMemoryMB: number;
  samples: number;
  sizes: number[];
}

mkdirSync(RESULTS_DIR, {
  recursive: true,
});

let sink: unknown;

const registrationRows: RegistrationRow[] = [];
const benchmarkRows: DispatchRow[] = [];

for (const size of SIZES) {
  registrationRows.push(measureRegistration("static", size));

  registrationRows.push(measureRegistration("dynamic", size));

  benchmarkRows.push(runRouterCase("static", size));

  benchmarkRows.push(runRouterCase("dynamic", size));

  benchmarkRows.push(runDispatchCase("static", size));

  benchmarkRows.push(runDispatchCase("dynamic", size));

  benchmarkRows.push(runFetchCase("static", "raw", size));

  benchmarkRows.push(runFetchCase("dynamic", "raw", size));

  benchmarkRows.push(runFetchCase("static", "json", size));

  benchmarkRows.push(runFetchCase("dynamic", "json", size));
}

const metadata = {
  generatedAt: new Date().toISOString(),

  runtime: `bun ${Bun.version}`,

  platform: process.platform,

  arch: process.arch,

  cpu: cpus()[0]?.model ?? "unknown",

  logicalCpus: cpus().length,

  totalMemoryMB: Math.round(totalmem() / 1024 / 1024),

  samples: SAMPLES,

  sizes: SIZES,
};

writeFileSync(
  resolve(RESULTS_DIR, "latest.json"),

  `${JSON.stringify(
    {
      metadata,
      registration: registrationRows,
      benchmarks: benchmarkRows,
    },
    null,
    2,
  )}\n`,
);

printMetadata(metadata);

console.log("\nRoute registration\n");

console.table(
  registrationRows.map((row) => ({
    kind: row.kind,

    routes: row.routes,

    "median ms": round(row.milliseconds, 3),

    "routes/ms": Math.round(row.routesPerMs),
  })),
);

console.log("\nRuntime dispatch\n");

console.table(
  benchmarkRows.map((row) => ({
    scenario: row.scenario,

    routes: row.routes,

    "ns/op": Math.round(row.nsPerOp),

    "ops/s": Math.round(row.opsPerSecond).toLocaleString("en-US"),
  })),
);

console.log("\nRaw results: " + "bench/runtime/results/latest.json");

function buildRouter(kind: RouteKind, size: number): Router {
  const router = new Router();

  for (let index = 0; index < size; index++) {
    const path = kind === "static" ? `/r/${index}` : `/r/${index}/:id`;

    router.register(
      {
        method: "GET",

        path,

        options: undefined,

        handler:
          kind === "static"
            ? () => index
            : ({ params }: { params: Record<string, string> }) =>
                (params as { id: string }).id,
      } as unknown as RuntimeRouteRecord,
    );
  }

  return router;
}

function targetPath(kind: RouteKind, size: number): string {
  const last = size - 1;

  return kind === "static" ? `/r/${last}` : `/r/${last}/target`;
}

function measureRegistration(kind: RouteKind, size: number): RegistrationRow {
  // Warm up registration/JIT.
  buildRouter(kind, Math.min(size, 100));

  const samples: number[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const start = performance.now();

    sink = buildRouter(kind, size);

    const elapsed = performance.now() - start;

    samples.push(elapsed);
  }

  const milliseconds = median(samples);

  return {
    kind,
    routes: size,

    milliseconds,

    routesPerMs: size / milliseconds,
  };
}

function runRouterCase(kind: RouteKind, size: number): DispatchRow {
  const router = buildRouter(kind, size);

  const pathname = targetPath(kind, size);

  return benchmarkSync(
    `router-${kind}`,
    size,

    () => {
      sink = router.match("GET", pathname);
    },
  );
}

function runDispatchCase(kind: RouteKind, size: number): DispatchRow {
  const router = buildRouter(kind, size);

  const pathname = targetPath(kind, size);

  const request = new Request(`http://gelis.test${pathname}`);

  return benchmarkSync(
    `dispatch-${kind}`,
    size,

    () => {
      const matched = router.match("GET", pathname);

      if (!matched) {
        throw new Error("Benchmark route not found");
      }

      sink = matched.route.handler({
        request,

        params: matched.params,

        query: undefined,

        body: undefined,

        reply: runtimeReply,
      });
    },
  );
}

function buildApp(
  kind: RouteKind,
  responseKind: ResponseKind,
  size: number,
): Gelis {
  const app = new Gelis();

  const rawResponse = new Response(null, {
    status: 204,
  });

  for (let index = 0; index < size; index++) {
    const path = kind === "static" ? `/r/${index}` : `/r/${index}/:id`;

    if (responseKind === "raw") {
      app.get(
        path,

        () => rawResponse,
      );

      continue;
    }

    if (kind === "static") {
      app.get(
        path,

        () => ({
          ok: true,

          route: index,
        }),
      );

      continue;
    }

    app.get(
      path,

      ({ params }) => ({
        id: (params as { id: string }).id,

        route: index,
      }),
    );
  }

  return app;
}

function runFetchCase(
  kind: RouteKind,
  responseKind: ResponseKind,
  size: number,
): DispatchRow {
  const app = buildApp(kind, responseKind, size);

  const pathname = targetPath(kind, size);

  const request = new Request(`http://gelis.test${pathname}`);

  const probe = app.fetch(request);

  if (probe !== null && typeof probe === "object" && "then" in probe) {
    throw new Error("Sync fetch benchmark unexpectedly returned a Promise");
  }

  sink = probe;

  return benchmarkSync(
    `fetch-direct-${kind}-${responseKind}`,
    size,

    () => {
      sink = app.fetch(request);
    },
  );
}

function benchmarkSync(
  scenario: string,
  routes: number,
  operation: SyncOperation,
): DispatchRow {
  warmSync(operation);

  const iterations = calibrateSync(operation);

  const samples: number[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    samples.push(measureSync(operation, iterations));
  }

  return makeResult(scenario, routes, median(samples));
}

function warmSync(operation: SyncOperation): void {
  for (let index = 0; index < 10_000; index++) {
    operation();
  }
}

function calibrateSync(operation: SyncOperation): number {
  let iterations = 1000;

  while (true) {
    const elapsed = measureSyncMilliseconds(operation, iterations);

    if (elapsed >= 10 || iterations >= 10_000_000) {
      return scaledIterations(iterations, elapsed);
    }

    iterations *= 2;
  }
}

function scaledIterations(iterations: number, elapsed: number): number {
  const scaled = Math.round(
    iterations * (TARGET_MS / Math.max(elapsed, 0.001)),
  );

  return Math.max(1, scaled);
}

function measureSync(operation: SyncOperation, iterations: number): number {
  const elapsed = measureSyncMilliseconds(operation, iterations);

  return (elapsed * 1_000_000) / iterations;
}

function measureSyncMilliseconds(
  operation: SyncOperation,
  iterations: number,
): number {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    operation();
  }

  return performance.now() - start;
}

function makeResult(
  scenario: string,
  routes: number,
  nsPerOp: number,
): DispatchRow {
  return {
    scenario,
    routes,

    nsPerOp,

    opsPerSecond: 1_000_000_000 / nsPerOp,
  };
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

function printMetadata(metadata: RuntimeMetadata): void {
  console.log("\nGelis runtime benchmark");

  console.log(`Runtime:     ${metadata.runtime}`);

  console.log(`CPU:         ${metadata.cpu}`);

  console.log(`Logical CPU: ${metadata.logicalCpus}`);

  console.log(`Memory:      ${metadata.totalMemoryMB} MB`);

  console.log(`Samples:     ${metadata.samples}`);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

void sink;
