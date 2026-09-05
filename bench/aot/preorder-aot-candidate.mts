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

export type PreorderAotMethodCandidate = readonly [
  methodId: number,

  staticPaths: readonly string[],

  staticRouteIndexes: readonly number[],

  trailingPrefixes: 0 | readonly string[],

  trailingRouteIndexes: 0 | readonly number[],

  trailingParamNames: 0 | readonly string[],

  nodeStart: number,

  nodeCount: number,

  edgeStart: number,

  edgeCount: number,

  paramStart: number,

  paramEntryCount: number,

  usesDynamicTrie: 0 | 1,
];

export type PreorderAotRouterCandidate = readonly [
  methods: readonly PreorderAotMethodCandidate[],

  nodeStaticCount: readonly number[],

  nodeHasParamChild: readonly number[],

  nodeRouteIndex: readonly number[],

  nodeParamCount: readonly number[],

  edgeSegments: readonly string[],

  paramNames: readonly string[],
];

export type PreorderAotArtifactCandidate = readonly [
  version: 1,

  routeCount: number,

  shapeFingerprint: string,

  methodNames: readonly string[],

  routeMethodIds: readonly number[],

  routePaths: readonly string[],

  router: PreorderAotRouterCandidate,
];

interface MutablePreorderRouter {
  readonly methods: PreorderAotMethodCandidate[];

  readonly nodeStaticCount: number[];

  readonly nodeHasParamChild: number[];

  readonly nodeRouteIndex: number[];

  readonly nodeParamCount: number[];

  readonly edgeSegments: string[];

  readonly paramNames: string[];
}

export function compilePreorderAotArtifactCandidate(
  plan: SemanticRoutePlan,

  flat: FlatAotArtifact,
): PreorderAotArtifactCandidate {
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
    throw new Error("Gelis preorder candidate method count mismatch");
  }

  const preorder: MutablePreorderRouter = {
    methods: [],

    nodeStaticCount: [],

    nodeHasParamChild: [],

    nodeRouteIndex: [],

    nodeParamCount: [],

    edgeSegments: [],

    paramNames: [],
  };

  for (let index = 0; index < flatMethods.length; index++) {
    const flatMethod = flatMethods[index];

    const snapshotEntry = plan.router.methods[index];

    if (flatMethod === undefined || snapshotEntry === undefined) {
      throw new Error(`Missing Gelis preorder candidate method: ${index}`);
    }

    preorder.methods.push(
      compileMethod(
        flatMethod,

        snapshotEntry[1],

        preorder,
      ),
    );
  }

  return [
    1,

    routeCount,

    shapeFingerprint,

    methodNames,

    routeMethodIds,

    routePaths,

    [
      preorder.methods,

      preorder.nodeStaticCount,

      preorder.nodeHasParamChild,

      preorder.nodeRouteIndex,

      preorder.nodeParamCount,

      preorder.edgeSegments,

      preorder.paramNames,
    ],
  ];
}

function compileMethod(
  flatMethod: FlatAotMethod,

  rootSnapshot: {
    readonly dynamicRoot: DynamicNodeSnapshot;

    readonly usesDynamicTrie: boolean;
  },

  preorder: MutablePreorderRouter,
): PreorderAotMethodCandidate {
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

  const nodeStart = preorder.nodeStaticCount.length;

  const edgeStart = preorder.edgeSegments.length;

  const paramStart = preorder.paramNames.length;

  if (usesDynamicTrie === 1) {
    encodeNode(
      rootSnapshot.dynamicRoot,

      preorder,
    );
  }

  return [
    methodId,

    staticPaths,

    staticRouteIndexes,

    trailingPrefixes,

    trailingRouteIndexes,

    trailingParamNames,

    nodeStart,

    preorder.nodeStaticCount.length - nodeStart,

    edgeStart,

    preorder.edgeSegments.length - edgeStart,

    paramStart,

    preorder.paramNames.length - paramStart,

    usesDynamicTrie,
  ];
}

function encodeNode(
  node: DynamicNodeSnapshot,

  preorder: MutablePreorderRouter,
): void {
  const children = node.staticChildren;

  preorder.nodeStaticCount.push(children?.length ?? 0);

  preorder.nodeHasParamChild.push(node.paramChild === undefined ? 0 : 1);

  preorder.nodeRouteIndex.push(node.route?.routeIndex ?? -1);

  preorder.nodeParamCount.push(node.route?.paramNames.length ?? 0);

  if (node.route !== undefined) {
    for (const name of node.route.paramNames) {
      preorder.paramNames.push(name);
    }
  }

  if (children !== undefined) {
    for (const [segment] of children) {
      preorder.edgeSegments.push(segment);
    }

    for (const [, child] of children) {
      encodeNode(
        child,

        preorder,
      );
    }
  }

  if (node.paramChild !== undefined) {
    encodeNode(
      node.paramChild,

      preorder,
    );
  }
}

export function hydratePreorderAotRouterCandidate(
  methodNames: readonly string[],

  preorder: PreorderAotRouterCandidate,

  routes: readonly RuntimeRouteRecord[],
): Router {
  const [
    methods,
    nodeStaticCount,
    nodeHasParamChild,
    nodeRouteIndex,
    nodeParamCount,
    edgeSegments,
    paramNames,
  ] = preorder;

  const runtimeMethods = new Map<string, MethodRoutes>();

  for (let methodIndex = 0; methodIndex < methods.length; methodIndex++) {
    const method = methods[methodIndex];

    if (method === undefined) {
      throw new Error(
        `Missing Gelis preorder candidate method: ${methodIndex}`,
      );
    }

    const [methodId] = method;

    const methodName = methodNames[methodId];

    if (methodName === undefined) {
      throw new Error(
        `Invalid Gelis preorder candidate method id: ${methodId}`,
      );
    }

    asHttpMethod(methodName);

    if (runtimeMethods.has(methodName)) {
      throw new Error(
        `Duplicate Gelis preorder candidate method: ${methodName}`,
      );
    }

    runtimeMethods.set(
      methodName,

      hydrateMethod(
        method,

        nodeStaticCount,
        nodeHasParamChild,
        nodeRouteIndex,
        nodeParamCount,
        edgeSegments,
        paramNames,
        routes,
      ),
    );
  }

  return Router.fromMethods(runtimeMethods);
}

interface Cursor {
  node: number;

  edge: number;

  param: number;
}

function hydrateMethod(
  method: PreorderAotMethodCandidate,

  nodeStaticCount: readonly number[],

  nodeHasParamChild: readonly number[],

  nodeRouteIndex: readonly number[],

  nodeParamCount: readonly number[],

  edgeSegments: readonly string[],

  paramNames: readonly string[],

  routes: readonly RuntimeRouteRecord[],
): MethodRoutes {
  const [
    ,
    staticPaths,
    staticRouteIndexes,
    trailingPrefixes,
    trailingRouteIndexes,
    trailingParamNames,
    nodeStart,
    nodeCount,
    edgeStart,
    edgeCount,
    paramStart,
    paramEntryCount,
    usesDynamicTrie,
  ] = method;

  if (staticPaths.length !== staticRouteIndexes.length) {
    throw new Error(
      "Gelis preorder candidate static route column length mismatch",
    );
  }

  const staticRoutes = new Map<string, RuntimeRouteRecord>();

  for (let index = 0; index < staticPaths.length; index++) {
    const path = staticPaths[index];

    const routeIndex = staticRouteIndexes[index];

    if (path === undefined || routeIndex === undefined) {
      throw new Error(
        `Missing Gelis preorder candidate static route: ${index}`,
      );
    }

    staticRoutes.set(
      path,

      routeAt(
        routes,

        routeIndex,
      ),
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
      `Invalid Gelis preorder candidate trie flag: ${usesDynamicTrie}`,
    );
  }

  let dynamicRoot: DynamicNode;

  if (usesDynamicTrie === 1) {
    const cursor: Cursor = {
      node: nodeStart,

      edge: edgeStart,

      param: paramStart,
    };

    dynamicRoot = hydrateNode(
      cursor,

      nodeStart + nodeCount,

      edgeStart + edgeCount,

      paramStart + paramEntryCount,

      nodeStaticCount,

      nodeHasParamChild,

      nodeRouteIndex,

      nodeParamCount,

      edgeSegments,

      paramNames,

      routes,
    );

    if (
      cursor.node !== nodeStart + nodeCount ||
      cursor.edge !== edgeStart + edgeCount ||
      cursor.param !== paramStart + paramEntryCount
    ) {
      throw new Error("Gelis preorder candidate topology consumption mismatch");
    }
  } else {
    if (nodeCount !== 0 || edgeCount !== 0 || paramEntryCount !== 0) {
      throw new Error("Unexpected Gelis preorder candidate dynamic topology");
    }

    dynamicRoot = {
      staticChildren: undefined,

      paramChild: undefined,

      route: undefined,
    };
  }

  return {
    staticRoutes,

    trailingParamRoutes,

    dynamicRoot,

    usesDynamicTrie: usesDynamicTrie === 1,
  };
}

function hydrateNode(
  cursor: Cursor,

  nodeEnd: number,

  edgeEnd: number,

  paramEnd: number,

  nodeStaticCount: readonly number[],

  nodeHasParamChild: readonly number[],

  nodeRouteIndex: readonly number[],

  nodeParamCount: readonly number[],

  edgeSegments: readonly string[],

  paramNames: readonly string[],

  routes: readonly RuntimeRouteRecord[],
): DynamicNode {
  if (cursor.node >= nodeEnd) {
    throw new Error("Unexpected end of Gelis preorder candidate node stream");
  }

  const nodeIndex = cursor.node++;

  const staticCount = nodeStaticCount[nodeIndex];

  const hasParamChild = nodeHasParamChild[nodeIndex];

  const routeIndex = nodeRouteIndex[nodeIndex];

  const routeParamCount = nodeParamCount[nodeIndex];

  if (
    staticCount === undefined ||
    hasParamChild === undefined ||
    routeIndex === undefined ||
    routeParamCount === undefined
  ) {
    throw new Error(`Missing Gelis preorder candidate node: ${nodeIndex}`);
  }

  if (
    !Number.isInteger(staticCount) ||
    staticCount < 0 ||
    (hasParamChild !== 0 && hasParamChild !== 1) ||
    !Number.isInteger(routeIndex) ||
    !Number.isInteger(routeParamCount) ||
    routeParamCount < 0
  ) {
    throw new Error(`Invalid Gelis preorder candidate node: ${nodeIndex}`);
  }

  let route: DynamicNode["route"];

  if (routeIndex !== -1) {
    if (cursor.param + routeParamCount > paramEnd) {
      throw new Error("Invalid Gelis preorder candidate parameter stream");
    }

    route = {
      route: routeAt(
        routes,

        routeIndex,
      ),

      paramNames: paramNames.slice(
        cursor.param,

        cursor.param + routeParamCount,
      ),
    };

    cursor.param += routeParamCount;
  } else if (routeParamCount !== 0) {
    throw new Error(
      `Unexpected Gelis preorder candidate parameters: ${nodeIndex}`,
    );
  }

  let staticChildren: Map<string, DynamicNode> | undefined;

  if (staticCount !== 0) {
    if (cursor.edge + staticCount > edgeEnd) {
      throw new Error("Invalid Gelis preorder candidate edge stream");
    }

    const segments = edgeSegments.slice(
      cursor.edge,

      cursor.edge + staticCount,
    );

    cursor.edge += staticCount;

    staticChildren = new Map();

    for (let index = 0; index < staticCount; index++) {
      const segment = segments[index];

      if (segment === undefined) {
        throw new Error("Missing Gelis preorder candidate edge segment");
      }

      staticChildren.set(
        segment,

        hydrateNode(
          cursor,

          nodeEnd,

          edgeEnd,

          paramEnd,

          nodeStaticCount,

          nodeHasParamChild,

          nodeRouteIndex,

          nodeParamCount,

          edgeSegments,

          paramNames,

          routes,
        ),
      );
    }
  }

  const paramChild =
    hasParamChild === 1
      ? hydrateNode(
          cursor,

          nodeEnd,

          edgeEnd,

          paramEnd,

          nodeStaticCount,

          nodeHasParamChild,

          nodeRouteIndex,

          nodeParamCount,

          edgeSegments,

          paramNames,

          routes,
        )
      : undefined;

  return {
    staticChildren,

    paramChild,

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
      throw new Error(
        "Gelis preorder candidate trailing route column mismatch",
      );
    }

    return undefined;
  }

  if (
    routeIndexes === 0 ||
    paramNames === 0 ||
    prefixes.length !== routeIndexes.length ||
    prefixes.length !== paramNames.length
  ) {
    throw new Error("Gelis preorder candidate trailing route column mismatch");
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
        `Missing Gelis preorder candidate trailing route: ${index}`,
      );
    }

    result.set(
      prefix,

      {
        route: routeAt(
          routes,

          routeIndex,
        ),

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
    throw new Error(`Invalid Gelis preorder candidate route index: ${index}`);
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
      throw new Error(
        `Invalid Gelis preorder candidate HTTP method: ${method}`,
      );
  }
}
