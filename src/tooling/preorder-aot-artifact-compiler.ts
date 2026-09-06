import { PREORDER_AOT_ARTIFACT_VERSION } from "../runtime/preorder-aot-artifact";

import type {
  PreorderAotArtifact,
  PreorderAotMethod,
  PreorderAotRouter,
} from "../runtime/preorder-aot-artifact";

import type {
  DynamicNodeSnapshot,
  MethodRoutesSnapshot,
} from "../runtime/router-snapshot";

import { SEMANTIC_ROUTE_PLAN_VERSION } from "../runtime/semantic-route-plan";

import type { SemanticRoutePlan } from "../runtime/semantic-route-plan";

interface MutablePreorderRouter {
  readonly methods: PreorderAotMethod[];

  readonly nodeStaticCount: number[];

  readonly nodeHasParamChild: number[];

  readonly nodeRouteIndex: number[];

  readonly nodeParamCount: number[];

  readonly edgeSegments: string[];

  readonly paramNames: string[];
}

export function compilePreorderAotArtifact(
  plan: SemanticRoutePlan,
): PreorderAotArtifact {
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
      throw new Error(`Missing Gelis preorder AOT method: ${route.method}`);
    }

    routeMethodIds[index] = methodId;

    routePaths[index] = route.path;
  }

  return [
    PREORDER_AOT_ARTIFACT_VERSION,

    plan.routeCount,

    plan.shapeFingerprint,

    methodNames,

    routeMethodIds,

    routePaths,

    compileRouter(plan, methodIds),
  ];
}

function compileRouter(
  plan: SemanticRoutePlan,

  methodIds: ReadonlyMap<string, number>,
): PreorderAotRouter {
  const preorder: MutablePreorderRouter = {
    methods: [],

    nodeStaticCount: [],

    nodeHasParamChild: [],

    nodeRouteIndex: [],

    nodeParamCount: [],

    edgeSegments: [],

    paramNames: [],
  };

  for (const [method, snapshot] of plan.router.methods) {
    const methodId = methodIds.get(method);

    if (methodId === undefined) {
      throw new Error(`Missing Gelis preorder AOT method id: ${method}`);
    }

    preorder.methods.push(compileMethod(methodId, snapshot, preorder));
  }

  return [
    preorder.methods,

    preorder.nodeStaticCount,

    preorder.nodeHasParamChild,

    preorder.nodeRouteIndex,

    preorder.nodeParamCount,

    preorder.edgeSegments,

    preorder.paramNames,
  ];
}

function compileMethod(
  methodId: number,

  snapshot: MethodRoutesSnapshot,

  preorder: MutablePreorderRouter,
): PreorderAotMethod {
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

  const nodeStart = preorder.nodeStaticCount.length;

  const edgeStart = preorder.edgeSegments.length;

  const paramStart = preorder.paramNames.length;

  if (snapshot.usesDynamicTrie) {
    encodeNode(snapshot.dynamicRoot, preorder);
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

    snapshot.usesDynamicTrie ? 1 : 0,
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
    for (const paramName of node.route.paramNames) {
      preorder.paramNames.push(paramName);
    }
  }

  if (children !== undefined) {
    /*
     * Store all sibling segment labels contiguously.
     *
     * The node stream itself remains preorder, so runtime
     * hydration can consume children recursively without
     * child-index columns or a second wiring pass.
     */
    for (const [segment] of children) {
      preorder.edgeSegments.push(segment);
    }

    for (const [, child] of children) {
      encodeNode(child, preorder);
    }
  }

  if (node.paramChild !== undefined) {
    encodeNode(node.paramChild, preorder);
  }
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
    throw new Error("Gelis preorder AOT artifact route count mismatch");
  }
}
