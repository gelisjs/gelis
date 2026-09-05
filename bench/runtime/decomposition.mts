import { mkdirSync, writeFileSync } from "node:fs";

import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

import { Gelis } from "../../src/index.ts";

import { Router } from "../../src/runtime/router.ts";

import { normalizeResponse, runtimeReply } from "../../src/runtime/response.ts";

import { pathnameFromUrl } from "../../src/runtime/url.ts";

import { RUNTIME_ROUTE_PLAIN } from "../../src/runtime/types.ts";

import type {
  RuntimeRouteContext,
  RuntimeRouteHandler,
  RuntimeRouteRecord,
} from "../../src/runtime/types.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

const RESULTS_DIR = resolve(HERE, "results");

const ROUTES = 5000;

const SAMPLES = 7;

const TARGET_MS = 80;

type RouteKind = "static" | "dynamic";

type ResponseKind = "raw" | "json";

interface BenchmarkRow {
  readonly routeKind: RouteKind;

  readonly responseKind: ResponseKind | undefined;

  readonly stage: string;

  readonly nsPerOp: number;

  readonly opsPerSecond: number;
}

interface Fixture {
  readonly router: Router;

  readonly app: Gelis;

  readonly request: Request;

  readonly pathname: string;
}

let sink: unknown;

mkdirSync(RESULTS_DIR, {
  recursive: true,
});

const rows: BenchmarkRow[] = [];

for (const routeKind of ["static", "dynamic"] as const) {
  runRoutingDecomposition(routeKind);

  for (const responseKind of ["raw", "json"] as const) {
    runExecutionDecomposition(routeKind, responseKind);
  }
}

const metadata = {
  generatedAt: new Date().toISOString(),

  runtime: `bun ${Bun.version}`,

  platform: process.platform,

  arch: process.arch,

  cpu: cpus()[0]?.model ?? "unknown",

  routes: ROUTES,

  samples: SAMPLES,

  targetMs: TARGET_MS,
};

writeFileSync(
  resolve(RESULTS_DIR, "decomposition-latest.json"),

  `${JSON.stringify(
    {
      metadata,

      benchmarks: rows,
    },

    null,

    2,
  )}\n`,
);

console.log("\nGelis runtime cost decomposition");

console.log(`Runtime:     ${metadata.runtime}`);

console.log(`CPU:         ${metadata.cpu}`);

console.log(`Routes:      ${metadata.routes}`);

console.log(`Samples:     ${metadata.samples}\n`);

console.table(
  rows.map((row) => ({
    route: row.routeKind,

    response: row.responseKind ?? "-",

    stage: row.stage,

    "ns/op": Math.round(row.nsPerOp),

    "ops/s": Math.round(row.opsPerSecond).toLocaleString("en-US"),
  })),
);

console.log("\nRaw results: bench/runtime/results/decomposition-latest.json");

function runRoutingDecomposition(routeKind: RouteKind): void {
  /*
   * Response kind is intentionally irrelevant here.
   * Use raw only to construct the route table.
   */
  const fixture = buildFixture(
    routeKind,

    "raw",

    ROUTES,
  );

  rows.push(
    benchmark(
      routeKind,

      undefined,

      "pathname",

      () => {
        sink = pathnameFromUrl(fixture.request.url);
      },
    ),
  );

  rows.push(
    benchmark(
      routeKind,

      undefined,

      "router",

      () => {
        sink = fixture.router.match(
          "GET",

          fixture.pathname,
        );
      },
    ),
  );

  rows.push(
    benchmark(
      routeKind,

      undefined,

      "pathname+router",

      () => {
        const pathname = pathnameFromUrl(fixture.request.url);

        sink = fixture.router.match(
          "GET",

          pathname,
        );
      },
    ),
  );

  rows.push(
    benchmark(
      routeKind,

      undefined,

      "pathname+router+context",

      () => {
        const pathname = pathnameFromUrl(fixture.request.url);

        const matched = fixture.router.match(
          "GET",

          pathname,
        );

        if (!matched) {
          throw new Error("Decomposition route not found");
        }

        sink = createContext(
          fixture.request,

          matched.params,
        );
      },
    ),
  );
}

function runExecutionDecomposition(
  routeKind: RouteKind,

  responseKind: ResponseKind,
): void {
  const fixture = buildFixture(
    routeKind,

    responseKind,

    ROUTES,
  );

  rows.push(
    benchmark(
      routeKind,

      responseKind,

      "pathname+router+context+handler",

      () => {
        const pathname = pathnameFromUrl(fixture.request.url);

        const matched = fixture.router.match(
          "GET",

          pathname,
        );

        if (!matched) {
          throw new Error("Decomposition route not found");
        }

        sink = matched.route.handler(
          createContext(
            fixture.request,

            matched.params,
          ),
        );
      },
    ),
  );

  rows.push(
    benchmark(
      routeKind,

      responseKind,

      "plain-executor-no-normalize",

      () => {
        const pathname = pathnameFromUrl(fixture.request.url);

        const matched = fixture.router.match(
          "GET",

          pathname,
        );

        if (!matched) {
          throw new Error("Decomposition route not found");
        }

        if (matched.route.flags !== RUNTIME_ROUTE_PLAIN) {
          throw new Error("Expected plain runtime route");
        }

        const result = matched.route.handler(
          createContext(
            fixture.request,

            matched.params,
          ),
        );

        if (isPromiseLike(result)) {
          throw new Error("Sync decomposition handler returned a Promise");
        }

        sink = result;
      },
    ),
  );

  rows.push(
    benchmark(
      routeKind,

      responseKind,

      "plain-pipeline-replica",

      () => {
        const pathname = pathnameFromUrl(fixture.request.url);

        const matched = fixture.router.match(
          "GET",

          pathname,
        );

        if (!matched) {
          throw new Error("Decomposition route not found");
        }

        if (matched.route.flags !== RUNTIME_ROUTE_PLAIN) {
          throw new Error("Expected plain runtime route");
        }

        const result = matched.route.handler(
          createContext(
            fixture.request,

            matched.params,
          ),
        );

        if (isPromiseLike(result)) {
          throw new Error("Sync decomposition handler returned a Promise");
        }

        sink = normalizeResponse(result);
      },
    ),
  );

  const probe = fixture.app.fetch(fixture.request);

  if (isPromiseLike(probe)) {
    throw new Error("Sync app.fetch decomposition returned a Promise");
  }

  sink = probe;

  rows.push(
    benchmark(
      routeKind,

      responseKind,

      "app.fetch",

      () => {
        sink = fixture.app.fetch(fixture.request);
      },
    ),
  );
}

function buildFixture(
  routeKind: RouteKind,

  responseKind: ResponseKind,

  size: number,
): Fixture {
  const router = new Router();

  const app = new Gelis();

  const rawResponse = new Response(null, {
    status: 204,
  });

  for (let index = 0; index < size; index++) {
    const path = routeKind === "static" ? `/r/${index}` : `/r/${index}/:id`;

    const handler = makeHandler(
      routeKind,

      responseKind,

      index,

      rawResponse,
    );

    const route: RuntimeRouteRecord = {
      method: "GET",

      path,

      handler,

      flags: RUNTIME_ROUTE_PLAIN,

      input: undefined,

      beforeHandle: undefined,

      afterHandle: undefined,

      responses: undefined,
    };

    router.register(route);

    if (responseKind === "raw") {
      app.get(
        path,

        handler,
      );

      continue;
    }

    if (routeKind === "static") {
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

  const pathname = targetPath(
    routeKind,

    size,
  );

  const request = new Request(`http://gelis.test${pathname}`);

  const routerProbe = router.match(
    "GET",

    pathname,
  );

  if (!routerProbe) {
    throw new Error("Fixture router route not found");
  }

  return {
    router,

    app,

    request,

    pathname,
  };
}

function makeHandler(
  routeKind: RouteKind,

  responseKind: ResponseKind,

  routeIndex: number,

  rawResponse: Response,
): RuntimeRouteHandler {
  if (responseKind === "raw") {
    return () => rawResponse;
  }

  if (routeKind === "static") {
    return () => ({
      ok: true,

      route: routeIndex,
    });
  }

  return ({ params }) => ({
    id: params.id,

    route: routeIndex,
  });
}

function createContext(
  request: Request,

  params: Record<string, string>,
): RuntimeRouteContext {
  return {
    request,

    params,

    query: undefined,

    body: undefined,

    reply: runtimeReply,
  };
}

function targetPath(
  routeKind: RouteKind,

  size: number,
): string {
  const last = size - 1;

  return routeKind === "static" ? `/r/${last}` : `/r/${last}/target`;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    "then" in value
  );
}

function benchmark(
  routeKind: RouteKind,

  responseKind: ResponseKind | undefined,

  stage: string,

  operation: () => void,
): BenchmarkRow {
  warm(operation);

  const iterations = calibrate(operation);

  const samples: number[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    samples.push(measure(operation, iterations));
  }

  const nsPerOp = median(samples);

  return {
    routeKind,

    responseKind,

    stage,

    nsPerOp,

    opsPerSecond: 1_000_000_000 / nsPerOp,
  };
}

function warm(operation: () => void): void {
  for (let index = 0; index < 10_000; index++) {
    operation();
  }
}

function calibrate(operation: () => void): number {
  let iterations = 1000;

  while (true) {
    const elapsed = measureMilliseconds(
      operation,

      iterations,
    );

    if (elapsed >= 10 || iterations >= 10_000_000) {
      return Math.max(
        1,

        Math.round(
          iterations *
            (TARGET_MS /
              Math.max(
                elapsed,

                0.001,
              )),
        ),
      );
    }

    iterations *= 2;
  }
}

function measure(
  operation: () => void,

  iterations: number,
): number {
  const elapsed = measureMilliseconds(
    operation,

    iterations,
  );

  return (elapsed * 1_000_000) / iterations;
}

function measureMilliseconds(
  operation: () => void,

  iterations: number,
): number {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    operation();
  }

  return performance.now() - start;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    const value = sorted[middle];

    if (value === undefined) {
      throw new Error("Cannot compute median of empty samples");
    }

    return value;
  }

  const left = sorted[middle - 1];

  const right = sorted[middle];

  if (left === undefined || right === undefined) {
    throw new Error("Cannot compute median of empty samples");
  }

  return (left + right) / 2;
}

void sink;
