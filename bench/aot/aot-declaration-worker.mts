import { Gelis } from "../../src/index.ts";

import { RouteBuilder } from "../../src/route-builder.ts";

import { createAotAppSession } from "../../src/tooling/aot-app.ts";

import type {
  RuntimeRouteHandler,
  RuntimeRouteRecord,
} from "../../src/runtime/types.ts";

const ROUTES = 5000;

const kind = process.env.ROUTE_KIND;

const scenario = process.env.SCENARIO;

if (kind !== "static" && kind !== "trailing" && kind !== "generic") {
  throw new Error(`Invalid ROUTE_KIND: ${kind}`);
}

if (
  scenario !== "builder" &&
  scenario !== "aot-app" &&
  scenario !== "normal-app"
) {
  throw new Error(`Invalid SCENARIO: ${scenario}`);
}

type RouteKind = typeof kind;

const RESPONSE = new Response(null, {
  status: 204,
});

const HANDLER: RuntimeRouteHandler = () => RESPONSE;

const paths = createPaths(kind);

let constructMs = 0;

let declarationMs = 0;

let routeCount = 0;

if (scenario === "builder") {
  const routes: RuntimeRouteRecord[] = [];

  const constructStarted = performance.now();

  const builder = new RouteBuilder(
    "",

    (route) => {
      routes.push(route);
    },
  );

  constructMs = performance.now() - constructStarted;

  const declarationStarted = performance.now();

  declareRoutes(builder, paths);

  declarationMs = performance.now() - declarationStarted;

  routeCount = routes.length;
} else if (scenario === "aot-app") {
  const constructStarted = performance.now();

  const session = createAotAppSession();

  constructMs = performance.now() - constructStarted;

  const declarationStarted = performance.now();

  declareRoutes(session.app, paths);

  declarationMs = performance.now() - declarationStarted;

  routeCount = session.collectRoutes().length;
} else {
  const constructStarted = performance.now();

  const app = new Gelis();

  constructMs = performance.now() - constructStarted;

  const declarationStarted = performance.now();

  declareRoutes(app, paths);

  declarationMs = performance.now() - declarationStarted;

  routeCount = ROUTES;
}

if (routeCount !== ROUTES) {
  throw new Error(`Unexpected route count: ${routeCount}`);
}

console.log(
  JSON.stringify({
    routeKind: kind,

    scenario,

    constructMs,

    declarationMs,
  }),
);

function declareRoutes(
  application: RouteBuilder<string>,

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
  const paths = new Array<string>(ROUTES);

  for (let index = 0; index < ROUTES; index++) {
    switch (routeKind) {
      case "static":
        paths[index] = `/r/${index}`;

        break;

      case "trailing":
        paths[index] = `/r/${index}/:id`;

        break;

      case "generic":
        paths[index] = `/r/${index}/:id/detail`;

        break;
    }
  }

  return paths;
}
