import { GELIS_INTERNAL_RUNTIME, type Gelis } from "../app";

import type { HttpMethod } from "../route";

import { FLAT_AOT_ARTIFACT_VERSION } from "./flat-aot-artifact";

import type {
  FlatAotArtifact,
  FlatAotMethod,
  FlatAotRouter,
} from "./flat-aot-artifact";

import { Router } from "./router";

import type { DynamicNode, MethodRoutes, TrailingParamRoute } from "./router";

import { RUNTIME_ROUTE_PLAIN } from "./types";

import type { RuntimeRouteHandler, RuntimeRouteRecord } from "./types";

export interface FlatAotRuntimeBinding {
  readonly version: typeof FLAT_AOT_ARTIFACT_VERSION;

  readonly shapeFingerprint: string;

  readonly handlers: readonly RuntimeRouteHandler[];
}

/*
 * Install a flat, precomputed plain-route artifact
 * directly into Gelis runtime state.
 *
 * The flat representation is consumed without
 * reconstructing SemanticRoutePlan or RouterSnapshot.
 */
export function installFlatAotRuntime(
  app: Gelis,

  artifact: FlatAotArtifact,

  binding: FlatAotRuntimeBinding,
): void {
  const [
    version,
    routeCount,
    shapeFingerprint,
    methodNames,
    routeMethodIds,
    routePaths,
    flatRouter,
  ] = artifact;

  if (version !== FLAT_AOT_ARTIFACT_VERSION) {
    throw new Error("Unsupported Gelis flat AOT artifact version");
  }

  if (binding.version !== FLAT_AOT_ARTIFACT_VERSION) {
    throw new Error("Unsupported Gelis flat AOT runtime binding version");
  }

  if (shapeFingerprint !== binding.shapeFingerprint) {
    throw new Error("Gelis flat AOT artifact fingerprint mismatch");
  }

  if (
    routeCount !== routeMethodIds.length ||
    routeCount !== routePaths.length ||
    routeCount !== binding.handlers.length
  ) {
    throw new Error("Gelis flat AOT artifact route count mismatch");
  }

  const routes = bindFlatRoutes(
    routeCount,

    methodNames,

    routeMethodIds,

    routePaths,

    binding.handlers,
  );

  const router = hydrateFlatRouter(
    methodNames,

    flatRouter,

    routes,
  );

  const control = app[GELIS_INTERNAL_RUNTIME]();

  control.installPrebuiltRuntime(
    router,

    routes,
  );
}

export function bindFlatRoutes(
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
      throw new Error(`Missing Gelis flat AOT route binding: ${index}`);
    }

    const methodName = methodNames[methodId];

    if (methodName === undefined) {
      throw new Error(`Invalid Gelis flat AOT method id: ${methodId}`);
    }

    const method = asHttpMethod(methodName);

    routes[index] = {
      method,

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

export function hydrateFlatRouter(
  methodNames: readonly string[],

  flat: FlatAotRouter,

  routes: readonly RuntimeRouteRecord[],
): Router {
  const [
    methods,
    nodeStaticStart,
    nodeStaticCount,
    nodeParamChild,
    nodeRouteIndex,
    nodeParamStart,
    nodeParamCount,
    edgeSegments,
    edgeChildren,
    paramNames,
  ] = flat;

  const nodeCount = nodeStaticStart.length;

  if (
    nodeStaticCount.length !== nodeCount ||
    nodeParamChild.length !== nodeCount ||
    nodeRouteIndex.length !== nodeCount ||
    nodeParamStart.length !== nodeCount ||
    nodeParamCount.length !== nodeCount
  ) {
    throw new Error("Gelis flat AOT node column length mismatch");
  }

  if (edgeSegments.length !== edgeChildren.length) {
    throw new Error("Gelis flat AOT edge column length mismatch");
  }

  /*
   * Reconstruct every dynamic node exactly once.
   *
   * The flat artifact already contains stable node indexes,
   * so runtime hydration does not need recursive traversal.
   */
  const nodes = hydrateFlatNodes(
    nodeStaticStart,
    nodeStaticCount,
    nodeParamChild,
    nodeRouteIndex,
    nodeParamStart,
    nodeParamCount,
    edgeSegments,
    edgeChildren,
    paramNames,
    routes,
  );

  const runtimeMethods = new Map<string, MethodRoutes>();

  for (let index = 0; index < methods.length; index++) {
    const method = methods[index];

    if (method === undefined) {
      throw new Error(`Missing Gelis flat AOT method: ${index}`);
    }

    const [methodId] = method;

    const methodName = methodNames[methodId];

    if (methodName === undefined) {
      throw new Error(`Invalid Gelis flat AOT method id: ${methodId}`);
    }

    asHttpMethod(methodName);

    if (runtimeMethods.has(methodName)) {
      throw new Error(`Duplicate Gelis flat AOT method: ${methodName}`);
    }

    runtimeMethods.set(
      methodName,

      hydrateFlatMethod(method, nodes, routes),
    );
  }

  return Router.fromMethods(runtimeMethods);
}

function hydrateFlatMethod(
  flatMethod: FlatAotMethod,

  nodes: readonly DynamicNode[],

  routes: readonly RuntimeRouteRecord[],
): MethodRoutes {
  const [
    ,
    staticPaths,
    staticRouteIndexes,
    trailingPrefixes,
    trailingRouteIndexes,
    trailingParamNames,
    rootNode,
    usesDynamicTrie,
  ] = flatMethod;

  if (staticPaths.length !== staticRouteIndexes.length) {
    throw new Error("Gelis flat AOT static route column length mismatch");
  }

  const staticRoutes = new Map<string, RuntimeRouteRecord>();

  for (let index = 0; index < staticPaths.length; index++) {
    const path = staticPaths[index];

    const routeIndex = staticRouteIndexes[index];

    if (path === undefined || routeIndex === undefined) {
      throw new Error(`Missing Gelis flat AOT static route: ${index}`);
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
    throw new Error(`Invalid Gelis flat AOT trie flag: ${usesDynamicTrie}`);
  }

  return {
    staticRoutes,

    trailingParamRoutes,

    dynamicRoot: nodeAt(nodes, rootNode),

    usesDynamicTrie: usesDynamicTrie === 1,
  };
}

function hydrateFlatNodes(
  nodeStaticStart: readonly number[],

  nodeStaticCount: readonly number[],

  nodeParamChild: readonly number[],

  nodeRouteIndex: readonly number[],

  nodeParamStart: readonly number[],

  nodeParamCount: readonly number[],

  edgeSegments: readonly string[],

  edgeChildren: readonly number[],

  paramNames: readonly string[],

  routes: readonly RuntimeRouteRecord[],
): DynamicNode[] {
  const nodeCount = nodeStaticStart.length;

  const nodes = new Array<DynamicNode>(nodeCount);

  /*
   * Pass one creates stable node objects and terminal
   * route bindings without following any graph edges.
   */
  for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
    const routeIndex = nodeRouteIndex[nodeIndex];

    const paramStart = nodeParamStart[nodeIndex];

    const paramCount = nodeParamCount[nodeIndex];

    if (
      routeIndex === undefined ||
      paramStart === undefined ||
      paramCount === undefined
    ) {
      throw new Error(`Missing Gelis flat AOT node data: ${nodeIndex}`);
    }

    let route: DynamicNode["route"];

    if (routeIndex !== -1) {
      if (
        !Number.isInteger(paramStart) ||
        !Number.isInteger(paramCount) ||
        paramStart < 0 ||
        paramCount < 0 ||
        paramStart + paramCount > paramNames.length
      ) {
        throw new Error(`Invalid Gelis flat AOT parameter range: ${nodeIndex}`);
      }

      route = {
        route: routeAt(routes, routeIndex),

        paramNames: paramNames.slice(paramStart, paramStart + paramCount),
      };
    }

    nodes[nodeIndex] = {
      staticChildren: undefined,

      paramChild: undefined,

      route,
    };
  }

  /*
   * Pass two wires graph references by index.
   *
   * All target nodes already exist, so no recursive
   * reconstruction or repeated subtree traversal occurs.
   */
  for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
    const node = nodes[nodeIndex];

    const staticStart = nodeStaticStart[nodeIndex];

    const staticCount = nodeStaticCount[nodeIndex];

    const paramChildIndex = nodeParamChild[nodeIndex];

    if (
      node === undefined ||
      staticStart === undefined ||
      staticCount === undefined ||
      paramChildIndex === undefined
    ) {
      throw new Error(`Missing Gelis flat AOT node data: ${nodeIndex}`);
    }

    if (
      !Number.isInteger(staticStart) ||
      !Number.isInteger(staticCount) ||
      staticStart < 0 ||
      staticCount < 0 ||
      staticStart + staticCount > edgeSegments.length
    ) {
      throw new Error(`Invalid Gelis flat AOT edge range: ${nodeIndex}`);
    }

    if (staticCount !== 0) {
      const staticChildren = new Map<string, DynamicNode>();

      const end = staticStart + staticCount;

      for (let edgeIndex = staticStart; edgeIndex < end; edgeIndex++) {
        const segment = edgeSegments[edgeIndex];

        const childIndex = edgeChildren[edgeIndex];

        if (segment === undefined || childIndex === undefined) {
          throw new Error(`Missing Gelis flat AOT edge: ${edgeIndex}`);
        }

        staticChildren.set(
          segment,

          nodeAt(nodes, childIndex),
        );
      }

      node.staticChildren = staticChildren;
    }

    if (paramChildIndex !== -1) {
      node.paramChild = nodeAt(nodes, paramChildIndex);
    }
  }

  return nodes;
}

function nodeAt(
  nodes: readonly DynamicNode[],

  index: number,
): DynamicNode {
  if (!Number.isInteger(index) || index < 0 || index >= nodes.length) {
    throw new Error(`Invalid Gelis flat AOT node index: ${index}`);
  }

  const node = nodes[index];

  if (node === undefined) {
    throw new Error(`Missing Gelis flat AOT node: ${index}`);
  }

  return node;
}

function hydrateTrailingRoutes(
  prefixes: 0 | readonly string[],

  routeIndexes: 0 | readonly number[],

  paramNames: 0 | readonly string[],

  routes: readonly RuntimeRouteRecord[],
): Map<string, TrailingParamRoute> | undefined {
  if (prefixes === 0) {
    if (routeIndexes !== 0 || paramNames !== 0) {
      throw new Error("Gelis flat AOT trailing route column mismatch");
    }

    return undefined;
  }

  if (
    routeIndexes === 0 ||
    paramNames === 0 ||
    prefixes.length !== routeIndexes.length ||
    prefixes.length !== paramNames.length
  ) {
    throw new Error("Gelis flat AOT trailing route column mismatch");
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
      throw new Error(`Missing Gelis flat AOT trailing route: ${index}`);
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

function hydrateFlatNode(
  nodeIndex: number,

  flat: FlatAotRouter,

  routes: readonly RuntimeRouteRecord[],
): DynamicNode {
  const [
    ,
    nodeStaticStart,
    nodeStaticCount,
    nodeParamChild,
    nodeRouteIndex,
    nodeParamStart,
    nodeParamCount,
    edgeSegments,
    edgeChildren,
    paramNames,
  ] = flat;

  if (
    !Number.isInteger(nodeIndex) ||
    nodeIndex < 0 ||
    nodeIndex >= nodeStaticStart.length
  ) {
    throw new Error(`Invalid Gelis flat AOT node index: ${nodeIndex}`);
  }

  const staticStart = nodeStaticStart[nodeIndex];

  const staticCount = nodeStaticCount[nodeIndex];

  const paramChildIndex = nodeParamChild[nodeIndex];

  const routeIndex = nodeRouteIndex[nodeIndex];

  const paramStart = nodeParamStart[nodeIndex];

  const paramCount = nodeParamCount[nodeIndex];

  if (
    staticStart === undefined ||
    staticCount === undefined ||
    paramChildIndex === undefined ||
    routeIndex === undefined ||
    paramStart === undefined ||
    paramCount === undefined
  ) {
    throw new Error(`Missing Gelis flat AOT node data: ${nodeIndex}`);
  }

  if (
    staticStart < 0 ||
    staticCount < 0 ||
    staticStart + staticCount > edgeSegments.length
  ) {
    throw new Error(`Invalid Gelis flat AOT edge range: ${nodeIndex}`);
  }

  let staticChildren: Map<string, DynamicNode> | undefined;

  if (staticCount !== 0) {
    staticChildren = new Map();

    const end = staticStart + staticCount;

    for (let edgeIndex = staticStart; edgeIndex < end; edgeIndex++) {
      const segment = edgeSegments[edgeIndex];

      const childIndex = edgeChildren[edgeIndex];

      if (segment === undefined || childIndex === undefined) {
        throw new Error(`Missing Gelis flat AOT edge: ${edgeIndex}`);
      }

      staticChildren.set(
        segment,

        hydrateFlatNode(
          childIndex,

          flat,

          routes,
        ),
      );
    }
  }

  let route: DynamicNode["route"];

  if (routeIndex !== -1) {
    if (
      paramStart < 0 ||
      paramCount < 0 ||
      paramStart + paramCount > paramNames.length
    ) {
      throw new Error(`Invalid Gelis flat AOT parameter range: ${nodeIndex}`);
    }

    route = {
      route: routeAt(
        routes,

        routeIndex,
      ),

      paramNames: paramNames.slice(
        paramStart,

        paramStart + paramCount,
      ),
    };
  }

  return {
    staticChildren,

    paramChild:
      paramChildIndex === -1
        ? undefined
        : hydrateFlatNode(
            paramChildIndex,

            flat,

            routes,
          ),

    route,
  };
}

function routeAt(
  routes: readonly RuntimeRouteRecord[],

  index: number,
): RuntimeRouteRecord {
  if (!Number.isInteger(index) || index < 0 || index >= routes.length) {
    throw new Error(`Invalid Gelis flat AOT route index: ${index}`);
  }

  const route = routes[index];

  if (route === undefined) {
    throw new Error(`Missing Gelis flat AOT route: ${index}`);
  }

  return route;
}

function asHttpMethod(value: string): HttpMethod {
  switch (value) {
    case "GET":
    case "POST":
    case "PUT":
    case "PATCH":
    case "DELETE":
    case "OPTIONS":
    case "HEAD":
      return value;

    default:
      throw new Error(`Unsupported Gelis flat AOT HTTP method: ${value}`);
  }
}
