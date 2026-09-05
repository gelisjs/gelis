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

/*
 * Route source text / constants exist before
 * application initialization in both modes.
 */
const paths = createPaths(kind);

/*
 * Represents the artifact produced during build.
 *
 * Deliberately outside the runtime timer.
 */
const snapshot = compileRouterSnapshot(
  paths.map((path) => ({
    method: "GET" as const,

    path,
  })),
);

let app: Gelis;

const started = performance.now();

if (scenario === "normal") {
  app = new Gelis();

  declareRoutes(app, paths);
} else {
  const session = createAotAppSession();

  declareRoutes(session.app, paths);

  app = session.hydrate(snapshot);
}

const readyMs = performance.now() - started;

/*
 * First request is measured after the app is ready.
 */
const target = targetPath(kind);

const firstStarted = performance.now();

const result = app.fetch(new Request(`http://localhost${target}`));

const response = result instanceof Promise ? await result : result;

const firstFetchUs = (performance.now() - firstStarted) * 1000;

if (response.status !== 204) {
  throw new Error(`Unexpected response: ${response.status}`);
}

console.log(
  JSON.stringify({
    routeKind: kind,

    scenario,

    readyMs,

    firstFetchUs,
  }),
);

function declareRoutes(
  application: Gelis,

  routePaths: readonly string[],
): void {
  /*
   * Dynamic benchmark paths cannot retain literal
   * string types, so use the runtime registration
   * shape deliberately.
   */
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
