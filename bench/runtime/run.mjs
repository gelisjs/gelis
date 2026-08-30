import { mkdirSync, writeFileSync } from "node:fs";

import { cpus, totalmem } from "node:os";

import { resolve } from "node:path";

import { fileURLToPath } from "node:url";

import { Gelis } from "../../src/index.ts";

import { Router } from "../../src/runtime/router.ts";

import { runtimeReply } from "../../src/runtime/response.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));

const RESULTS_DIR = resolve(HERE, "results");

const QUICK = process.argv.includes("--quick");

const SIZES = QUICK ? [100, 1000] : [1, 100, 1000, 5000];

const SAMPLES = QUICK ? 3 : 7;

const TARGET_MS = QUICK ? 40 : 80;

mkdirSync(RESULTS_DIR, {
  recursive: true,
});

let sink;

const registrationRows = [];
const benchmarkRows = [];

for (const size of SIZES) {
  registrationRows.push(measureRegistration("static", size));

  registrationRows.push(measureRegistration("dynamic", size));

  benchmarkRows.push(runRouterCase("static", size));

  benchmarkRows.push(runRouterCase("dynamic", size));

  benchmarkRows.push(runDispatchCase("static", size));

  benchmarkRows.push(runDispatchCase("dynamic", size));

  benchmarkRows.push(await runFetchCase("static", "raw", size));

  benchmarkRows.push(await runFetchCase("dynamic", "raw", size));

  benchmarkRows.push(await runFetchCase("static", "json", size));

  benchmarkRows.push(await runFetchCase("dynamic", "json", size));
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

function buildRouter(kind, size) {
  const router = new Router();

  for (let index = 0; index < size; index++) {
    const path = kind === "static" ? `/r/${index}` : `/r/${index}/:id`;

    router.register({
      method: "GET",

      path,

      options: undefined,

      handler: kind === "static" ? () => index : ({ params }) => params.id,
    });
  }

  return router;
}

function targetPath(kind, size) {
  const last = size - 1;

  return kind === "static" ? `/r/${last}` : `/r/${last}/target`;
}

function measureRegistration(kind, size) {
  // Warm up registration/JIT.
  buildRouter(kind, Math.min(size, 100));

  const samples = [];

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

function runRouterCase(kind, size) {
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

function runDispatchCase(kind, size) {
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

function buildApp(kind, responseKind, size) {
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
        id: params.id,

        route: index,
      }),
    );
  }

  return app;
}

async function runFetchCase(kind, responseKind, size) {
  const app = buildApp(kind, responseKind, size);

  const pathname = targetPath(kind, size);

  const request = new Request(`http://gelis.test${pathname}`);

  return benchmarkAsync(
    `fetch-${kind}-${responseKind}`,
    size,

    async () => {
      sink = await app.fetch(request);
    },
  );
}

function benchmarkSync(scenario, routes, operation) {
  warmSync(operation);

  const iterations = calibrateSync(operation);

  const samples = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    samples.push(measureSync(operation, iterations));
  }

  return makeResult(scenario, routes, median(samples));
}

async function benchmarkAsync(scenario, routes, operation) {
  await warmAsync(operation);

  const iterations = await calibrateAsync(operation);

  const samples = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    samples.push(await measureAsync(operation, iterations));
  }

  return makeResult(scenario, routes, median(samples));
}

function warmSync(operation) {
  for (let index = 0; index < 10_000; index++) {
    operation();
  }
}

async function warmAsync(operation) {
  for (let index = 0; index < 2_000; index++) {
    await operation();
  }
}

function calibrateSync(operation) {
  let iterations = 1000;

  while (true) {
    const elapsed = measureSyncMilliseconds(operation, iterations);

    if (elapsed >= 10 || iterations >= 10_000_000) {
      return scaledIterations(iterations, elapsed);
    }

    iterations *= 2;
  }
}

async function calibrateAsync(operation) {
  let iterations = 100;

  while (true) {
    const elapsed = await measureAsyncMilliseconds(operation, iterations);

    if (elapsed >= 10 || iterations >= 1_000_000) {
      return scaledIterations(iterations, elapsed);
    }

    iterations *= 2;
  }
}

function scaledIterations(iterations, elapsed) {
  const scaled = Math.round(
    iterations * (TARGET_MS / Math.max(elapsed, 0.001)),
  );

  return Math.max(1, scaled);
}

function measureSync(operation, iterations) {
  const elapsed = measureSyncMilliseconds(operation, iterations);

  return (elapsed * 1_000_000) / iterations;
}

async function measureAsync(operation, iterations) {
  const elapsed = await measureAsyncMilliseconds(operation, iterations);

  return (elapsed * 1_000_000) / iterations;
}

function measureSyncMilliseconds(operation, iterations) {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    operation();
  }

  return performance.now() - start;
}

async function measureAsyncMilliseconds(operation, iterations) {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    await operation();
  }

  return performance.now() - start;
}

function makeResult(scenario, routes, nsPerOp) {
  return {
    scenario,
    routes,

    nsPerOp,

    opsPerSecond: 1_000_000_000 / nsPerOp,
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function printMetadata(metadata) {
  console.log("\nGelis runtime benchmark");

  console.log(`Runtime:     ${metadata.runtime}`);

  console.log(`CPU:         ${metadata.cpu}`);

  console.log(`Logical CPU: ${metadata.logicalCpus}`);

  console.log(`Memory:      ${metadata.totalMemoryMB} MB`);

  console.log(`Samples:     ${metadata.samples}`);
}

function round(value, digits) {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

void sink;
