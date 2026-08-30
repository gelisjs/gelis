import { cpus } from "node:os";

import { Router } from "../../src/runtime/router.ts";

const SAMPLES = 7;
const TARGET_MS = 80;

const SIZES = [1, 100, 1000, 5000];

let sink;

const rows = [];

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

function buildCurrentRouter(size) {
  const router = new Router();

  for (let index = 0; index < size; index++) {
    router.register({
      method: "GET",

      path: `/r/${index}/:id`,

      options: undefined,

      handler: () => undefined,
    });
  }

  return router;
}

function buildScannerRouter(size) {
  const router = new ScannerRouter();

  for (let index = 0; index < size; index++) {
    router.register("GET", `/r/${index}/:id`);
  }

  return router;
}

class ScannerRouter {
  #methods = new Map();

  register(method, path) {
    let table = this.#methods.get(method);

    if (!table) {
      table = {
        staticRoutes: new Map(),

        dynamicRoot: createNode(),
      };

      this.#methods.set(method, table);
    }

    const segments = path === "/" ? [] : path.slice(1).split("/");

    const paramNames = [];

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

  match(method, pathname) {
    const table = this.#methods.get(method);

    if (!table) {
      return undefined;
    }

    if (table.staticRoutes.has(pathname)) {
      return {
        params: EMPTY_PARAMS,
      };
    }

    const captures = [];

    const route = matchNode(table.dynamicRoot, pathname, 1, captures);

    if (!route) {
      return undefined;
    }

    const params = {};

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

function createNode() {
  return {
    staticChildren: undefined,

    paramChild: undefined,

    route: undefined,
  };
}

function matchNode(node, pathname, start, captures) {
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

function decodeParam(value) {
  if (!value.includes("%")) {
    return value;
  }

  return decodeURIComponent(value);
}

const EMPTY_PARAMS = Object.freeze({});

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

function benchmarkCase(scenario, routes, operation) {
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

  const samples = [];

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

function measure(operation, iterations) {
  const start = performance.now();

  for (let index = 0; index < iterations; index++) {
    operation();
  }

  return performance.now() - start;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

void sink;
