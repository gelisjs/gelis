import { GELIS_INTERNAL_RUNTIME, Gelis } from "../../src/app.ts";

import {
  bindFlatRoutes,
  hydrateFlatRouter,
} from "../../src/runtime/flat-aot-runtime.ts";

import {
  bindSemanticRoutePlan,
  SEMANTIC_ROUTE_PLAN_VERSION,
} from "../../src/runtime/semantic-route-plan.ts";

import { hydrateRouterSnapshot } from "../../src/runtime/router-snapshot.ts";

import type { RuntimeRouteHandler } from "../../src/runtime/types.ts";

import { compileFlatAotArtifact } from "../../src/tooling/flat-aot-artifact-compiler.ts";

import { compileSemanticRoutePlan } from "../../src/tooling/semantic-route-plan-compiler.ts";

const ROUTES = 5000;

const kind = process.env.ROUTE_KIND;

const scenario = process.env.SCENARIO;

if (kind !== "static" && kind !== "trailing" && kind !== "generic") {
  throw new Error(`Invalid ROUTE_KIND: ${kind}`);
}

if (scenario !== "semantic" && scenario !== "flat") {
  throw new Error(`Invalid SCENARIO: ${scenario}`);
}

type RouteKind = typeof kind;

const RESPONSE = new Response(null, {
  status: 204,
});

const HANDLER: RuntimeRouteHandler = () => RESPONSE;

/*
 * Build-time state is deliberately prepared
 * outside all runtime decomposition timers.
 */
const paths = createPaths(kind);

const plan = await compileSemanticRoutePlan(
  paths.map((path) => ({
    method: "GET" as const,

    path,
  })),
);

const artifact = compileFlatAotArtifact(plan);

const handlers = new Array<RuntimeRouteHandler>(ROUTES);

handlers.fill(HANDLER);

const app = new Gelis();

const runtimeStarted = performance.now();

let bindMs: number;

let hydrateMs: number;

let installMs: number;

if (scenario === "semantic") {
  const bindStarted = performance.now();

  const routes = bindSemanticRoutePlan(
    plan,

    {
      version: SEMANTIC_ROUTE_PLAN_VERSION,

      shapeFingerprint: plan.shapeFingerprint,

      handlers,
    },
  );

  bindMs = performance.now() - bindStarted;

  const hydrateStarted = performance.now();

  const router = hydrateRouterSnapshot(
    plan.router,

    routes,
  );

  hydrateMs = performance.now() - hydrateStarted;

  const installStarted = performance.now();

  app[GELIS_INTERNAL_RUNTIME]().installPrebuiltRuntime(
    router,

    routes,
  );

  installMs = performance.now() - installStarted;
} else {
  const [, routeCount, , methodNames, routeMethodIds, routePaths, flatRouter] =
    artifact;

  const bindStarted = performance.now();

  const routes = bindFlatRoutes(
    routeCount,

    methodNames,

    routeMethodIds,

    routePaths,

    handlers,
  );

  bindMs = performance.now() - bindStarted;

  const hydrateStarted = performance.now();

  const router = hydrateFlatRouter(
    methodNames,

    flatRouter,

    routes,
  );

  hydrateMs = performance.now() - hydrateStarted;

  const installStarted = performance.now();

  app[GELIS_INTERNAL_RUNTIME]().installPrebuiltRuntime(
    router,

    routes,
  );

  installMs = performance.now() - installStarted;
}

const runtimeMs = performance.now() - runtimeStarted;

const response = await app.fetch(
  new Request(`http://gelis.test${targetPath(kind)}`),
);

if (response.status !== 204) {
  throw new Error(`Unexpected response status: ${response.status}`);
}

console.log(
  JSON.stringify({
    routeKind: kind,

    scenario,

    bindMs,

    hydrateMs,

    installMs,

    runtimeMs,
  }),
);

function createPaths(routeKind: RouteKind): string[] {
  const result = new Array<string>(ROUTES);

  for (let index = 0; index < ROUTES; index++) {
    switch (routeKind) {
      case "static":
        result[index] = `/r/${index}`;

        break;

      case "trailing":
        result[index] = `/r/${index}/:id`;

        break;

      case "generic":
        result[index] = `/r/${index}/:id/detail`;

        break;
    }
  }

  return result;
}

function targetPath(routeKind: RouteKind): string {
  const index = ROUTES - 1;

  switch (routeKind) {
    case "static":
      return `/r/${index}`;

    case "trailing":
      return `/r/${index}/target`;

    case "generic":
      return `/r/${index}/target/detail`;
  }
}
