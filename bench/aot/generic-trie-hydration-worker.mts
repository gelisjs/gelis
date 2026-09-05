import { Router } from "../../src/runtime/router.ts";

import type {
  RuntimeRouteHandler,
  RuntimeRouteRecord,
} from "../../src/runtime/types.ts";

const ROUTES = 5000;

const scenario = process.env.SCENARIO;

if (scenario !== "router-register" && scenario !== "trie-hydrate") {
  throw new Error(`Invalid SCENARIO: ${scenario}`);
}

const RESPONSE = new Response(null, {
  status: 204,
});

const HANDLER: RuntimeRouteHandler = () => RESPONSE;

interface SnapshotDynamicRoute {
  readonly routeIndex: number;

  readonly paramNames: readonly string[];
}

interface SnapshotNode {
  readonly staticChildren:
    | readonly (readonly [string, SnapshotNode])[]
    | undefined;

  readonly paramChild: SnapshotNode | undefined;

  readonly route: SnapshotDynamicRoute | undefined;
}

interface MutableSnapshotNode {
  staticChildren: Map<string, MutableSnapshotNode> | undefined;

  paramChild: MutableSnapshotNode | undefined;

  route: SnapshotDynamicRoute | undefined;
}

interface HydratedDynamicRoute {
  readonly route: RuntimeRouteRecord;

  readonly paramNames: readonly string[];
}

interface HydratedNode {
  readonly staticChildren: Map<string, HydratedNode> | undefined;

  readonly paramChild: HydratedNode | undefined;

  readonly route: HydratedDynamicRoute | undefined;
}

const paths = new Array<string>(ROUTES);

for (let index = 0; index < ROUTES; index++) {
  paths[index] = `/r/${index}/:id/detail`;
}

/*
 * RuntimeRouteRecord construction is deliberately
 * outside the timed router section.
 */
const routes = paths.map(makeRuntimeRoute);

/*
 * This represents build-time routing analysis.
 *
 * Also deliberately outside the timed section.
 */
const snapshot = buildSnapshot(paths);

let sink: unknown;

const started = performance.now();

if (scenario === "router-register") {
  const router = new Router();

  for (const route of routes) {
    router.register(route);
  }

  sink = router;
} else {
  const root = hydrateNode(snapshot, routes);

  sink = root;
}

const milliseconds = performance.now() - started;

/*
 * Sanity checks stay outside the measurement.
 */
const target = `/r/${ROUTES - 1}/target/detail`;

if (scenario === "router-register") {
  const router = sink as Router;

  const matched = router.match("GET", target);

  if (!matched || matched.params.id !== "target") {
    throw new Error("Current router sanity check failed");
  }
} else {
  const root = sink as HydratedNode;

  const matched = matchHydrated(root, target);

  if (!matched || matched.params.id !== "target") {
    throw new Error("Hydrated trie sanity check failed");
  }
}

console.log(
  JSON.stringify({
    scenario,
    milliseconds,
  }),
);

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

function buildSnapshot(routePaths: readonly string[]): SnapshotNode {
  const root = createMutableNode();

  for (let routeIndex = 0; routeIndex < routePaths.length; routeIndex++) {
    const path = routePaths[routeIndex];

    if (path === undefined) {
      continue;
    }

    const segments = path.slice(1).split("/");

    const paramNames: string[] = [];

    let node = root;

    for (const segment of segments) {
      if (segment.startsWith(":")) {
        paramNames.push(segment.slice(1));

        if (!node.paramChild) {
          node.paramChild = createMutableNode();
        }

        node = node.paramChild;

        continue;
      }

      let children = node.staticChildren;

      if (!children) {
        children = new Map();

        node.staticChildren = children;
      }

      let child = children.get(segment);

      if (!child) {
        child = createMutableNode();

        children.set(segment, child);
      }

      node = child;
    }

    if (node.route) {
      throw new Error("Duplicate snapshot route");
    }

    node.route = {
      routeIndex,
      paramNames,
    };
  }

  return freezeSnapshotNode(root);
}

function createMutableNode(): MutableSnapshotNode {
  return {
    staticChildren: undefined,

    paramChild: undefined,

    route: undefined,
  };
}

function freezeSnapshotNode(node: MutableSnapshotNode): SnapshotNode {
  const staticChildren = node.staticChildren;

  return {
    staticChildren:
      staticChildren === undefined
        ? undefined
        : Array.from(
            staticChildren,
            ([segment, child]) => [segment, freezeSnapshotNode(child)] as const,
          ),

    paramChild:
      node.paramChild === undefined
        ? undefined
        : freezeSnapshotNode(node.paramChild),

    route: node.route,
  };
}

function hydrateNode(
  snapshotNode: SnapshotNode,

  runtimeRoutes: readonly RuntimeRouteRecord[],
): HydratedNode {
  let staticChildren: Map<string, HydratedNode> | undefined;

  if (snapshotNode.staticChildren !== undefined) {
    staticChildren = new Map();

    for (const [segment, child] of snapshotNode.staticChildren) {
      staticChildren.set(
        segment,

        hydrateNode(child, runtimeRoutes),
      );
    }
  }

  const snapshotRoute = snapshotNode.route;

  let route: HydratedDynamicRoute | undefined;

  if (snapshotRoute !== undefined) {
    const runtimeRoute = runtimeRoutes[snapshotRoute.routeIndex];

    if (runtimeRoute === undefined) {
      throw new Error("Invalid snapshot route index");
    }

    route = {
      route: runtimeRoute,

      paramNames: snapshotRoute.paramNames,
    };
  }

  return {
    staticChildren,

    paramChild:
      snapshotNode.paramChild === undefined
        ? undefined
        : hydrateNode(
            snapshotNode.paramChild,

            runtimeRoutes,
          ),

    route,
  };
}

interface HydratedMatch {
  readonly route: RuntimeRouteRecord;

  readonly params: Record<string, string>;
}

function matchHydrated(
  root: HydratedNode,

  pathname: string,
): HydratedMatch | undefined {
  const captures: number[] = [];

  const route = matchNode(root, pathname, 1, captures);

  if (!route) {
    return undefined;
  }

  const params: Record<string, string> = {};

  for (let index = 0; index < route.paramNames.length; index++) {
    const name = route.paramNames[index];

    const start = captures[index * 2];

    const end = captures[index * 2 + 1];

    if (name === undefined || start === undefined || end === undefined) {
      continue;
    }

    params[name] = pathname.slice(start, end);
  }

  return {
    route: route.route,

    params,
  };
}

function matchNode(
  node: HydratedNode,

  pathname: string,

  start: number,

  captures: number[],
): HydratedDynamicRoute | undefined {
  let end = pathname.indexOf("/", start);

  const isLast = end === -1;

  if (isLast) {
    end = pathname.length;
  }

  const next = end + 1;

  const staticChildren = node.staticChildren;

  if (staticChildren) {
    const segment = pathname.slice(start, end);

    const staticChild = staticChildren.get(segment);

    if (staticChild) {
      const matched = isLast
        ? staticChild.route
        : matchNode(staticChild, pathname, next, captures);

      if (matched) {
        return matched;
      }
    }
  }

  const paramChild = node.paramChild;

  if (paramChild) {
    captures.push(start, end);

    const matched = isLast
      ? paramChild.route
      : matchNode(paramChild, pathname, next, captures);

    if (matched) {
      return matched;
    }

    captures.length -= 2;
  }

  return undefined;
}
