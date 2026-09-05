import { Router } from "./router";

import type {
  DynamicNode,
  DynamicRoute,
  MethodRoutes,
  TrailingParamRoute,
} from "./router";

import type { RuntimeRouteRecord } from "./types";

export interface RouterSnapshot {
  readonly version: 1;

  readonly routeCount: number;

  readonly methods: readonly (readonly [string, MethodRoutesSnapshot])[];
}

export interface MethodRoutesSnapshot {
  readonly staticRoutes: readonly (readonly [string, number])[];

  readonly trailingParamRoutes:
    | readonly (readonly [string, TrailingParamRouteSnapshot])[]
    | undefined;

  readonly dynamicRoot: DynamicNodeSnapshot;

  readonly usesDynamicTrie: boolean;
}

export interface TrailingParamRouteSnapshot {
  readonly routeIndex: number;

  readonly paramName: string;
}

export interface DynamicRouteSnapshot {
  readonly routeIndex: number;

  readonly paramNames: readonly string[];
}

export interface DynamicNodeSnapshot {
  readonly staticChildren:
    | readonly (readonly [string, DynamicNodeSnapshot])[]
    | undefined;

  readonly paramChild: DynamicNodeSnapshot | undefined;

  readonly route: DynamicRouteSnapshot | undefined;
}

/*
 * Hydrate build-time routing metadata into the
 * exact runtime structures already consumed by Router.match().
 *
 * No path grammar parsing or Router.register()
 * occurs here.
 */
export function hydrateRouterSnapshot(
  snapshot: RouterSnapshot,

  routes: readonly RuntimeRouteRecord[],
): Router {
  if (snapshot.version !== 1) {
    throw new Error("Unsupported Gelis router snapshot version");
  }

  if (snapshot.routeCount !== routes.length) {
    throw new Error("Gelis router snapshot route count mismatch");
  }

  const methods = new Map<string, MethodRoutes>();

  for (const [method, methodSnapshot] of snapshot.methods) {
    methods.set(
      method,

      hydrateMethodRoutes(methodSnapshot, routes),
    );
  }

  return new Router(methods);
}

function hydrateMethodRoutes(
  snapshot: MethodRoutesSnapshot,

  routes: readonly RuntimeRouteRecord[],
): MethodRoutes {
  const staticRoutes = new Map<string, RuntimeRouteRecord>();

  for (const [path, routeIndex] of snapshot.staticRoutes) {
    staticRoutes.set(
      path,

      routeAt(routes, routeIndex),
    );
  }

  let trailingParamRoutes: Map<string, TrailingParamRoute> | undefined;

  if (snapshot.trailingParamRoutes !== undefined) {
    trailingParamRoutes = new Map();

    for (const [prefix, trailingSnapshot] of snapshot.trailingParamRoutes) {
      trailingParamRoutes.set(
        prefix,

        {
          route: routeAt(
            routes,

            trailingSnapshot.routeIndex,
          ),

          paramName: trailingSnapshot.paramName,
        },
      );
    }
  }

  return {
    staticRoutes,

    trailingParamRoutes,

    dynamicRoot: hydrateDynamicNode(snapshot.dynamicRoot, routes),

    usesDynamicTrie: snapshot.usesDynamicTrie,
  };
}

function hydrateDynamicNode(
  snapshot: DynamicNodeSnapshot,

  routes: readonly RuntimeRouteRecord[],
): DynamicNode {
  let staticChildren: Map<string, DynamicNode> | undefined;

  if (snapshot.staticChildren !== undefined) {
    staticChildren = new Map();

    for (const [segment, childSnapshot] of snapshot.staticChildren) {
      staticChildren.set(
        segment,

        hydrateDynamicNode(
          childSnapshot,

          routes,
        ),
      );
    }
  }

  let route: DynamicRoute | undefined;

  const routeSnapshot = snapshot.route;

  if (routeSnapshot !== undefined) {
    route = {
      route: routeAt(
        routes,

        routeSnapshot.routeIndex,
      ),

      paramNames: routeSnapshot.paramNames,
    };
  }

  return {
    staticChildren,

    paramChild:
      snapshot.paramChild === undefined
        ? undefined
        : hydrateDynamicNode(
            snapshot.paramChild,

            routes,
          ),

    route,
  };
}

function routeAt(
  routes: readonly RuntimeRouteRecord[],

  index: number,
): RuntimeRouteRecord {
  const route = routes[index];

  if (route === undefined) {
    throw new Error(`Invalid Gelis router snapshot route index: ${index}`);
  }

  return route;
}
