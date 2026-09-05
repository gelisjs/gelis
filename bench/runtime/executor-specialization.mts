import { mkdirSync, writeFileSync } from "node:fs";

import { cpus } from "node:os";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";

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

type CompiledExecutor = (
  request: Request,

  params: Record<string, string>,
) => Response | Promise<Response>;

interface ExperimentalRouteRecord extends RuntimeRouteRecord {
  readonly executor: CompiledExecutor;
}

interface Fixture {
  readonly router: Router;

  readonly request: Request;

  readonly pathname: string;

  readonly route: ExperimentalRouteRecord;

  readonly params: Record<string, string>;
}

interface BenchmarkRow {
  readonly routeKind: RouteKind;

  readonly responseKind: ResponseKind;

  readonly scenario: string;

  readonly nsPerOp: number;

  readonly opsPerSecond: number;
}

let sink: unknown;

mkdirSync(
  RESULTS_DIR,

  {
    recursive: true,
  },
);

const rows: BenchmarkRow[] = [];

for (const routeKind of ["static", "dynamic"] as const) {
  for (const responseKind of ["raw", "json"] as const) {
    runExecutorExperiment(
      routeKind,

      responseKind,
    );
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
  resolve(
    RESULTS_DIR,

    "executor-specialization-latest.json",
  ),

  `${JSON.stringify(
    {
      metadata,

      benchmarks: rows,
    },

    null,

    2,
  )}\n`,
);

console.log("\nGelis executor specialization experiment");

console.log(`Runtime:     ${metadata.runtime}`);

console.log(`CPU:         ${metadata.cpu}`);

console.log(`Routes:      ${metadata.routes}`);

console.log(`Samples:     ${metadata.samples}\n`);

console.table(
  rows.map((row) => ({
    route: row.routeKind,

    response: row.responseKind,

    scenario: row.scenario,

    "ns/op": Math.round(row.nsPerOp),

    "ops/s": Math.round(row.opsPerSecond).toLocaleString("en-US"),
  })),
);

console.log(
  "\nRaw results: bench/runtime/results/executor-specialization-latest.json",
);

function runExecutorExperiment(
  routeKind: RouteKind,

  responseKind: ResponseKind,
): void {
  const fixture = buildFixture(
    routeKind,

    responseKind,

    ROUTES,
  );

  /*
   * Executor-only cases.
   *
   * Routing is deliberately removed so this
   * measures only the execution shape.
   */
  rows.push(
    benchmark(
      routeKind,

      responseKind,

      "current-executor",

      () => {
        sink = executeCurrent(
          fixture.route,

          fixture.request,

          fixture.params,
        );
      },
    ),
  );

  rows.push(
    benchmark(
      routeKind,

      responseKind,

      "compiled-executor",

      () => {
        sink = fixture.route.executor(
          fixture.request,

          fixture.params,
        );
      },
    ),
  );

  /*
   * Full pipeline cases.
   *
   * Both candidates pay exactly the same:
   *
   * request.url
   * → pathname extraction
   * → router.match()
   *
   * The only intended variable is how the
   * matched route is executed.
   */
  rows.push(
    benchmark(
      routeKind,

      responseKind,

      "current-full-pipeline",

      () => {
        const pathname = pathnameFromUrl(fixture.request.url);

        const matched = fixture.router.match(
          "GET",

          pathname,
        );

        if (!matched) {
          throw new Error("Current pipeline route not found");
        }

        sink = executeCurrent(
          matched.route,

          fixture.request,

          matched.params,
        );
      },
    ),
  );

  rows.push(
    benchmark(
      routeKind,

      responseKind,

      "compiled-full-pipeline",

      () => {
        const pathname = pathnameFromUrl(fixture.request.url);

        const matched = fixture.router.match(
          "GET",

          pathname,
        );

        if (!matched) {
          throw new Error("Compiled pipeline route not found");
        }

        const route = matched.route as ExperimentalRouteRecord;

        sink = route.executor(
          fixture.request,

          matched.params,
        );
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

  const rawResponse = new Response(
    null,

    {
      status: 204,
    },
  );

  for (let index = 0; index < size; index++) {
    const path = routeKind === "static" ? `/r/${index}` : `/r/${index}/:id`;

    const handler = makeHandler(
      routeKind,

      responseKind,

      index,

      rawResponse,
    );

    const route: ExperimentalRouteRecord = {
      method: "GET",

      path,

      handler,

      executor: compilePlainExecutor(handler),

      flags: RUNTIME_ROUTE_PLAIN,

      input: undefined,

      beforeHandle: undefined,

      afterHandle: undefined,

      responses: undefined,
    };

    router.register(route);
  }

  const pathname = targetPath(
    routeKind,

    size,
  );

  const request = new Request(`http://gelis.test${pathname}`);

  const matched = router.match(
    "GET",

    pathname,
  );

  if (!matched) {
    throw new Error("Fixture route not found");
  }

  const route = matched.route as ExperimentalRouteRecord;

  /*
   * Sanity-check both candidate execution
   * paths before benchmarking them.
   */
  const currentProbe = executeCurrent(
    route,

    request,

    matched.params,
  );

  const compiledProbe = route.executor(
    request,

    matched.params,
  );

  if (isPromiseLike(currentProbe) || isPromiseLike(compiledProbe)) {
    throw new Error("P4 synchronous fixture unexpectedly returned a Promise");
  }

  sink = currentProbe;

  sink = compiledProbe;

  return {
    router,

    request,

    pathname,

    route,

    params: matched.params,
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

function executeCurrent(
  route: RuntimeRouteRecord,

  request: Request,

  params: Record<string, string>,
): Response | Promise<Response> {
  const result = route.handler(
    createContext(
      request,

      params,
    ),
  );

  if (isPromiseLike(result)) {
    return Promise.resolve(result).then(normalizeResponse);
  }

  return normalizeResponse(result);
}

function compilePlainExecutor(handler: RuntimeRouteHandler): CompiledExecutor {
  return (
    request,

    params,
  ) => {
    const result = handler(
      createContext(
        request,

        params,
      ),
    );

    if (isPromiseLike(result)) {
      return Promise.resolve(result).then(normalizeResponse);
    }

    return normalizeResponse(result);
  };
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

  responseKind: ResponseKind,

  scenario: string,

  operation: () => void,
): BenchmarkRow {
  warm(operation);

  const iterations = calibrate(operation);

  const samples: number[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    samples.push(
      measure(
        operation,

        iterations,
      ),
    );
  }

  const nsPerOp = median(samples);

  return {
    routeKind,

    responseKind,

    scenario,

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
