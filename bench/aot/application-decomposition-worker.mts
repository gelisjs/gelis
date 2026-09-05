import { Gelis } from "../../src/index.ts";

import { createAotAppSession } from "../../src/tooling/aot-app.ts";

import { compileRouterSnapshot } from "../../src/tooling/router-snapshot-compiler.ts";

import type { RuntimeRouteHandler } from "../../src/runtime/types.ts";

const ROUTES = 5000;

const kind = process.env.ROUTE_KIND;

const scenario = process.env.SCENARIO;

if (kind !== "static" && kind !== "trailing" && kind !== "generic") {
  throw new Error(`Invalid ROUTE_KIND: ${kind}`);
}

if (scenario !== "normal" && scenario !== "aot") {
  throw new Error(`Invalid SCENARIO: ${scenario}`);
}

type RouteKind = typeof kind;

const RESPONSE = new Response(null, {
  status: 204,
});

const HANDLER: RuntimeRouteHandler = () => RESPONSE;

const paths = createPaths(kind);

/*
 * Build-time artifact.
 *
 * Explicitly excluded from runtime measurements.
 */
const snapshot = compileRouterSnapshot(
  paths.map((path) => ({
    method: "GET" as const,

    path,
  })),
);

let app: Gelis;

let constructMs = 0;

let declarationMs = 0;

let hydrationMs = 0;

const readyStarted = performance.now();

if (scenario === "normal") {
  const constructStarted = performance.now();

  app = new Gelis();

  constructMs = performance.now() - constructStarted;

  const declarationStarted = performance.now();

  declareRoutes(app, paths);

  declarationMs = performance.now() - declarationStarted;
} else {
  const constructStarted = performance.now();

  const session = createAotAppSession();

  constructMs = performance.now() - constructStarted;

  const declarationStarted = performance.now();

  declareRoutes(session.app, paths);

  declarationMs = performance.now() - declarationStarted;

  const hydrationStarted = performance.now();

  app = session.hydrate(snapshot);

  hydrationMs = performance.now() - hydrationStarted;
}

const readyMs = performance.now() - readyStarted;

/*
 * Sanity only. Outside stage measurements.
 */
const target = targetPath(kind);

const response = await app.fetch(new Request(`http://localhost${target}`));

if (response.status !== 204) {
  throw new Error(`Unexpected status: ${response.status}`);
}

console.log(
  JSON.stringify({
    routeKind: kind,

    scenario,

    constructMs,

    declarationMs,

    hydrationMs,

    readyMs,
  }),
);

function declareRoutes(
  application: Gelis,

  routePaths: readonly string[],
): void {
  const get = application.get.bind(application) as (
    path: string,

    handler: RuntimeRouteHandler,
  ) => unknown;

  for (const path of routePaths) {
    get(path, HANDLER);
  }
}

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
