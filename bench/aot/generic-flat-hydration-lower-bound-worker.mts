import { Router } from "../../src/runtime/router.ts";

import type { DynamicNode, MethodRoutes } from "../../src/runtime/router.ts";

import { hydrateRouterSnapshot } from "../../src/runtime/router-snapshot.ts";

import { hydrateFlatRouter } from "../../src/runtime/flat-aot-runtime.ts";

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

if (
  scenario !== "semantic" &&
  scenario !== "production" &&
  scenario !== "unchecked" &&
  scenario !== "shared-param"
) {
  throw new Error(`Invalid SCENARIO: ${scenario}`);
}

type Scenario = typeof scenario;

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

    path: `/r/${index}/:id/detail`,
  };
}

/*
 * Build-time and binding work is deliberately
 * excluded. This benchmark isolates router hydration.
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

const started = performance.now();

let router: Router;

switch (scenario) {
  case "semantic":
    router = hydrateRouterSnapshot(
      plan.router,

      routes,
    );

    break;

  case "production":
    router = hydrateFlatRouter(
      methodNames,

      flatRouter,

      routes,
    );

    break;

  case "unchecked":
    router = hydrateFlatRouterLowerBound(
      methodNames,

      flatRouter,

      routes,

      false,
    );

    break;

  case "shared-param":
    router = hydrateFlatRouterLowerBound(
      methodNames,

      flatRouter,

      routes,

      true,
    );

    break;
}

const hydrateMs = performance.now() - started;

const target = `/r/${ROUTES - 1}/target/detail`;

const match = router.match(
  "GET",

  target,
);

if (match === undefined) {
  throw new Error("Lower-bound router failed to match target");
}

if (match.params.id !== "target") {
  throw new Error("Lower-bound router produced incorrect params");
}

if (match.route !== routes[ROUTES - 1]) {
  throw new Error("Lower-bound router matched incorrect route");
}

console.log(
  JSON.stringify({
    scenario,

    hydrateMs,
  }),
);

const SHARED_PARAM_NAMES = ["id"] as const;

function hydrateFlatRouterLowerBound(
  methodNames: readonly string[],

  flat: typeof flatRouter,

  routes: readonly RuntimeRouteRecord[],

  shareParamNames: boolean,
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

  const nodes = new Array<DynamicNode>(nodeCount);

  /*
   * Lower-bound pass one:
   * no structural validation and no checked
   * route lookup helpers.
   */
  for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
    const routeIndex = nodeRouteIndex[nodeIndex]!;

    let route: DynamicNode["route"];

    if (routeIndex !== -1) {
      const paramStart = nodeParamStart[nodeIndex]!;

      const paramCount = nodeParamCount[nodeIndex]!;

      route = {
        route: routes[routeIndex]!,

        paramNames: shareParamNames
          ? SHARED_PARAM_NAMES
          : paramNames.slice(
              paramStart,

              paramStart + paramCount,
            ),
      };
    }

    nodes[nodeIndex] = {
      staticChildren: undefined,

      paramChild: undefined,

      route,
    };
  }

  /*
   * Lower-bound pass two:
   * wire preallocated nodes directly by index.
   */
  for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
    const node = nodes[nodeIndex]!;

    const start = nodeStaticStart[nodeIndex]!;

    const count = nodeStaticCount[nodeIndex]!;

    if (count !== 0) {
      const children = new Map<string, DynamicNode>();

      const end = start + count;

      for (let edgeIndex = start; edgeIndex < end; edgeIndex++) {
        children.set(
          edgeSegments[edgeIndex]!,

          nodes[edgeChildren[edgeIndex]!]!,
        );
      }

      node.staticChildren = children;
    }

    const paramChild = nodeParamChild[nodeIndex]!;

    if (paramChild !== -1) {
      node.paramChild = nodes[paramChild]!;
    }
  }

  const runtimeMethods = new Map<string, MethodRoutes>();

  for (const method of methods) {
    const [
      methodId,
      staticPaths,
      staticRouteIndexes,
      ,
      ,
      ,
      rootNode,
      usesDynamicTrie,
    ] = method;

    const staticRoutes = new Map<string, RuntimeRouteRecord>();

    for (let index = 0; index < staticPaths.length; index++) {
      staticRoutes.set(
        staticPaths[index]!,

        routes[staticRouteIndexes[index]!]!,
      );
    }

    runtimeMethods.set(
      methodNames[methodId]!,

      {
        staticRoutes,

        trailingParamRoutes: undefined,

        dynamicRoot: nodes[rootNode]!,

        usesDynamicTrie: usesDynamicTrie === 1,
      },
    );
  }

  return Router.fromMethods(runtimeMethods);
}
