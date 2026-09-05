import { cpus } from "node:os";

import { Router } from "../../src/runtime/router.ts";

import type { RuntimeRouteRecord } from "../../src/runtime/types.ts";

const ROUTES = 5000;

const SAMPLES = 7;

const TARGET_MS = 80;

let sink: unknown;

interface DynamicRoute {
  readonly route: RuntimeRouteRecord;

  readonly paramNames: readonly string[];
}

interface DynamicNode {
  staticChildren: Map<string, DynamicNode> | undefined;

  paramChild: DynamicNode | undefined;

  route: DynamicRoute | undefined;
}

interface MethodRoutes {
  readonly staticRoutes: Map<string, RuntimeRouteRecord>;

  readonly dynamicRoot: DynamicNode;
}

interface CaptureMatch {
  readonly route: RuntimeRouteRecord;

  readonly paramNames: readonly string[];

  readonly captures: number[];
}

interface BenchmarkRow {
  readonly scenario: string;

  readonly nsPerOp: number;

  readonly opsPerSecond: number;
}

const currentRouter = buildCurrentRouter();

const captureRouter = buildCaptureRouter();

const pathname = `/r/${ROUTES - 1}/target`;

const captureProbe = captureRouter.matchCapture(
  "GET",

  pathname,
);

if (!captureProbe) {
  throw new Error("Capture router probe failed");
}

const materializedProbe = materializeGeneric(
  pathname,

  captureProbe.paramNames,

  captureProbe.captures,
);

if (materializedProbe.id !== "target") {
  throw new Error("Generic params materialization failed");
}

const singleProbe = materializeSingle(
  pathname,

  captureProbe.paramNames,

  captureProbe.captures,
);

if (singleProbe.id !== "target") {
  throw new Error("Single-param materialization failed");
}

const rows: BenchmarkRow[] = [];

rows.push(
  benchmark(
    "current-router",

    () => {
      sink = currentRouter.match(
        "GET",

        pathname,
      );
    },
  ),
);

rows.push(
  benchmark(
    "capture-only",

    () => {
      sink = captureRouter.matchCapture(
        "GET",

        pathname,
      );
    },
  ),
);

rows.push(
  benchmark(
    "capture+generic-params",

    () => {
      const matched = captureRouter.matchCapture(
        "GET",

        pathname,
      );

      if (!matched) {
        throw new Error("Route not found");
      }

      sink = materializeGeneric(
        pathname,

        matched.paramNames,

        matched.captures,
      );
    },
  ),
);

rows.push(
  benchmark(
    "capture+single-param",

    () => {
      const matched = captureRouter.matchCapture(
        "GET",

        pathname,
      );

      if (!matched) {
        throw new Error("Route not found");
      }

      sink = materializeSingle(
        pathname,

        matched.paramNames,

        matched.captures,
      );
    },
  ),
);

/*
 * Isolated materialization.
 *
 * These use captures from a completed match so
 * we can separately observe allocation /
 * slicing / decoding / loop overhead.
 */

const fixedParamNames = captureProbe.paramNames;

const fixedCaptures = captureProbe.captures;

rows.push(
  benchmark(
    "params-generic-only",

    () => {
      sink = materializeGeneric(
        pathname,

        fixedParamNames,

        fixedCaptures,
      );
    },
  ),
);

rows.push(
  benchmark(
    "params-single-only",

    () => {
      sink = materializeSingle(
        pathname,

        fixedParamNames,

        fixedCaptures,
      );
    },
  ),
);

console.log("\nGelis params materialization experiment");

console.log(`Runtime:     bun ${Bun.version}`);

console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);

console.log(`Routes:      ${ROUTES}`);

console.log(`Samples:     ${SAMPLES}\n`);

console.table(
  rows.map((row) => ({
    scenario: row.scenario,

    "ns/op": Math.round(row.nsPerOp),

    "ops/s": Math.round(row.opsPerSecond).toLocaleString("en-US"),
  })),
);

function buildCurrentRouter(): Router {
  const router = new Router();

  for (let index = 0; index < ROUTES; index++) {
    router.register(makeRoute(index));
  }

  return router;
}

function buildCaptureRouter(): CaptureRouter {
  const router = new CaptureRouter();

  for (let index = 0; index < ROUTES; index++) {
    router.register(makeRoute(index));
  }

  return router;
}

function makeRoute(index: number): RuntimeRouteRecord {
  return {
    method: "GET",

    path: `/r/${index}/:id`,

    handler: () => undefined,

    flags: 0,

    input: undefined,

    beforeHandle: undefined,

    afterHandle: undefined,

    responses: undefined,
  };
}

class CaptureRouter {
  readonly #methods = new Map<string, MethodRoutes>();

  register(route: RuntimeRouteRecord): void {
    const table = this.getOrCreateMethod(route.method);

    const segments = splitPath(route.path);

    const paramNames: string[] = [];

    let hasParams = false;

    for (const segment of segments) {
      if (segment.startsWith(":")) {
        hasParams = true;

        paramNames.push(segment.slice(1));
      }
    }

    if (!hasParams) {
      table.staticRoutes.set(
        route.path,

        route,
      );

      return;
    }

    let node = table.dynamicRoot;

    for (const segment of segments) {
      if (segment.startsWith(":")) {
        if (!node.paramChild) {
          node.paramChild = createDynamicNode();
        }

        node = node.paramChild;

        continue;
      }

      if (!node.staticChildren) {
        node.staticChildren = new Map();
      }

      let child = node.staticChildren.get(segment);

      if (!child) {
        child = createDynamicNode();

        node.staticChildren.set(
          segment,

          child,
        );
      }

      node = child;
    }

    node.route = {
      route,

      paramNames,
    };
  }

  matchCapture(
    method: string,

    pathname: string,
  ): CaptureMatch | undefined {
    const table = this.#methods.get(method);

    if (!table) {
      return undefined;
    }

    const staticRoute = table.staticRoutes.get(pathname);

    if (staticRoute) {
      return {
        route: staticRoute,

        paramNames: EMPTY_PARAM_NAMES,

        captures: [],
      };
    }

    const captures: number[] = [];

    const dynamicRoute = matchDynamicPath(
      table.dynamicRoot,

      pathname,

      captures,
    );

    if (!dynamicRoute) {
      return undefined;
    }

    return {
      route: dynamicRoute.route,

      paramNames: dynamicRoute.paramNames,

      captures,
    };
  }

  private getOrCreateMethod(method: string): MethodRoutes {
    const existing = this.#methods.get(method);

    if (existing) {
      return existing;
    }

    const created: MethodRoutes = {
      staticRoutes: new Map(),

      dynamicRoot: createDynamicNode(),
    };

    this.#methods.set(
      method,

      created,
    );

    return created;
  }
}

function materializeGeneric(
  pathname: string,

  paramNames: readonly string[],

  captures: readonly number[],
): Record<string, string> {
  const params: Record<string, string> = {};

  for (let index = 0; index < paramNames.length; index++) {
    const name = paramNames[index];

    const start = captures[index * 2];

    const end = captures[index * 2 + 1];

    if (name === undefined || start === undefined || end === undefined) {
      continue;
    }

    params[name] = decodeParam(
      pathname.slice(
        start,

        end,
      ),
    );
  }

  return params;
}

function materializeSingle(
  pathname: string,

  paramNames: readonly string[],

  captures: readonly number[],
): Record<string, string> {
  if (paramNames.length !== 1) {
    return materializeGeneric(
      pathname,

      paramNames,

      captures,
    );
  }

  const name = paramNames[0];

  const start = captures[0];

  const end = captures[1];

  if (name === undefined || start === undefined || end === undefined) {
    return {};
  }

  return {
    [name]: decodeParam(
      pathname.slice(
        start,

        end,
      ),
    ),
  };
}

function createDynamicNode(): DynamicNode {
  return {
    staticChildren: undefined,

    paramChild: undefined,

    route: undefined,
  };
}

function matchDynamicPath(
  root: DynamicNode,

  pathname: string,

  captures: number[],
): DynamicRoute | undefined {
  if (pathname === "/") {
    return root.route;
  }

  return matchDynamicNode(
    root,

    pathname,

    1,

    captures,
  );
}

function matchDynamicNode(
  node: DynamicNode,

  pathname: string,

  start: number,

  captures: number[],
): DynamicRoute | undefined {
  let end = pathname.indexOf(
    "/",

    start,
  );

  const isLast = end === -1;

  if (isLast) {
    end = pathname.length;
  }

  const next = end + 1;

  if (node.staticChildren) {
    const segment = pathname.slice(
      start,

      end,
    );

    const staticChild = node.staticChildren.get(segment);

    if (staticChild) {
      const matched = isLast
        ? staticChild.route
        : matchDynamicNode(
            staticChild,

            pathname,

            next,

            captures,
          );

      if (matched) {
        return matched;
      }
    }
  }

  if (node.paramChild) {
    captures.push(
      start,

      end,
    );

    const matched = isLast
      ? node.paramChild.route
      : matchDynamicNode(
          node.paramChild,

          pathname,

          next,

          captures,
        );

    if (matched) {
      return matched;
    }

    captures.length -= 2;
  }

  return undefined;
}

function splitPath(path: string): string[] {
  if (path === "/") {
    return [];
  }

  return path.slice(1).split("/");
}

function decodeParam(value: string): string {
  if (!value.includes("%")) {
    return value;
  }

  return decodeURIComponent(value);
}

const EMPTY_PARAM_NAMES = Object.freeze([]) as readonly string[];

function benchmark(
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

  const value = sorted[middle];

  if (value === undefined) {
    throw new Error("Cannot compute median of empty samples");
  }

  return value;
}

void sink;
