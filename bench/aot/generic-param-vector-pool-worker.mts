import type { HttpMethod } from "../../src/route.ts";

import type {
  FlatAotMethod,
  FlatAotRouter,
} from "../../src/runtime/flat-aot-artifact.ts";

import { hydrateFlatRouter } from "../../src/runtime/flat-aot-runtime.ts";

import { Router } from "../../src/runtime/router.ts";

import type {
  DynamicNode,
  MethodRoutes,
  TrailingParamRoute,
} from "../../src/runtime/router.ts";

import { hydrateRouterSnapshot } from "../../src/runtime/router-snapshot.ts";

import {
  bindSemanticRoutePlan,
  SEMANTIC_ROUTE_PLAN_VERSION,
} from "../../src/runtime/semantic-route-plan.ts";

import type {
  RuntimeRouteHandler,
  RuntimeRouteRecord,
} from "../../src/runtime/types.ts";

import { compileFlatAotArtifact } from "../../src/tooling/flat-aot-artifact-compiler.ts";

import { compileSemanticRoutePlan } from "../../src/tooling/semantic-route-plan-compiler.ts";

const ROUTES = 5000;

const scenario = process.env.SCENARIO;
const poolKind = process.env.POOL_KIND;

if (
  scenario !== "semantic" &&
  scenario !== "current-flat" &&
  scenario !== "prepooled-flat"
) {
  throw new Error(`Invalid SCENARIO: ${scenario}`);
}

if (poolKind !== "shared" && poolKind !== "unique") {
  throw new Error(`Invalid POOL_KIND: ${poolKind}`);
}

type Scenario = typeof scenario;
type PoolKind = typeof poolKind;

const RESPONSE = new Response(null, {
  status: 204,
});

const HANDLER: RuntimeRouteHandler = () => RESPONSE;

const routeShapes = new Array<{
  method: "GET";
  path: string;
}>(ROUTES);

for (let index = 0; index < ROUTES; index++) {
  routeShapes[index] = {
    method: "GET",

    path:
      poolKind === "shared"
        ? `/r/${index}/:id/detail`
        : `/r/${index}/:p${index}/detail`,
  };
}

/*
 * Everything in this section represents build-time,
 * generated artifact, or runtime binding state.
 *
 * It is intentionally prepared outside the hydration timer.
 */
const plan = await compileSemanticRoutePlan(routeShapes);

const artifact = compileFlatAotArtifact(plan);

const handlers = new Array<RuntimeRouteHandler>(ROUTES);

handlers.fill(HANDLER);

const routes = bindSemanticRoutePlan(
  plan,

  {
    version: SEMANTIC_ROUTE_PLAN_VERSION,

    shapeFingerprint: plan.shapeFingerprint,

    handlers,
  },
);

const [, , , methodNames, , , flatRouter] = artifact;

const prepooled = compileParamVectorPool(flatRouter);

const started = performance.now();

let router: Router;

switch (scenario) {
  case "semantic":
    router = hydrateRouterSnapshot(
      plan.router,

      routes,
    );

    break;

  case "current-flat":
    router = hydrateFlatRouter(
      methodNames,

      flatRouter,

      routes,
    );

    break;

  case "prepooled-flat":
    router = hydratePrepooledFlatRouter(
      methodNames,

      flatRouter,

      routes,

      prepooled,
    );

    break;
}

const hydrateMs = performance.now() - started;

/*
 * Sanity checking is outside the hydration timer.
 */
const target = `/r/${ROUTES - 1}/target/detail`;

const expectedParamName = poolKind === "shared" ? "id" : `p${ROUTES - 1}`;

const match = router.match(
  "GET",

  target,
);

if (match === undefined) {
  throw new Error("Param vector pool router failed to match target");
}

if (match.route !== routes[ROUTES - 1]) {
  throw new Error("Param vector pool router matched incorrect route");
}

if (match.params[expectedParamName] !== "target") {
  throw new Error("Param vector pool router produced incorrect params");
}

console.log(
  JSON.stringify({
    scenario,

    poolKind,

    hydrateMs,

    vectorCount: prepooled.paramVectors.length,

    originalParamEntries: prepooled.originalParamEntries,

    pooledParamEntries: prepooled.pooledParamEntries,
  }),
);

interface PrepooledParamState {
  readonly paramVectors: readonly (readonly string[])[];

  readonly nodeVectorIds: readonly number[];

  readonly originalParamEntries: number;

  readonly pooledParamEntries: number;
}

function compileParamVectorPool(flat: FlatAotRouter): PrepooledParamState {
  const [
    ,
    ,
    ,
    ,
    nodeRouteIndex,
    nodeParamStart,
    nodeParamCount,
    ,
    ,
    paramNames,
  ] = flat;

  const nodeVectorIds = new Array<number>(nodeRouteIndex.length);

  nodeVectorIds.fill(-1);

  const paramVectors: (readonly string[])[] = [];

  const vectorIds = new Map<string, number>();

  let originalParamEntries = 0;

  for (let nodeIndex = 0; nodeIndex < nodeRouteIndex.length; nodeIndex++) {
    const routeIndex = nodeRouteIndex[nodeIndex];

    if (routeIndex === undefined || routeIndex === -1) {
      continue;
    }

    const paramStart = nodeParamStart[nodeIndex];

    const paramCount = nodeParamCount[nodeIndex];

    if (paramStart === undefined || paramCount === undefined) {
      throw new Error(`Missing build-time parameter range: ${nodeIndex}`);
    }

    const vector = paramNames.slice(
      paramStart,

      paramStart + paramCount,
    );

    originalParamEntries += vector.length;

    const key = paramVectorKey(vector);

    let vectorId = vectorIds.get(key);

    if (vectorId === undefined) {
      vectorId = paramVectors.length;

      vectorIds.set(
        key,

        vectorId,
      );

      paramVectors.push(vector);
    }

    nodeVectorIds[nodeIndex] = vectorId;
  }

  let pooledParamEntries = 0;

  for (const vector of paramVectors) {
    pooledParamEntries += vector.length;
  }

  return {
    paramVectors,

    nodeVectorIds,

    originalParamEntries,

    pooledParamEntries,
  };
}

function paramVectorKey(names: readonly string[]): string {
  let result = `${names.length}|`;

  for (const name of names) {
    result += `${name.length}:${name}`;
  }

  return result;
}

function hydratePrepooledFlatRouter(
  methodNames: readonly string[],

  flat: FlatAotRouter,

  routes: readonly RuntimeRouteRecord[],

  prepooled: PrepooledParamState,
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
    throw new Error("Gelis prepooled lower-bound node column length mismatch");
  }

  if (edgeSegments.length !== edgeChildren.length) {
    throw new Error("Gelis prepooled lower-bound edge column length mismatch");
  }

  if (prepooled.nodeVectorIds.length !== nodeCount) {
    throw new Error(
      "Gelis prepooled lower-bound vector column length mismatch",
    );
  }

  const nodes = hydratePrepooledFlatNodes(
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
    prepooled,
  );

  const runtimeMethods = new Map<string, MethodRoutes>();

  for (let index = 0; index < methods.length; index++) {
    const method = methods[index];

    if (method === undefined) {
      throw new Error(`Missing Gelis prepooled lower-bound method: ${index}`);
    }

    const [methodId] = method;

    const methodName = methodNames[methodId];

    if (methodName === undefined) {
      throw new Error(
        `Invalid Gelis prepooled lower-bound method id: ${methodId}`,
      );
    }

    asHttpMethod(methodName);

    if (runtimeMethods.has(methodName)) {
      throw new Error(
        `Duplicate Gelis prepooled lower-bound method: ${methodName}`,
      );
    }

    runtimeMethods.set(
      methodName,

      hydratePrepooledFlatMethod(method, nodes, routes),
    );
  }

  return Router.fromMethods(runtimeMethods);
}

function hydratePrepooledFlatMethod(
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
    throw new Error(
      "Gelis prepooled lower-bound static route column length mismatch",
    );
  }

  const staticRoutes = new Map<string, RuntimeRouteRecord>();

  for (let index = 0; index < staticPaths.length; index++) {
    const path = staticPaths[index];

    const routeIndex = staticRouteIndexes[index];

    if (path === undefined || routeIndex === undefined) {
      throw new Error(
        `Missing Gelis prepooled lower-bound static route: ${index}`,
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
      `Invalid Gelis prepooled lower-bound trie flag: ${usesDynamicTrie}`,
    );
  }

  return {
    staticRoutes,

    trailingParamRoutes,

    dynamicRoot: nodeAt(
      nodes,

      rootNode,
    ),

    usesDynamicTrie: usesDynamicTrie === 1,
  };
}

function hydratePrepooledFlatNodes(
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

  prepooled: PrepooledParamState,
): DynamicNode[] {
  const nodeCount = nodeStaticStart.length;

  const nodes = new Array<DynamicNode>(nodeCount);

  /*
   * This intentionally keeps the current flat
   * parameter-range validation in place.
   *
   * The only material hydration change is replacing
   * per-route paramNames.slice() with a prebuilt vector.
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
      throw new Error(
        `Missing Gelis prepooled lower-bound node data: ${nodeIndex}`,
      );
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
        throw new Error(
          `Invalid Gelis prepooled lower-bound parameter range: ${nodeIndex}`,
        );
      }

      route = {
        route: routeAt(
          routes,

          routeIndex,
        ),

        paramNames:
          prepooled.paramVectors[prepooled.nodeVectorIds[nodeIndex]!]!,
      };
    }

    nodes[nodeIndex] = {
      staticChildren: undefined,

      paramChild: undefined,

      route,
    };
  }

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
      throw new Error(
        `Missing Gelis prepooled lower-bound node data: ${nodeIndex}`,
      );
    }

    if (
      !Number.isInteger(staticStart) ||
      !Number.isInteger(staticCount) ||
      staticStart < 0 ||
      staticCount < 0 ||
      staticStart + staticCount > edgeSegments.length
    ) {
      throw new Error(
        `Invalid Gelis prepooled lower-bound edge range: ${nodeIndex}`,
      );
    }

    if (staticCount !== 0) {
      const staticChildren = new Map<string, DynamicNode>();

      const end = staticStart + staticCount;

      for (let edgeIndex = staticStart; edgeIndex < end; edgeIndex++) {
        const segment = edgeSegments[edgeIndex];

        const childIndex = edgeChildren[edgeIndex];

        if (segment === undefined || childIndex === undefined) {
          throw new Error(
            `Missing Gelis prepooled lower-bound edge: ${edgeIndex}`,
          );
        }

        staticChildren.set(
          segment,

          nodeAt(
            nodes,

            childIndex,
          ),
        );
      }

      node.staticChildren = staticChildren;
    }

    if (paramChildIndex !== -1) {
      node.paramChild = nodeAt(
        nodes,

        paramChildIndex,
      );
    }
  }

  return nodes;
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
        "Gelis prepooled lower-bound trailing route column mismatch",
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
    throw new Error(
      "Gelis prepooled lower-bound trailing route column mismatch",
    );
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
        `Missing Gelis prepooled lower-bound trailing route: ${index}`,
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

function nodeAt(
  nodes: readonly DynamicNode[],

  index: number,
): DynamicNode {
  if (!Number.isInteger(index) || index < 0 || index >= nodes.length) {
    throw new Error(`Invalid Gelis prepooled lower-bound node index: ${index}`);
  }

  const node = nodes[index];

  if (node === undefined) {
    throw new Error(`Missing Gelis prepooled lower-bound node: ${index}`);
  }

  return node;
}

function routeAt(
  routes: readonly RuntimeRouteRecord[],

  index: number,
): RuntimeRouteRecord {
  const route = routes[index];

  if (route === undefined) {
    throw new Error(
      `Invalid Gelis prepooled lower-bound route index: ${index}`,
    );
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
        `Invalid Gelis prepooled lower-bound HTTP method: ${method}`,
      );
  }
}
