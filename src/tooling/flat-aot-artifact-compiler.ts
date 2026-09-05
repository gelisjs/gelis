import { FLAT_AOT_ARTIFACT_VERSION } from "../runtime/flat-aot-artifact";

import type {
  FlatAotArtifact,
  FlatAotMethod,
  FlatAotRouter,
} from "../runtime/flat-aot-artifact";

import { SEMANTIC_ROUTE_PLAN_VERSION } from "../runtime/semantic-route-plan";

import type { SemanticRoutePlan } from "../runtime/semantic-route-plan";

import type {
  DynamicNodeSnapshot,
  MethodRoutesSnapshot,
} from "../runtime/router-snapshot";

export function compileFlatAotArtifact(
  plan: SemanticRoutePlan,
): FlatAotArtifact {
  validatePlan(plan);

  const methodNames = new Array<string>(plan.router.methods.length);

  const methodIds = new Map<string, number>();

  for (let index = 0; index < plan.router.methods.length; index++) {
    const entry = plan.router.methods[index];

    if (entry === undefined) {
      throw new Error(`Missing Gelis router method snapshot: ${index}`);
    }

    const method = entry[0];

    methodNames[index] = method;

    methodIds.set(method, index);
  }

  const routeMethodIds = new Array<number>(plan.routeCount);

  const routePaths = new Array<string>(plan.routeCount);

  for (let index = 0; index < plan.routeCount; index++) {
    const route = plan.routes[index];

    if (route === undefined) {
      throw new Error(`Missing Gelis semantic route: ${index}`);
    }

    const methodId = methodIds.get(route.method);

    if (methodId === undefined) {
      throw new Error(`Missing Gelis flat AOT method: ${route.method}`);
    }

    routeMethodIds[index] = methodId;

    routePaths[index] = route.path;
  }

  const router = flattenRouter(plan, methodIds);

  return [
    FLAT_AOT_ARTIFACT_VERSION,

    plan.routeCount,

    plan.shapeFingerprint,

    methodNames,

    routeMethodIds,

    routePaths,

    router,
  ];
}

interface MutableFlatRouter {
  readonly methods: FlatAotMethod[];

  readonly nodeStaticStart: number[];

  readonly nodeStaticCount: number[];

  readonly nodeParamChild: number[];

  readonly nodeRouteIndex: number[];

  readonly nodeParamStart: number[];

  readonly nodeParamCount: number[];

  readonly edgeSegments: string[];

  readonly edgeChildren: number[];

  readonly paramNames: string[];
}

function flattenRouter(
  plan: SemanticRoutePlan,

  methodIds: ReadonlyMap<string, number>,
): FlatAotRouter {
  const flat: MutableFlatRouter = {
    methods: [],

    nodeStaticStart: [],

    nodeStaticCount: [],

    nodeParamChild: [],

    nodeRouteIndex: [],

    nodeParamStart: [],

    nodeParamCount: [],

    edgeSegments: [],

    edgeChildren: [],

    paramNames: [],
  };

  for (const [method, snapshot] of plan.router.methods) {
    const methodId = methodIds.get(method);

    if (methodId === undefined) {
      throw new Error(`Missing Gelis flat AOT method id: ${method}`);
    }

    flat.methods.push(
      flattenMethod(
        methodId,

        snapshot,

        flat,
      ),
    );
  }

  return [
    flat.methods,

    flat.nodeStaticStart,

    flat.nodeStaticCount,

    flat.nodeParamChild,

    flat.nodeRouteIndex,

    flat.nodeParamStart,

    flat.nodeParamCount,

    flat.edgeSegments,

    flat.edgeChildren,

    flat.paramNames,
  ];
}

function flattenMethod(
  methodId: number,

  snapshot: MethodRoutesSnapshot,

  flat: MutableFlatRouter,
): FlatAotMethod {
  const staticPaths = new Array<string>(snapshot.staticRoutes.length);

  const staticRouteIndexes = new Array<number>(snapshot.staticRoutes.length);

  for (let index = 0; index < snapshot.staticRoutes.length; index++) {
    const entry = snapshot.staticRoutes[index];

    if (entry === undefined) {
      throw new Error(`Missing Gelis static route snapshot: ${index}`);
    }

    staticPaths[index] = entry[0];

    staticRouteIndexes[index] = entry[1];
  }

  const trailing = snapshot.trailingParamRoutes;

  let trailingPrefixes: 0 | string[] = 0;

  let trailingRouteIndexes: 0 | number[] = 0;

  let trailingParamNames: 0 | string[] = 0;

  if (trailing !== undefined) {
    trailingPrefixes = new Array<string>(trailing.length);

    trailingRouteIndexes = new Array<number>(trailing.length);

    trailingParamNames = new Array<string>(trailing.length);

    for (let index = 0; index < trailing.length; index++) {
      const entry = trailing[index];

      if (entry === undefined) {
        throw new Error(`Missing Gelis trailing route snapshot: ${index}`);
      }

      trailingPrefixes[index] = entry[0];

      trailingRouteIndexes[index] = entry[1].routeIndex;

      trailingParamNames[index] = entry[1].paramName;
    }
  }

  const rootNode = flattenDynamicNode(
    snapshot.dynamicRoot,

    flat,
  );

  return [
    methodId,

    staticPaths,

    staticRouteIndexes,

    trailingPrefixes,

    trailingRouteIndexes,

    trailingParamNames,

    rootNode,

    snapshot.usesDynamicTrie ? 1 : 0,
  ];
}

function flattenDynamicNode(
  snapshot: DynamicNodeSnapshot,

  flat: MutableFlatRouter,
): number {
  const nodeIndex = flat.nodeStaticStart.length;

  /*
   * Reserve the node before recursively flattening
   * its children so every child can safely refer
   * to an already assigned parent-independent index.
   */
  flat.nodeStaticStart.push(0);

  flat.nodeStaticCount.push(0);

  flat.nodeParamChild.push(-1);

  flat.nodeRouteIndex.push(-1);

  flat.nodeParamStart.push(flat.paramNames.length);

  flat.nodeParamCount.push(0);

  const route = snapshot.route;

  if (route !== undefined) {
    flat.nodeRouteIndex[nodeIndex] = route.routeIndex;

    flat.nodeParamStart[nodeIndex] = flat.paramNames.length;

    flat.nodeParamCount[nodeIndex] = route.paramNames.length;

    for (const paramName of route.paramNames) {
      flat.paramNames.push(paramName);
    }
  }

  const children = snapshot.staticChildren;

  if (children !== undefined) {
    const edgeStart = flat.edgeSegments.length;

    flat.nodeStaticStart[nodeIndex] = edgeStart;

    flat.nodeStaticCount[nodeIndex] = children.length;

    /*
     * Reserve contiguous edge slots first.
     *
     * Recursive child flattening may append its own
     * edges, so the parent edge range must already
     * be fixed before recursion starts.
     */
    for (const [segment] of children) {
      flat.edgeSegments.push(segment);

      flat.edgeChildren.push(-1);
    }

    for (let index = 0; index < children.length; index++) {
      const child = children[index];

      if (child === undefined) {
        throw new Error(`Missing Gelis dynamic child snapshot: ${index}`);
      }

      flat.edgeChildren[edgeStart + index] = flattenDynamicNode(
        child[1],

        flat,
      );
    }
  } else {
    flat.nodeStaticStart[nodeIndex] = flat.edgeSegments.length;
  }

  const paramChild = snapshot.paramChild;

  if (paramChild !== undefined) {
    flat.nodeParamChild[nodeIndex] = flattenDynamicNode(
      paramChild,

      flat,
    );
  }

  return nodeIndex;
}

function validatePlan(plan: SemanticRoutePlan): void {
  if (plan.version !== SEMANTIC_ROUTE_PLAN_VERSION) {
    throw new Error("Unsupported Gelis semantic route plan version");
  }

  if (plan.router.version !== 1) {
    throw new Error("Unsupported Gelis router snapshot version");
  }

  if (
    plan.routeCount !== plan.routes.length ||
    plan.routeCount !== plan.router.routeCount
  ) {
    throw new Error("Gelis flat AOT artifact route count mismatch");
  }
}
