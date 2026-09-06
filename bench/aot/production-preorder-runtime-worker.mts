import { Gelis } from "../../src/app.ts";

import { FLAT_AOT_ARTIFACT_VERSION } from "../../src/runtime/flat-aot-artifact.ts";

import { installFlatAotRuntime } from "../../src/runtime/flat-aot-runtime.ts";

import { PREORDER_AOT_ARTIFACT_VERSION } from "../../src/runtime/preorder-aot-artifact.ts";

import { installPreorderAotRuntime } from "../../src/runtime/preorder-aot-runtime.ts";

import type { RuntimeRouteHandler } from "../../src/runtime/types.ts";

import { compileFlatAotArtifact } from "../../src/tooling/flat-aot-artifact-compiler.ts";

import { compilePreorderAotArtifact } from "../../src/tooling/preorder-aot-artifact-compiler.ts";

import { compileSemanticRoutePlan } from "../../src/tooling/semantic-route-plan-compiler.ts";

const ROUTES = 5000;

const kind = process.env.ROUTE_KIND;

const scenario = process.env.SCENARIO;

if (kind !== "static" && kind !== "trailing" && kind !== "generic") {
  throw new Error(`Invalid ROUTE_KIND: ${kind}`);
}

if (scenario !== "flat" && scenario !== "preorder") {
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
 * Route shape compilation and artifact generation are
 * build-time work and deliberately excluded from all
 * production runtime installation measurements.
 */
const paths = createPaths(kind);

const plan = await compileSemanticRoutePlan(
  paths.map((path) => ({
    method: "GET" as const,

    path,
  })),
);

const flatArtifact = compileFlatAotArtifact(plan);

const preorderArtifact = compilePreorderAotArtifact(plan);

const handlers = new Array<RuntimeRouteHandler>(ROUTES);

handlers.fill(HANDLER);

const target = targetPath(kind);

const readyStarted = performance.now();

const app = new Gelis();

const installStarted = performance.now();

if (scenario === "flat") {
  installFlatAotRuntime(
    app,

    flatArtifact,

    {
      version: FLAT_AOT_ARTIFACT_VERSION,

      shapeFingerprint: flatArtifact[2],

      handlers,
    },
  );
} else {
  installPreorderAotRuntime(
    app,

    preorderArtifact,

    {
      version: PREORDER_AOT_ARTIFACT_VERSION,

      shapeFingerprint: preorderArtifact[2],

      handlers,
    },
  );
}

const installMs = performance.now() - installStarted;

const readyMs = performance.now() - readyStarted;

/*
 * This must remain the first request after installation.
 * It is a control metric and is not part of install timing.
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
