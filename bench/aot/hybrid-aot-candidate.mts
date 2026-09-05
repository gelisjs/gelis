import type { HttpMethod } from "../../src/route.ts";

import type {
  FlatAotArtifact,
  FlatAotMethod,
} from "../../src/runtime/flat-aot-artifact.ts";

import { Router } from "../../src/runtime/router.ts";

import type {
  DynamicNode,
  MethodRoutes,
  TrailingParamRoute,
} from "../../src/runtime/router.ts";

import type { DynamicNodeSnapshot } from "../../src/runtime/router-snapshot.ts";

import type { SemanticRoutePlan } from "../../src/runtime/semantic-route-plan.ts";

import type { RuntimeRouteRecord } from "../../src/runtime/types.ts";

export type HybridAotNodeCandidate = readonly [
  staticChildren:
    | 0
    | readonly (readonly [segment: string, child: HybridAotNodeCandidate])[],

  paramChild: 0 | HybridAotNodeCandidate,

  routeIndex: -1 | number,

  paramNames: 0 | readonly string[],
];

export type HybridAotMethodCandidate = readonly [
  methodId: number,

  staticPaths: readonly string[],

  staticRouteIndexes: readonly number[],

  trailingPrefixes: 0 | readonly string[],

  trailingRouteIndexes: 0 | readonly number[],

  trailingParamNames: 0 | readonly string[],

  dynamicRoot: 0 | HybridAotNodeCandidate,

  usesDynamicTrie: 0 | 1,
];

export type HybridAotArtifactCandidate = readonly [
  version: 1,

  routeCount: number,

  shapeFingerprint: string,

  methodNames: readonly string[],

  routeMethodIds: readonly number[],

  routePaths: readonly string[],

  methods: readonly HybridAotMethodCandidate[],
];

export function compileHybridAotArtifactCandidate(
  plan: SemanticRoutePlan,

  flat: FlatAotArtifact,
): HybridAotArtifactCandidate {
  const [
    ,
    routeCount,
    shapeFingerprint,
    methodNames,
    routeMethodIds,
    routePaths,
    flatRouter,
  ] = flat;

  const [flatMethods] = flatRouter;

  if (flatMethods.length !== plan.router.methods.length) {
    throw new Error("Gelis hybrid candidate method count mismatch");
  }

  const methods = new Array<HybridAotMethodCandidate>(flatMethods.length);

  for (let index = 0; index < flatMethods.length; index++) {
    const flatMethod = flatMethods[index];

    const snapshotEntry = plan.router.methods[index];

    if (flatMethod === undefined || snapshotEntry === undefined) {
      throw new Error(`Missing Gelis hybrid candidate method: ${index}`);
    }

    const [snapshotMethodName, snapshot] = snapshotEntry;

    const [
      methodId,
      staticPaths,
      staticRouteIndexes,
      trailingPrefixes,
      trailingRouteIndexes,
      trailingParamNames,
      ,
      usesDynamicTrie,
    ] = flatMethod;

    if (methodNames[methodId] !== snapshotMethodName) {
      throw new Error(`Gelis hybrid candidate method mismatch: ${index}`);
    }

    methods[index] = [
      methodId,

      staticPaths,

      staticRouteIndexes,

      trailingPrefixes,

      trailingRouteIndexes,

      trailingParamNames,

      usesDynamicTrie === 1 ? compactNode(snapshot.dynamicRoot) : 0,

      usesDynamicTrie,
    ];
  }

  return [
    1,

    routeCount,

    shapeFingerprint,

    methodNames,

    routeMethodIds,

    routePaths,

    methods,
  ];
}

export function hydrateHybridAotRouterCandidate(
  methodNames: readonly string[],

  methods: readonly HybridAotMethodCandidate[],

  routes: readonly RuntimeRouteRecord[],
): Router {
  const runtimeMethods = new Map<string, MethodRoutes>();

  for (let index = 0; index < methods.length; index++) {
    const method = methods[index];

    if (method === undefined) {
      throw new Error(`Missing Gelis hybrid candidate method: ${index}`);
    }

    const [methodId] = method;

    const methodName = methodNames[methodId];

    if (methodName === undefined) {
      throw new Error(`Invalid Gelis hybrid candidate method id: ${methodId}`);
    }

    asHttpMethod(methodName);

    if (runtimeMethods.has(methodName)) {
      throw new Error(`Duplicate Gelis hybrid candidate method: ${methodName}`);
    }

    runtimeMethods.set(
      methodName,

      hydrateHybridMethod(method, routes),
    );
  }

  return Router.fromMethods(runtimeMethods);
}

function compactNode(node: DynamicNodeSnapshot): HybridAotNodeCandidate {
  let staticChildren: HybridAotNodeCandidate[0] = 0;

  if (node.staticChildren !== undefined) {
    const children = new Array<readonly [string, HybridAotNodeCandidate]>(
      node.staticChildren.length,
    );

    for (let index = 0; index < node.staticChildren.length; index++) {
      const child = node.staticChildren[index];

      if (child === undefined) {
        throw new Error(`Missing Gelis hybrid candidate child: ${index}`);
      }

      children[index] = [child[0], compactNode(child[1])];
    }

    staticChildren = children;
  }

  const route = node.route;

  return [
    staticChildren,

    node.paramChild === undefined ? 0 : compactNode(node.paramChild),

    route === undefined ? -1 : route.routeIndex,

    route === undefined ? 0 : route.paramNames,
  ];
}

function hydrateHybridMethod(
  method: HybridAotMethodCandidate,

  routes: readonly RuntimeRouteRecord[],
): MethodRoutes {
  const [
    ,
    staticPaths,
    staticRouteIndexes,
    trailingPrefixes,
    trailingRouteIndexes,
    trailingParamNames,
    dynamicRoot,
    usesDynamicTrie,
  ] = method;

  if (staticPaths.length !== staticRouteIndexes.length) {
    throw new Error(
      "Gelis hybrid candidate static route column length mismatch",
    );
  }

  const staticRoutes = new Map<string, RuntimeRouteRecord>();

  for (let index = 0; index < staticPaths.length; index++) {
    const path = staticPaths[index];

    const routeIndex = staticRouteIndexes[index];

    if (path === undefined || routeIndex === undefined) {
      throw new Error(`Missing Gelis hybrid candidate static route: ${index}`);
    }

    staticRoutes.set(
      path,

      routeAt(routes, routeIndex),
    );
  }

  const trailingParamRoutes = hydrateTrailingRoutes(
    trailingPrefixes,
    trailingRouteIndexes,
    trailingParamNames,
    routes,
  );

  if (usesDynamicTrie !== 0 && usesDynamicTrie !== 1) {
    throw new Error(
      `Invalid Gelis hybrid candidate trie flag: ${usesDynamicTrie}`,
    );
  }

  let runtimeRoot: DynamicNode;

  if (usesDynamicTrie === 1) {
    if (dynamicRoot === 0) {
      throw new Error("Missing Gelis hybrid candidate dynamic root");
    }

    runtimeRoot = hydrateNestedNode(dynamicRoot, routes);
  } else {
    if (dynamicRoot !== 0) {
      throw new Error("Unexpected Gelis hybrid candidate dynamic root");
    }

    runtimeRoot = {
      staticChildren: undefined,

      paramChild: undefined,

      route: undefined,
    };
  }

  return {
    staticRoutes,

    trailingParamRoutes,

    dynamicRoot: runtimeRoot,

    usesDynamicTrie: usesDynamicTrie === 1,
  };
}

function hydrateNestedNode(
  node: HybridAotNodeCandidate,

  routes: readonly RuntimeRouteRecord[],
): DynamicNode {
  const [staticChildrenSnapshot, paramChildSnapshot, routeIndex, paramNames] =
    node;

  let staticChildren: Map<string, DynamicNode> | undefined;

  if (staticChildrenSnapshot !== 0) {
    staticChildren = new Map();

    for (const [segment, child] of staticChildrenSnapshot) {
      staticChildren.set(
        segment,

        hydrateNestedNode(child, routes),
      );
    }
  }

  let route: DynamicNode["route"];

  if (routeIndex !== -1) {
    if (paramNames === 0) {
      throw new Error("Missing Gelis hybrid candidate parameter vector");
    }

    route = {
      route: routeAt(routes, routeIndex),

      paramNames,
    };
  } else if (paramNames !== 0) {
    throw new Error("Unexpected Gelis hybrid candidate parameter vector");
  }

  return {
    staticChildren,

    paramChild:
      paramChildSnapshot === 0
        ? undefined
        : hydrateNestedNode(paramChildSnapshot, routes),

    route,
  };
}

function hydrateTrailingRoutes(
  prefixes: 0 | readonly string[],

  routeIndexes: 0 | readonly number[],

  paramNames: 0 | readonly string[],

  routes: readonly RuntimeRouteRecord[],
): Map<string, TrailingParamRoute> | undefined {
  if (prefixes === 0) {
    if (routeIndexes !== 0 || paramNames !== 0) {
      throw new Error("Gelis hybrid candidate trailing route column mismatch");
    }

    return undefined;
  }

  if (
    routeIndexes === 0 ||
    paramNames === 0 ||
    prefixes.length !== routeIndexes.length ||
    prefixes.length !== paramNames.length
  ) {
    throw new Error("Gelis hybrid candidate trailing route column mismatch");
  }

  const result = new Map<string, TrailingParamRoute>();

  for (let index = 0; index < prefixes.length; index++) {
    const prefix = prefixes[index];

    const routeIndex = routeIndexes[index];

    const paramName = paramNames[index];

    if (
      prefix === undefined ||
      routeIndex === undefined ||
      paramName === undefined
    ) {
      throw new Error(
        `Missing Gelis hybrid candidate trailing route: ${index}`,
      );
    }

    result.set(
      prefix,

      {
        route: routeAt(routes, routeIndex),

        paramName,
      },
    );
  }

  return result;
}

function routeAt(
  routes: readonly RuntimeRouteRecord[],

  index: number,
): RuntimeRouteRecord {
  const route = routes[index];

  if (route === undefined) {
    throw new Error(`Invalid Gelis hybrid candidate route index: ${index}`);
  }

  return route;
}

function asHttpMethod(method: string): HttpMethod {
  switch (method) {
    case "GET":
    case "POST":
    case "PUT":
    case "PATCH":
    case "DELETE":
    case "OPTIONS":
    case "HEAD":
      return method;

    default:
      throw new Error(`Invalid Gelis hybrid candidate HTTP method: ${method}`);
  }
}
