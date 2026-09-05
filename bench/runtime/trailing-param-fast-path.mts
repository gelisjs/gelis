import { cpus } from "node:os";

import { Router } from "../../src/runtime/router.ts";

import { normalizeResponse, runtimeReply } from "../../src/runtime/response.ts";

import { pathnameFromUrl } from "../../src/runtime/url.ts";

import type {
  RuntimeRouteContext,
  RuntimeRouteHandler,
  RuntimeRouteRecord,
} from "../../src/runtime/types.ts";

const SIZES = [1, 100, 1000, 5000] as const;

const SAMPLES = 7;

const TARGET_MS = 80;

const EMPTY_PARAMS = Object.freeze({}) as Record<string, string>;

const RAW_RESPONSE = new Response(
  null,

  {
    status: 204,
  },
);

const STATIC_HANDLER: RuntimeRouteHandler = () => STATIC_RESPONSE;

const STATIC_RESPONSE = new Response("static");

let sink: unknown;

interface FastEntry {
  readonly route: RuntimeRouteRecord;

  readonly paramName: string;
}

interface RuntimeMatch {
  readonly route: RuntimeRouteRecord;

  readonly params: Record<string, string>;
}

interface ResultRow {
  readonly routes: number;

  readonly scenario: string;

  readonly nsPerOp: number;

  readonly opsPerSecond: number;
}

interface PairResult {
  readonly current: number;

  readonly candidate: number;
}

class TrailingParamRouter {
  readonly #methods = new Map<
    string,
    {
      readonly staticRoutes: Map<string, RuntimeRouteRecord>;

      readonly trailing: Map<string, FastEntry>;

      readonly fallback: Router;
    }
  >();

  register(route: RuntimeRouteRecord): void {
    const table = this.getOrCreate(route.method);

    const analysis = analyzeTrailingParam(route.path);

    if (analysis.kind === "static") {
      if (table.staticRoutes.has(route.path)) {
        throw duplicateRoute(route);
      }

      table.staticRoutes.set(route.path, route);

      return;
    }

    if (analysis.kind === "trailing") {
      if (table.trailing.has(analysis.prefix)) {
        throw duplicateRoute(route);
      }

      table.trailing.set(analysis.prefix, {
        route,

        paramName: analysis.paramName,
      });

      return;
    }

    table.fallback.register(route);
  }

  match(
    method: string,

    pathname: string,
  ): RuntimeMatch | undefined {
    const table = this.#methods.get(method);

    if (!table) {
      return undefined;
    }

    const staticRoute = table.staticRoutes.get(pathname);

    if (staticRoute) {
      return {
        route: staticRoute,

        params: EMPTY_PARAMS,
      };
    }

    const slash = pathname.lastIndexOf("/");

    if (slash >= 0) {
      const prefix = pathname.slice(
        0,

        slash + 1,
      );

      const fast = table.trailing.get(prefix);

      if (fast) {
        const raw = pathname.slice(slash + 1);

        return {
          route: fast.route,

          params: {
            [fast.paramName]: decodeParam(raw),
          },
        };
      }
    }

    return table.fallback.match(
      method,

      pathname,
    );
  }

  private getOrCreate(method: string) {
    const existing = this.#methods.get(method);

    if (existing) {
      return existing;
    }

    const created = {
      staticRoutes: new Map<string, RuntimeRouteRecord>(),

      trailing: new Map<string, FastEntry>(),

      fallback: new Router(),
    };

    this.#methods.set(
      method,

      created,
    );

    return created;
  }
}

const rows: ResultRow[] = [];

verifyCorrectness();

for (const size of SIZES) {
  const current = buildCurrentRouter(size);

  const candidate = buildCandidateRouter(size);

  const pathname = `/r/${size - 1}/target`;

  const request = new Request(`http://gelis.test${pathname}`);

  const routerPair = benchmarkPair(
    () => {
      sink = current.match(
        "GET",

        pathname,
      );
    },

    () => {
      sink = candidate.match(
        "GET",

        pathname,
      );
    },
  );

  rows.push(
    makeRow(
      size,

      "current-router",

      routerPair.current,
    ),
  );

  rows.push(
    makeRow(
      size,

      "trailing-fast-router",

      routerPair.candidate,
    ),
  );

  const fullPair = benchmarkPair(
    () => {
      const path = pathnameFromUrl(request.url);

      const matched = current.match(
        "GET",

        path,
      );

      if (!matched) {
        throw new Error("Current route not found");
      }

      const result = matched.route.handler(
        createContext(
          request,

          matched.params,
        ),
      );

      if (isPromiseLike(result)) {
        throw new Error("Unexpected Promise");
      }

      sink = normalizeResponse(result);
    },

    () => {
      const path = pathnameFromUrl(request.url);

      const matched = candidate.match(
        "GET",

        path,
      );

      if (!matched) {
        throw new Error("Candidate route not found");
      }

      const result = matched.route.handler(
        createContext(
          request,

          matched.params,
        ),
      );

      if (isPromiseLike(result)) {
        throw new Error("Unexpected Promise");
      }

      sink = normalizeResponse(result);
    },
  );

  rows.push(
    makeRow(
      size,

      "current-full-raw",

      fullPair.current,
    ),
  );

  rows.push(
    makeRow(
      size,

      "trailing-fast-full-raw",

      fullPair.candidate,
    ),
  );
}

console.log("\nGelis trailing-param fast-path experiment");

console.log(`Runtime:     bun ${Bun.version}`);

console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);

console.log(`Samples:     ${SAMPLES}\n`);

console.table(
  rows.map((row) => ({
    routes: row.routes,

    scenario: row.scenario,

    "ns/op": Math.round(row.nsPerOp),

    "ops/s": Math.round(row.opsPerSecond).toLocaleString("en-US"),
  })),
);

function buildCurrentRouter(size: number): Router {
  const router = new Router();

  for (let index = 0; index < size; index++) {
    router.register(makeRoute(index));
  }

  return router;
}

function buildCandidateRouter(size: number): TrailingParamRouter {
  const router = new TrailingParamRouter();

  for (let index = 0; index < size; index++) {
    router.register(makeRoute(index));
  }

  return router;
}

function makeRoute(index: number): RuntimeRouteRecord {
  return {
    method: "GET",

    path: `/r/${index}/:id`,

    handler: () => RAW_RESPONSE,

    flags: 0,

    input: undefined,

    beforeHandle: undefined,

    afterHandle: undefined,

    responses: undefined,
  };
}

function analyzeTrailingParam(path: string):
  | {
      readonly kind: "static";
    }
  | {
      readonly kind: "trailing";

      readonly prefix: string;

      readonly paramName: string;
    }
  | {
      readonly kind: "generic";
    } {
  if (!path.includes(":")) {
    return {
      kind: "static",
    };
  }

  const slash = path.lastIndexOf("/");

  if (slash < 0) {
    return {
      kind: "generic",
    };
  }

  const finalSegment = path.slice(slash + 1);

  if (!finalSegment.startsWith(":")) {
    return {
      kind: "generic",
    };
  }

  /*
   * Only allow exactly one named param,
   * and it must be the final segment.
   */
  const prefix = path.slice(
    0,

    slash + 1,
  );

  if (prefix.includes(":")) {
    return {
      kind: "generic",
    };
  }

  const paramName = finalSegment.slice(1);

  if (paramName.length === 0) {
    return {
      kind: "generic",
    };
  }

  return {
    kind: "trailing",

    prefix,

    paramName,
  };
}

function verifyCorrectness(): void {
  const router = new TrailingParamRouter();

  router.register({
    method: "GET",

    path: "/users/:id",

    handler: () => RAW_RESPONSE,

    flags: 0,

    input: undefined,

    beforeHandle: undefined,

    afterHandle: undefined,

    responses: undefined,
  });

  router.register({
    method: "GET",

    path: "/users/me",

    handler: STATIC_HANDLER,

    flags: 0,

    input: undefined,

    beforeHandle: undefined,

    afterHandle: undefined,

    responses: undefined,
  });

  const dynamic = router.match(
    "GET",

    "/users/123",
  );

  if (dynamic?.params.id !== "123") {
    throw new Error("Trailing param matching failed");
  }

  const encoded = router.match(
    "GET",

    "/users/hello%20world",
  );

  if (encoded?.params.id !== "hello world") {
    throw new Error("Trailing param decoding failed");
  }

  const staticMatch = router.match(
    "GET",

    "/users/me",
  );

  if (staticMatch?.route.handler !== STATIC_HANDLER) {
    throw new Error("Static precedence failed");
  }

  if (
    router.match(
      "POST",

      "/users/123",
    ) !== undefined
  ) {
    throw new Error("HTTP method isolation failed");
  }

  if (
    router.match(
      "GET",

      "/users/123/extra",
    ) !== undefined
  ) {
    throw new Error("Trailing segment rejection failed");
  }
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

function decodeParam(value: string): string {
  if (!value.includes("%")) {
    return value;
  }

  return decodeURIComponent(value);
}

function duplicateRoute(route: RuntimeRouteRecord): Error {
  return new Error(`Duplicate route: ${route.method} ${route.path}`);
}

function benchmarkPair(
  currentOperation: () => void,

  candidateOperation: () => void,
): PairResult {
  warm(currentOperation);

  warm(candidateOperation);

  const currentIterations = calibrate(currentOperation);

  const candidateIterations = calibrate(candidateOperation);

  const currentSamples: number[] = [];

  const candidateSamples: number[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    if (sample % 2 === 0) {
      currentSamples.push(
        measure(
          currentOperation,

          currentIterations,
        ),
      );

      candidateSamples.push(
        measure(
          candidateOperation,

          candidateIterations,
        ),
      );
    } else {
      candidateSamples.push(
        measure(
          candidateOperation,

          candidateIterations,
        ),
      );

      currentSamples.push(
        measure(
          currentOperation,

          currentIterations,
        ),
      );
    }
  }

  return {
    current: median(currentSamples),

    candidate: median(candidateSamples),
  };
}

function makeRow(
  routes: number,

  scenario: string,

  nsPerOp: number,
): ResultRow {
  return {
    routes,

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
  return (
    (measureMilliseconds(
      operation,

      iterations,
    ) *
      1_000_000) /
    iterations
  );
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
  const sorted = [...values].sort(
    (
      left,

      right,
    ) => left - right,
  );

  const middle = Math.floor(sorted.length / 2);

  const value = sorted[middle];

  if (value === undefined) {
    throw new Error("Cannot compute median of empty samples");
  }

  return value;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    "then" in value
  );
}

void sink;
