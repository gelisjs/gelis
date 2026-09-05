import { Router } from "../../src/runtime/router.ts";

import { hydrateRouterSnapshot } from "../../src/runtime/router-snapshot.ts";

import type {
  DynamicNodeSnapshot,
  RouterSnapshot,
} from "../../src/runtime/router-snapshot.ts";

import type {
  RuntimeRouteHandler,
  RuntimeRouteRecord,
} from "../../src/runtime/types.ts";

const ROUTES = 5000;

const MATCH_ITERATIONS = 500_000;

const kind = process.env.ROUTE_KIND;

const scenario = process.env.SCENARIO;

if (kind !== "static" && kind !== "trailing" && kind !== "generic") {
  throw new Error(`Invalid ROUTE_KIND: ${kind}`);
}

if (scenario !== "register" && scenario !== "hydrate") {
  throw new Error(`Invalid SCENARIO: ${scenario}`);
}

type RouteKind = typeof kind;

const RESPONSE = new Response(null, {
  status: 204,
});

const HANDLER: RuntimeRouteHandler = () => RESPONSE;

/*
 * Route declarations and generated snapshot data
 * are intentionally prepared outside the timer.
 *
 * In the future AOT deployment these are emitted
 * by build-time tooling.
 */
const paths = createPaths(kind);

const routes = paths.map(makeRuntimeRoute);

const snapshot = createSnapshot(kind, paths);

const target = targetPath(kind);

let router: Router;

const constructionStart = performance.now();

if (scenario === "register") {
  router = new Router();

  for (const route of routes) {
    router.register(route);
  }
} else {
  router = hydrateRouterSnapshot(snapshot, routes);
}

const constructionMs = performance.now() - constructionStart;

/*
 * Correctness sanity check happens outside the
 * construction measurement.
 */
const sanity = router.match("GET", target);

if (!sanity) {
  throw new Error("Router failed to match target");
}

if (kind !== "static" && sanity.params.id !== "target") {
  throw new Error("Router produced incorrect dynamic params");
}

if (sanity.route !== routes[ROUTES - 1]) {
  throw new Error("Router matched incorrect route");
}

/*
 * Warm request-time matching independently from
 * construction so we measure steady Router.match().
 */
let sink = 0;

for (let iteration = 0; iteration < 20_000; iteration++) {
  if (router.match("GET", target)) {
    sink++;
  }
}

const matchStarted = performance.now();

for (let iteration = 0; iteration < MATCH_ITERATIONS; iteration++) {
  if (router.match("GET", target)) {
    sink++;
  }
}

const matchElapsedMs = performance.now() - matchStarted;

const matchNs = (matchElapsedMs * 1_000_000) / MATCH_ITERATIONS;

if (sink === 0) {
  throw new Error("Invalid benchmark sink");
}

console.log(
  JSON.stringify({
    routeKind: kind,

    scenario,

    constructionMs,

    matchNs,
  }),
);

function createPaths(routeKind: RouteKind): string[] {
  const result = new Array<string>(ROUTES);

  for (let index = 0; index < ROUTES; index++) {
    switch (routeKind) {
      case "static":
        result[index] = `/r/${index}`;

        break;

      case "trailing":
        result[index] = `/r/${index}/:id`;

        break;

      case "generic":
        result[index] = `/r/${index}/:id/detail`;

        break;
    }
  }

  return result;
}

function targetPath(routeKind: RouteKind): string {
  const index = ROUTES - 1;

  switch (routeKind) {
    case "static":
      return `/r/${index}`;

    case "trailing":
      return `/r/${index}/target`;

    case "generic":
      return `/r/${index}/target/detail`;
  }
}

function makeRuntimeRoute(path: string): RuntimeRouteRecord {
  return {
    method: "GET",

    path,

    handler: HANDLER,

    flags: 0,

    input: undefined,

    beforeHandle: undefined,

    afterHandle: undefined,

    responses: undefined,
  };
}

function createSnapshot(
  routeKind: RouteKind,

  routePaths: readonly string[],
): RouterSnapshot {
  switch (routeKind) {
    case "static":
      return {
        version: 1,

        routeCount: routePaths.length,

        methods: [
          [
            "GET",

            {
              staticRoutes: routePaths.map(
                (path, routeIndex) => [path, routeIndex] as const,
              ),

              trailingParamRoutes: undefined,

              dynamicRoot: emptyNode(),

              usesDynamicTrie: false,
            },
          ],
        ],
      };

    case "trailing":
      return {
        version: 1,

        routeCount: routePaths.length,

        methods: [
          [
            "GET",

            {
              staticRoutes: [],

              trailingParamRoutes: routePaths.map((path, routeIndex) => {
                const slash = path.lastIndexOf("/");

                const prefix = path.slice(0, slash + 1);

                return [
                  prefix,

                  {
                    routeIndex,

                    paramName: "id",
                  },
                ] as const;
              }),

              dynamicRoot: emptyNode(),

              usesDynamicTrie: false,
            },
          ],
        ],
      };

    case "generic":
      return {
        version: 1,

        routeCount: routePaths.length,

        methods: [
          [
            "GET",

            {
              staticRoutes: [],

              trailingParamRoutes: undefined,

              dynamicRoot: createGenericSnapshot(routePaths),

              usesDynamicTrie: true,
            },
          ],
        ],
      };
  }
}

interface MutableNode {
  staticChildren: Map<string, MutableNode> | undefined;

  paramChild: MutableNode | undefined;

  route:
    | {
        readonly routeIndex: number;

        readonly paramNames: readonly string[];
      }
    | undefined;
}

function createGenericSnapshot(
  routePaths: readonly string[],
): DynamicNodeSnapshot {
  const root = mutableNode();

  for (let routeIndex = 0; routeIndex < routePaths.length; routeIndex++) {
    const path = routePaths[routeIndex];

    if (path === undefined) {
      throw new Error("Missing route path");
    }

    const segments = path.slice(1).split("/");

    const paramNames: string[] = [];

    let node = root;

    for (const segment of segments) {
      if (segment.startsWith(":")) {
        paramNames.push(segment.slice(1));

        if (!node.paramChild) {
          node.paramChild = mutableNode();
        }

        node = node.paramChild;

        continue;
      }

      if (!node.staticChildren) {
        node.staticChildren = new Map();
      }

      let child = node.staticChildren.get(segment);

      if (!child) {
        child = mutableNode();

        node.staticChildren.set(segment, child);
      }

      node = child;
    }

    if (node.route) {
      throw new Error("Duplicate generic snapshot route");
    }

    node.route = {
      routeIndex,

      paramNames,
    };
  }

  return freezeNode(root);
}

function mutableNode(): MutableNode {
  return {
    staticChildren: undefined,

    paramChild: undefined,

    route: undefined,
  };
}

function freezeNode(node: MutableNode): DynamicNodeSnapshot {
  return {
    staticChildren:
      node.staticChildren === undefined
        ? undefined
        : Array.from(
            node.staticChildren,

            ([segment, child]) => [segment, freezeNode(child)] as const,
          ),

    paramChild:
      node.paramChild === undefined ? undefined : freezeNode(node.paramChild),

    route: node.route,
  };
}

function emptyNode(): DynamicNodeSnapshot {
  return {
    staticChildren: undefined,

    paramChild: undefined,

    route: undefined,
  };
}
