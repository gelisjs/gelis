import { GELIS_INTERNAL_RUNTIME, type Gelis } from "../app";

import { ALL_ROUTE_METHOD, assertRouteMethod } from "../http-method";

import { PREORDER_AOT_ARTIFACT_VERSION } from "./preorder-aot-artifact";

import type {
  PreorderAotArtifact,
  PreorderAotMethod,
  PreorderAotRouter,
} from "./preorder-aot-artifact";

import { Router } from "./router";

import { activateAllFallback } from "./router-all";

import type { DynamicNode, MethodRoutes, TrailingParamRoute } from "./router";

import { RUNTIME_ROUTE_PLAIN } from "./types";

import type { RuntimeRouteHandler, RuntimeRouteRecord } from "./types";

export interface PreorderAotRuntimeBinding {
  readonly version: typeof PREORDER_AOT_ARTIFACT_VERSION;

  readonly shapeFingerprint: string;

  readonly handlers: readonly RuntimeRouteHandler[];
}

/*
 * Install a preorder, precomputed plain-route artifact
 * directly into Gelis runtime state.
 *
 * The dynamic trie is reconstructed from forward-only
 * streams without child indexes or a second wiring pass.
 */
export function installPreorderAotRuntime(
  app: Gelis,

  artifact: PreorderAotArtifact,

  binding: PreorderAotRuntimeBinding,
): void {
  const [
    version,
    routeCount,
    shapeFingerprint,
    methodNames,
    routeMethodIds,
    routePaths,
    preorderRouter,
  ] = artifact;

  if (version !== PREORDER_AOT_ARTIFACT_VERSION) {
    throw new Error("Unsupported Gelis preorder AOT artifact version");
  }

  if (binding.version !== PREORDER_AOT_ARTIFACT_VERSION) {
    throw new Error("Unsupported Gelis preorder AOT runtime binding version");
  }

  if (shapeFingerprint !== binding.shapeFingerprint) {
    throw new Error("Gelis preorder AOT artifact fingerprint mismatch");
  }

  if (
    routeCount !== routeMethodIds.length ||
    routeCount !== routePaths.length ||
    routeCount !== binding.handlers.length
  ) {
    throw new Error("Gelis preorder AOT artifact route count mismatch");
  }

  const routes = bindPreorderRoutes(
    routeCount,
    methodNames,
    routeMethodIds,
    routePaths,
    binding.handlers,
  );

  const router = hydratePreorderRouter(methodNames, preorderRouter, routes);

  app[GELIS_INTERNAL_RUNTIME]().installPrebuiltRuntime(router, routes);
}

export function bindPreorderRoutes(
  routeCount: number,

  methodNames: readonly string[],

  routeMethodIds: readonly number[],

  routePaths: readonly string[],

  handlers: readonly RuntimeRouteHandler[],
): RuntimeRouteRecord[] {
  const routes = new Array<RuntimeRouteRecord>(routeCount);

  for (let index = 0; index < routeCount; index++) {
    const methodId = routeMethodIds[index];

    const path = routePaths[index];

    const handler = handlers[index];

    if (methodId === undefined || path === undefined || handler === undefined) {
      throw new Error(`Missing Gelis preorder AOT route binding: ${index}`);
    }

    const methodName = methodNames[methodId];

    if (methodName === undefined) {
      throw new Error(`Invalid Gelis preorder AOT method id: ${methodId}`);
    }

    assertRouteMethod(methodName);

    routes[index] = {
      method: methodName,

      path,

      handler,

      flags: RUNTIME_ROUTE_PLAIN,

      input: undefined,

      beforeHandle: undefined,

      afterHandle: undefined,

      responses: undefined,
    };
  }

  return routes;
}

export function hydratePreorderRouter(
  methodNames: readonly string[],

  preorder: PreorderAotRouter,

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

  const nodeCount = nodeStaticCount.length;

  if (
    nodeHasParamChild.length !== nodeCount ||
    nodeRouteIndex.length !== nodeCount ||
    nodeParamCount.length !== nodeCount
  ) {
    throw new Error("Gelis preorder AOT node column length mismatch");
  }

  const runtimeMethods = new Map<string, MethodRoutes>();

  for (let index = 0; index < methods.length; index++) {
    const method = methods[index];

    if (method === undefined) {
      throw new Error(`Missing Gelis preorder AOT method: ${index}`);
    }

    const [methodId] = method;

    const methodName = methodNames[methodId];

    if (methodName === undefined) {
      throw new Error(`Invalid Gelis preorder AOT method id: ${methodId}`);
    }

    assertRouteMethod(methodName);

    if (runtimeMethods.has(methodName)) {
      throw new Error(`Duplicate Gelis preorder AOT method: ${methodName}`);
    }

    runtimeMethods.set(
      methodName,

      hydratePreorderMethod(
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

  const router = Router.fromMethods(runtimeMethods);

  if (runtimeMethods.has(ALL_ROUTE_METHOD)) {
    activateAllFallback(router);
  }

  return router;
}

interface PreorderCursor {
  node: number;

  edge: number;

  param: number;
}

function hydratePreorderMethod(
  method: PreorderAotMethod,

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
    throw new Error("Gelis preorder AOT static route column length mismatch");
  }

  const staticRoutes = new Map<string, RuntimeRouteRecord>();

  for (let index = 0; index < staticPaths.length; index++) {
    const path = staticPaths[index];

    const routeIndex = staticRouteIndexes[index];

    if (path === undefined || routeIndex === undefined) {
      throw new Error(`Missing Gelis preorder AOT static route: ${index}`);
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
    throw new Error(`Invalid Gelis preorder AOT trie flag: ${usesDynamicTrie}`);
  }

  validateStreamRange("node", nodeStart, nodeCount, nodeStaticCount.length);

  validateStreamRange("edge", edgeStart, edgeCount, edgeSegments.length);

  validateStreamRange(
    "parameter",
    paramStart,
    paramEntryCount,
    paramNames.length,
  );

  let dynamicRoot: DynamicNode;

  if (usesDynamicTrie === 1) {
    if (nodeCount === 0) {
      throw new Error("Missing Gelis preorder AOT dynamic root");
    }

    const cursor: PreorderCursor = {
      node: nodeStart,

      edge: edgeStart,

      param: paramStart,
    };

    const nodeEnd = nodeStart + nodeCount;

    const edgeEnd = edgeStart + edgeCount;

    const paramEnd = paramStart + paramEntryCount;

    dynamicRoot = hydratePreorderNode(
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
    );

    if (
      cursor.node !== nodeEnd ||
      cursor.edge !== edgeEnd ||
      cursor.param !== paramEnd
    ) {
      throw new Error("Gelis preorder AOT topology consumption mismatch");
    }
  } else {
    if (nodeCount !== 0 || edgeCount !== 0 || paramEntryCount !== 0) {
      throw new Error("Unexpected Gelis preorder AOT dynamic topology");
    }

    /*
     * Each method receives its own empty root.
     *
     * The router may later be mutated by normal route
     * registration, so this object must not be shared
     * between methods.
     */
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

function hydratePreorderNode(
  cursor: PreorderCursor,

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
    throw new Error("Unexpected end of Gelis preorder AOT node stream");
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
    throw new Error(`Missing Gelis preorder AOT node: ${nodeIndex}`);
  }

  if (
    !Number.isInteger(staticCount) ||
    staticCount < 0 ||
    (hasParamChild !== 0 && hasParamChild !== 1) ||
    !Number.isInteger(routeIndex) ||
    !Number.isInteger(routeParamCount) ||
    routeParamCount < 0
  ) {
    throw new Error(`Invalid Gelis preorder AOT node: ${nodeIndex}`);
  }

  let route: DynamicNode["route"];

  if (routeIndex !== -1) {
    if (cursor.param + routeParamCount > paramEnd) {
      throw new Error("Invalid Gelis preorder AOT parameter stream");
    }

    route = {
      route: routeAt(routes, routeIndex),

      paramNames: paramNames.slice(
        cursor.param,

        cursor.param + routeParamCount,
      ),
    };

    cursor.param += routeParamCount;
  } else if (routeParamCount !== 0) {
    throw new Error(`Unexpected Gelis preorder AOT parameters: ${nodeIndex}`);
  }

  let staticChildren: Map<string, DynamicNode> | undefined;

  if (staticCount !== 0) {
    if (cursor.edge + staticCount > edgeEnd) {
      throw new Error("Invalid Gelis preorder AOT edge stream");
    }

    /*
     * Keep the D.4D candidate behavior unchanged.
     *
     * Do not optimize this slice until the production
     * implementation has passed its correctness and
     * performance gates.
     */
    const segments = edgeSegments.slice(
      cursor.edge,

      cursor.edge + staticCount,
    );

    cursor.edge += staticCount;

    staticChildren = new Map();

    for (let index = 0; index < staticCount; index++) {
      const segment = segments[index];

      if (segment === undefined) {
        throw new Error("Missing Gelis preorder AOT edge segment");
      }

      staticChildren.set(
        segment,

        hydratePreorderNode(
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
      ? hydratePreorderNode(
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

function validateStreamRange(
  name: string,

  start: number,

  count: number,

  length: number,
): void {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(count) ||
    start < 0 ||
    count < 0 ||
    start + count > length
  ) {
    throw new Error(`Invalid Gelis preorder AOT ${name} range`);
  }
}

function hydrateTrailingRoutes(
  prefixes: 0 | readonly string[],

  routeIndexes: 0 | readonly number[],

  paramNames: 0 | readonly string[],

  routes: readonly RuntimeRouteRecord[],
): Map<string, TrailingParamRoute> | undefined {
  if (prefixes === 0) {
    if (routeIndexes !== 0 || paramNames !== 0) {
      throw new Error("Gelis preorder AOT trailing route column mismatch");
    }

    return undefined;
  }

  if (
    routeIndexes === 0 ||
    paramNames === 0 ||
    prefixes.length !== routeIndexes.length ||
    prefixes.length !== paramNames.length
  ) {
    throw new Error("Gelis preorder AOT trailing route column mismatch");
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
      throw new Error(`Missing Gelis preorder AOT trailing route: ${index}`);
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
  if (!Number.isInteger(index) || index < 0 || index >= routes.length) {
    throw new Error(`Invalid Gelis preorder AOT route index: ${index}`);
  }

  const route = routes[index];

  if (route === undefined) {
    throw new Error(`Missing Gelis preorder AOT route: ${index}`);
  }

  return route;
}
