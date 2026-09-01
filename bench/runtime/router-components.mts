import { cpus } from "node:os";

import { Router } from "../../src/runtime/router.ts";

import type { RuntimeRouteRecord } from "../../src/runtime/types.ts";

const SAMPLES = 7;
const TARGET_MS = 80;

const SIZES = [1, 100, 1000, 5000];

let sink: unknown;

interface ScannerDynamicRoute {
  readonly paramNames: string[];
}

interface ScannerNode {
  staticChildren: Map<string, ScannerNode> | undefined;
  paramChild: ScannerNode | undefined;
  route: ScannerDynamicRoute | undefined;
}

interface ScannerMethodTable {
  readonly staticRoutes: Map<string, true>;
  readonly dynamicRoot: ScannerNode;
}

interface ScannerMatch {
  readonly params: Record<string, string>;
}

interface ScannerBenchmarkRow {
  scenario: string;
  routes: number;
  nsPerOp: number;
  opsPerSecond: number;
}

const rows: ScannerBenchmarkRow[] = [];

for (const size of SIZES) {
  const current = buildCurrentRouter(size);

  const scanner = buildScannerRouter(size);

  const pathname = `/r/${size - 1}/target`;

  rows.push(
    benchmarkCase(
      "current-dynamic",
      size,

      () => {
        sink = current.match("GET", pathname);
      },
    ),
  );

  rows.push(
    benchmarkCase(
      "scanner-dynamic",
      size,

      () => {
        sink = scanner.match("GET", pathname);
      },
    ),
  );
}

verifyScannerCorrectness();

console.log("\nGelis dynamic-router experiment");

console.log(`Runtime:     bun ${Bun.version}`);

console.log(`CPU:         ${cpus()[0]?.model ?? "unknown"}`);

console.log(`Samples:     ${SAMPLES}\n`);

console.table(
  rows.map((row) => ({
    scenario: row.scenario,

    routes: row.routes,

    "ns/op": Math.round(row.nsPerOp),

    "ops/s": Math.round(row.opsPerSecond).toLocaleString("en-US"),
  })),
);

function buildCurrentRouter(size: number): Router {
  const router = new Router();

  for (let index = 0; index < size; index++) {
    router.register(
      {
        method: "GET",

        path: `/r/${index}/:id`,

        options: undefined,

        handler: () => undefined,
      } as unknown as RuntimeRouteRecord,
    );
  }

  return router;
}

function buildScannerRouter(size: number): ScannerRouter {
  const router = new ScannerRouter();

  for (let index = 0; index < size; index++) {
    router.register("GET", `/r/${index}/:id`);
  }

  return router;
}

class ScannerRouter {
  #methods = new Map<string, ScannerMethodTable>();

  register(method: string, path: string): void {
    let table = this.#methods.get(method);

    if (!table) {
      table = {
        staticRoutes: new Map(),

        dynamicRoot: createNode(),
      };

      this.#methods.set(method, table);
    }

    const segments = path === "/" ? [] : path.slice(1).split("/");

    const paramNames: string[] = [];

    let hasParams = false;

    for (const segment of segments) {
      if (segment.startsWith(":")) {
        hasParams = true;

        paramNames.push(segment.slice(1));
      }
    }

    if (!hasParams) {
      table.staticRoutes.set(path, true);

      return;
    }

    let node = table.dynamicRoot;

    for (const segment of segments) {
      if (segment.startsWith(":")) {
        if (!node.paramChild) {
          node.paramChild = createNode();
        }

        node = node.paramChild;

        continue;
      }

      if (!node.staticChildren) {
        node.staticChildren = new Map();
      }

      let child = node.staticChildren.get(segment);

      if (!child) {
        child = createNode();

        node.staticChildren.set(segment, child);
      }

      node = child;
    }

    node.route = {
      paramNames,
    };
  }

  match(method: string, pathname: string): ScannerMatch | undefined {
    const table = this.#methods.get(method);

    if (!table) {
      return undefined;
    }

    if (table.staticRoutes.has(pathname)) {
      return {
        params: EMPTY_PARAMS,
      };
    }

    const captures: number[] = [];

    const route = matchNode(table.dynamicRoot, pathname, 1, captures);

    if (!route) {
      return undefined;
    }

    const params: Record<string, string> = {};

    for (let index = 0; index < route.paramNames.length; index++) {
      const start = captures[index * 2];

      const end = captures[index * 2 + 1];

      const name = route.paramNames[index];

      if (start === undefined || end === undefined || name === undefined) {
        continue;
      }

      const raw = pathname.slice(start, end);

      params[name] = decodeParam(raw);
    }

    return {
      params,
    };
  }
}

function createNode(): ScannerNode {
  return {
    staticChildren: undefined,

    paramChild: undefined,

    route: undefined,
  };
}

function matchNode(
  node: ScannerNode,
  pathname: string,
  start: number,
  captures: number[],
): ScannerDynamicRoute | undefined {
  if (start >= pathname.length) {
    return node.route;
  }

  let end = pathname.indexOf("/", start);

  if (end === -1) {
    end = pathname.length;
  }

  const next = end === pathname.length ? pathname.length : end + 1;

  if (node.staticChildren) {
    const segment = pathname.slice(start, end);

    const staticChild = node.staticChildren.get(segment);

    if (staticChild) {
      const matched = matchNode(staticChild, pathname, next, captures);

      if (matched) {
        return matched;
      }
    }
  }

  if (node.paramChild) {
    captures.push(start, end);

    const matched = matchNode(node.paramChild, pathname, next, captures);

    if (matched) {
      return matched;
    }

    captures.length -= 2;
  }

  return undefined;
}

function decodeParam(value: string): string {
  if (!value.includes("%")) {
    return value;
  }

  return decodeURIComponent(value);
}

const EMPTY_PARAMS = Object.freeze({}) as Record<string, string>;

function verifyScannerCorrectness() {
  const router = new ScannerRouter();

  router.register("GET", "/users/:id");

  router.register("GET", "/a/:id/x");

  router.register("GET", "/:scope/b/y");

  const user = router.match("GET", "/users/123");

  if (user?.params.id !== "123") {
    throw new Error("Scanner param matching failed");
  }

  const fallback = router.match("GET", "/a/b/y");

  if (fallback?.params.scope !== "a") {
    throw new Error("Scanner fallback matching failed");
  }

  const encoded = new ScannerRouter();

  encoded.register("GET", "/users/:id");

  const decoded = encoded.match("GET", "/users/hello%20world");

  if (decoded?.params.id !== "hello world") {
    throw new Error("Scanner percent decoding failed");
  }
}

function benchmarkCase(
  scenario: string,
  routes: number,
  operation: SyncOperation,
): ScannerBenchmarkRow {
  for (let index = 0; index < 10_000; index++) {
    operation();
  }

  let iterations = 1000;

  while (true) {
    const elapsed = measure(operation, iterations);

    if (elapsed >= 10) {
      iterations = Math.max(
        1,

        Math.round((iterations * TARGET_MS) / Math.max(elapsed, 0.001)),
      );

      break;
    }

    iterations *= 2;
  }

  const samples: number[] = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const elapsed = measure(operation, iterations);

    samples.push((elapsed * 1_000_000) / iterations);
  }

  const nsPerOp = median(samples);

  return {
    scenario,
    routes,

    nsPerOp,

    opsPerSecond: 1_000_000_000 / nsPerOp,
  };
}

function measure(operation: SyncOperation, iterations: number): number {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    operation();
  }

  return performance.now() - start;
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
