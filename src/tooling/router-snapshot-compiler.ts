import type {
  DynamicNodeSnapshot,
  DynamicRouteSnapshot,
  MethodRoutesSnapshot,
  RouterSnapshot,
  TrailingParamRouteSnapshot,
} from "../runtime/router-snapshot";

import type { RuntimeRouteRecord } from "../runtime/types";

export type RouterSnapshotRoute = Pick<RuntimeRouteRecord, "method" | "path">;

interface MutableMethodRoutes {
  readonly staticRoutes: Map<string, number>;

  trailingParamRoutes: Map<string, TrailingParamRouteSnapshot> | undefined;

  readonly dynamicRoot: MutableDynamicNode;

  usesDynamicTrie: boolean;
}

interface MutableDynamicNode {
  staticChildren: Map<string, MutableDynamicNode> | undefined;

  paramChild: MutableDynamicNode | undefined;

  route: DynamicRouteSnapshot | undefined;
}

export function compileRouterSnapshot(
  routes: readonly RouterSnapshotRoute[],
): RouterSnapshot {
  const methods = new Map<string, MutableMethodRoutes>();

  for (let routeIndex = 0; routeIndex < routes.length; routeIndex++) {
    const route = routes[routeIndex];

    if (route === undefined) {
      throw new Error("Missing Gelis snapshot route");
    }

    const table = getOrCreateMethod(methods, route.method);

    registerSnapshotRoute(table, routes, route, routeIndex);
  }

  return {
    version: 1,

    routeCount: routes.length,

    methods: Array.from(
      methods,
      ([method, table]) => [method, freezeMethodRoutes(table)] as const,
    ),
  };
}

function registerSnapshotRoute(
  table: MutableMethodRoutes,

  routes: readonly RouterSnapshotRoute[],

  route: RouterSnapshotRoute,

  routeIndex: number,
): void {
  const segments = splitPath(route.path);

  const paramNames: string[] = [];

  let hasParams = false;

  for (const segment of segments) {
    if (segment.startsWith(":")) {
      hasParams = true;

      paramNames.push(segment.slice(1));
    }
  }

  /*
   * Exact static routes.
   */
  if (!hasParams) {
    if (table.staticRoutes.has(route.path)) {
      throw duplicateRoute(route);
    }

    table.staticRoutes.set(route.path, routeIndex);

    return;
  }

  const finalSegment = segments[segments.length - 1];

  const trailingParamName =
    paramNames.length === 1 && finalSegment?.startsWith(":")
      ? paramNames[0]
      : undefined;

  /*
   * P5-D trailing-param fast-map mode.
   */
  if (trailingParamName !== undefined && !table.usesDynamicTrie) {
    const slash = route.path.lastIndexOf("/");

    if (slash >= 0) {
      const prefix = route.path.slice(0, slash + 1);

      let trailing = table.trailingParamRoutes;

      if (trailing === undefined) {
        trailing = new Map();

        table.trailingParamRoutes = trailing;
      }

      if (trailing.has(prefix)) {
        throw duplicateRoute(route);
      }

      trailing.set(prefix, {
        routeIndex,

        paramName: trailingParamName,
      });

      return;
    }
  }

  /*
   * First generic dynamic route switches the
   * whole HTTP method to trie mode.
   */
  if (!table.usesDynamicTrie) {
    migrateTrailingRoutes(table, routes);

    table.usesDynamicTrie = true;
  }

  registerDynamicRoute(table.dynamicRoot, route, routeIndex);
}

function migrateTrailingRoutes(
  table: MutableMethodRoutes,

  routes: readonly RouterSnapshotRoute[],
): void {
  const trailing = table.trailingParamRoutes;

  if (trailing === undefined) {
    return;
  }

  for (const value of trailing.values()) {
    const route = routes[value.routeIndex];

    if (route === undefined) {
      throw new Error("Invalid Gelis snapshot route index");
    }

    registerDynamicRoute(table.dynamicRoot, route, value.routeIndex);
  }

  table.trailingParamRoutes = undefined;
}

function registerDynamicRoute(
  root: MutableDynamicNode,

  route: RouterSnapshotRoute,

  routeIndex: number,
): void {
  const segments = splitPath(route.path);

  const paramNames: string[] = [];

  let node = root;

  for (const segment of segments) {
    if (segment.startsWith(":")) {
      paramNames.push(segment.slice(1));

      if (node.paramChild === undefined) {
        node.paramChild = createDynamicNode();
      }

      node = node.paramChild;

      continue;
    }

    let staticChildren = node.staticChildren;

    if (staticChildren === undefined) {
      staticChildren = new Map();

      node.staticChildren = staticChildren;
    }

    let child = staticChildren.get(segment);

    if (child === undefined) {
      child = createDynamicNode();

      staticChildren.set(segment, child);
    }

    node = child;
  }

  if (node.route !== undefined) {
    throw duplicateRoute(route);
  }

  node.route = {
    routeIndex,

    paramNames,
  };
}

function getOrCreateMethod(
  methods: Map<string, MutableMethodRoutes>,

  method: string,
): MutableMethodRoutes {
  const existing = methods.get(method);

  if (existing !== undefined) {
    return existing;
  }

  const created: MutableMethodRoutes = {
    staticRoutes: new Map(),

    trailingParamRoutes: undefined,

    dynamicRoot: createDynamicNode(),

    usesDynamicTrie: false,
  };

  methods.set(method, created);

  return created;
}

function createDynamicNode(): MutableDynamicNode {
  return {
    staticChildren: undefined,

    paramChild: undefined,

    route: undefined,
  };
}

function freezeMethodRoutes(table: MutableMethodRoutes): MethodRoutesSnapshot {
  const trailing = table.trailingParamRoutes;

  return {
    staticRoutes: Array.from(
      table.staticRoutes,
      ([path, routeIndex]) => [path, routeIndex] as const,
    ),

    trailingParamRoutes:
      trailing === undefined
        ? undefined
        : Array.from(trailing, ([prefix, value]) => [prefix, value] as const),

    dynamicRoot: freezeDynamicNode(table.dynamicRoot),

    usesDynamicTrie: table.usesDynamicTrie,
  };
}

function freezeDynamicNode(node: MutableDynamicNode): DynamicNodeSnapshot {
  const staticChildren = node.staticChildren;

  return {
    staticChildren:
      staticChildren === undefined
        ? undefined
        : Array.from(
            staticChildren,
            ([segment, child]) => [segment, freezeDynamicNode(child)] as const,
          ),

    paramChild:
      node.paramChild === undefined
        ? undefined
        : freezeDynamicNode(node.paramChild),

    route: node.route,
  };
}

function splitPath(path: string): string[] {
  if (path === "/") {
    return [];
  }

  return path.slice(1).split("/");
}

function duplicateRoute(route: RouterSnapshotRoute): Error {
  return new Error(`Duplicate route: ` + `${route.method} ` + `${route.path}`);
}
