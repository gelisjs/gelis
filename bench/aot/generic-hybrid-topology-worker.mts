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

import type { DynamicNodeSnapshot } from "../../src/runtime/router-snapshot.ts";

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

const shapeKind = process.env.SHAPE_KIND;

if (
  scenario !== "semantic" &&
  scenario !== "current-flat" &&
  scenario !== "hybrid"
) {
  throw new Error(`Invalid SCENARIO: ${scenario}`);
}

if (shapeKind !== "shared" && shapeKind !== "unique" && shapeKind !== "multi") {
  throw new Error(`Invalid SHAPE_KIND: ${shapeKind}`);
}

type Scenario = typeof scenario;

type ShapeKind = typeof shapeKind;

const RESPONSE = new Response(null, {
  status: 204,
});

const HANDLER: RuntimeRouteHandler = () => RESPONSE;

const routeShapes = new Array<{
  method: "GET";
  path: string;
}>(ROUTES);

for (let index = 0; index < ROUTES; index++) {
  let path: string;

  switch (shapeKind) {
    case "shared":
      path = `/r/${index}/:id/detail`;

      break;

    case "unique":
      path = `/r/${index}/:p${index}/detail`;

      break;

    case "multi":
      path = `/r/${index}/:team/users/:id/detail`;

      break;
  }

  routeShapes[index] = {
    method: "GET",
    path,
  };
}

/*
 * All compilation, handler binding and hybrid topology
 * preparation are excluded from the hydration timer.
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

/*
 * This represents the build-time hybrid payload:
 * generic roots remain nested while the rest of the
 * runtime metadata continues to use flat columns.
 */
const hybridRoots = new Map<string, DynamicNodeSnapshot>();

for (const [method, methodSnapshot] of plan.router.methods) {
  hybridRoots.set(method, methodSnapshot.dynamicRoot);
}

const started = performance.now();

let router: Router;

switch (scenario) {
  case "semantic":
    router = hydrateRouterSnapshot(plan.router, routes);

    break;

  case "current-flat":
    router = hydrateFlatRouter(methodNames, flatRouter, routes);

    break;

  case "hybrid":
    router = hydrateHybridRouter(methodNames, flatRouter, routes, hybridRoots);

    break;
}

const hydrateMs = performance.now() - started;

const { target, expectedParams } = targetForShape(shapeKind);

const match = router.match("GET", target);

if (match === undefined) {
  throw new Error("Hybrid topology router failed to match target");
}

if (match.route !== routes[ROUTES - 1]) {
  throw new Error("Hybrid topology router matched incorrect route");
}

for (const [name, value] of Object.entries(expectedParams)) {
  if (match.params[name] !== value) {
    throw new Error(`Hybrid topology produced incorrect parameter: ${name}`);
  }
}

console.log(
  JSON.stringify({
    scenario,
    shapeKind,
    hydrateMs,
  }),
);

function hydrateHybridRouter(
  methodNames: readonly string[],

  flat: FlatAotRouter,

  routes: readonly RuntimeRouteRecord[],

  hybridRoots: ReadonlyMap<string, DynamicNodeSnapshot>,
): Router {
  const [methods] = flat;

  const runtimeMethods = new Map<string, MethodRoutes>();

  for (let index = 0; index < methods.length; index++) {
    const flatMethod = methods[index];

    if (flatMethod === undefined) {
      throw new Error(`Missing Gelis hybrid method: ${index}`);
    }

    const [methodId] = flatMethod;

    const methodName = methodNames[methodId];

    if (methodName === undefined) {
      throw new Error(`Invalid Gelis hybrid method id: ${methodId}`);
    }

    asHttpMethod(methodName);

    if (runtimeMethods.has(methodName)) {
      throw new Error(`Duplicate Gelis hybrid method: ${methodName}`);
    }

    const dynamicRoot = hybridRoots.get(methodName);

    if (dynamicRoot === undefined) {
      throw new Error(`Missing Gelis hybrid dynamic root: ${methodName}`);
    }

    runtimeMethods.set(
      methodName,

      hydrateHybridMethod(flatMethod, dynamicRoot, routes),
    );
  }

  return Router.fromMethods(runtimeMethods);
}

function hydrateHybridMethod(
  flatMethod: FlatAotMethod,

  dynamicRoot: DynamicNodeSnapshot,

  routes: readonly RuntimeRouteRecord[],
): MethodRoutes {
  const [
    ,
    staticPaths,
    staticRouteIndexes,
    trailingPrefixes,
    trailingRouteIndexes,
    trailingParamNames,
    ,
    usesDynamicTrie,
  ] = flatMethod;

  if (staticPaths.length !== staticRouteIndexes.length) {
    throw new Error("Gelis hybrid static route column length mismatch");
  }

  const staticRoutes = new Map<string, RuntimeRouteRecord>();

  for (let index = 0; index < staticPaths.length; index++) {
    const path = staticPaths[index];

    const routeIndex = staticRouteIndexes[index];

    if (path === undefined || routeIndex === undefined) {
      throw new Error(`Missing Gelis hybrid static route: ${index}`);
    }

    staticRoutes.set(path, routeAt(routes, routeIndex));
  }

  const trailingParamRoutes = hydrateTrailingRoutes(
    trailingPrefixes,
    trailingRouteIndexes,
    trailingParamNames,
    routes,
  );

  if (usesDynamicTrie !== 0 && usesDynamicTrie !== 1) {
    throw new Error(`Invalid Gelis hybrid trie flag: ${usesDynamicTrie}`);
  }

  return {
    staticRoutes,

    trailingParamRoutes,

    dynamicRoot: hydrateNestedNode(dynamicRoot, routes),

    usesDynamicTrie: usesDynamicTrie === 1,
  };
}

function hydrateNestedNode(
  snapshot: DynamicNodeSnapshot,

  routes: readonly RuntimeRouteRecord[],
): DynamicNode {
  let staticChildren: Map<string, DynamicNode> | undefined;

  if (snapshot.staticChildren !== undefined) {
    staticChildren = new Map();

    for (const [segment, child] of snapshot.staticChildren) {
      staticChildren.set(
        segment,

        hydrateNestedNode(child, routes),
      );
    }
  }

  const routeSnapshot = snapshot.route;

  let route: DynamicNode["route"];

  if (routeSnapshot !== undefined) {
    route = {
      route: routeAt(routes, routeSnapshot.routeIndex),

      paramNames: routeSnapshot.paramNames,
    };
  }

  return {
    staticChildren,

    paramChild:
      snapshot.paramChild === undefined
        ? undefined
        : hydrateNestedNode(snapshot.paramChild, routes),

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
      throw new Error("Gelis hybrid trailing route column mismatch");
    }

    return undefined;
  }

  if (
    routeIndexes === 0 ||
    paramNames === 0 ||
    prefixes.length !== routeIndexes.length ||
    prefixes.length !== paramNames.length
  ) {
    throw new Error("Gelis hybrid trailing route column mismatch");
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
      throw new Error(`Missing Gelis hybrid trailing route: ${index}`);
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
    throw new Error(`Invalid Gelis hybrid route index: ${index}`);
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
      throw new Error(`Invalid Gelis hybrid HTTP method: ${method}`);
  }
}

function targetForShape(shape: ShapeKind): {
  readonly target: string;

  readonly expectedParams: Readonly<Record<string, string>>;
} {
  const index = ROUTES - 1;

  switch (shape) {
    case "shared":
      return {
        target: `/r/${index}/target/detail`,

        expectedParams: {
          id: "target",
        },
      };

    case "unique":
      return {
        target: `/r/${index}/target/detail`,

        expectedParams: {
          [`p${index}`]: "target",
        },
      };

    case "multi":
      return {
        target: `/r/${index}/core/users/42/detail`,

        expectedParams: {
          team: "core",
          id: "42",
        },
      };
  }
}
