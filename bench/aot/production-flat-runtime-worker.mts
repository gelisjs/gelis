import { Gelis } from "../../src/app.ts";

import { installAotRuntime } from "../../src/runtime/aot-runtime.ts";

import { FLAT_AOT_ARTIFACT_VERSION } from "../../src/runtime/flat-aot-artifact.ts";

import { installFlatAotRuntime } from "../../src/runtime/flat-aot-runtime.ts";

import { SEMANTIC_ROUTE_PLAN_VERSION } from "../../src/runtime/semantic-route-plan.ts";

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

const RESPONSE = new Response(
  null,

  {
    status: 204,
  },
);

const HANDLER: RuntimeRouteHandler = () => RESPONSE;

/*
 * Everything below represents build-time or
 * generated artifact state and is intentionally
 * prepared outside the runtime installation timer.
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

const target = targetPath(kind);

const readyStarted = performance.now();

const app = new Gelis();

const installStarted = performance.now();

if (scenario === "semantic") {
  installAotRuntime(
    app,

    plan,

    {
      version: SEMANTIC_ROUTE_PLAN_VERSION,

      shapeFingerprint: plan.shapeFingerprint,

      handlers,
    },
  );
} else {
  installFlatAotRuntime(
    app,

    artifact,

    {
      version: FLAT_AOT_ARTIFACT_VERSION,

      shapeFingerprint: artifact[2],

      handlers,
    },
  );
}

const installMs = performance.now() - installStarted;

const readyMs = performance.now() - readyStarted;

/*
 * This must be the first request after installation.
 * It is a control metric, not part of install timing.
 */
const firstStarted = performance.now();

const response = await app.fetch(new Request(`http://gelis.test${target}`));

const firstFetchUs = (performance.now() - firstStarted) * 1000;

if (response.status !== 204) {
  throw new Error(`Unexpected first response status: ${response.status}`);
}

console.log(
  JSON.stringify({
    routeKind: kind,

    scenario,

    installMs,

    readyMs,

    firstFetchUs,
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
