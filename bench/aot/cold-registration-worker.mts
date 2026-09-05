import { Gelis } from "../../src/index.ts";

import { RouteBuilder } from "../../src/route-builder.ts";

import { Router } from "../../src/runtime/router.ts";

import type {
  RuntimeRouteHandler,
  RuntimeRouteRecord,
} from "../../src/runtime/types.ts";

const ROUTES = 5000;

const kind = process.env.ROUTE_KIND === "dynamic" ? "dynamic" : "static";

const scenario = process.env.SCENARIO;

if (
  scenario !== "builder-only" &&
  scenario !== "router-prebuilt" &&
  scenario !== "builder-router" &&
  scenario !== "full-app"
) {
  throw new Error(`Invalid SCENARIO: ${scenario}`);
}

const RESPONSE = new Response(null, {
  status: 204,
});

const HANDLER: RuntimeRouteHandler = () => RESPONSE;

const paths = new Array<string>(ROUTES);

for (let index = 0; index < ROUTES; index++) {
  paths[index] = kind === "static" ? `/r/${index}` : `/r/${index}/:id`;
}

let sink: unknown;

const started = performance.now();

switch (scenario) {
  case "builder-only": {
    const routes: RuntimeRouteRecord[] = [];

    const builder = new RouteBuilder("", (route) => {
      routes.push(route);
    });

    const get = builder.get.bind(builder) as (
      path: string,
      handler: RuntimeRouteHandler,
    ) => unknown;

    for (const path of paths) {
      get(path, HANDLER);
    }

    sink = routes;

    break;
  }

  case "router-prebuilt": {
    const routes = paths.map((path) => makeRuntimeRoute(path));

    const router = new Router();

    for (const route of routes) {
      router.register(route);
    }

    sink = router;

    break;
  }

  case "builder-router": {
    const router = new Router();

    const routes: RuntimeRouteRecord[] = [];

    const builder = new RouteBuilder("", (route) => {
      router.register(route);

      routes.push(route);
    });

    const get = builder.get.bind(builder) as (
      path: string,
      handler: RuntimeRouteHandler,
    ) => unknown;

    for (const path of paths) {
      get(path, HANDLER);
    }

    sink = {
      router,
      routes,
    };

    break;
  }

  case "full-app": {
    const app = new Gelis();

    const get = app.get.bind(app) as (
      path: string,
      handler: RuntimeRouteHandler,
    ) => unknown;

    for (const path of paths) {
      get(path, HANDLER);
    }

    sink = app;

    break;
  }
}

const registrationMs = performance.now() - started;

console.log(
  JSON.stringify({
    routeKind: kind,
    scenario,
    registrationMs,
  }),
);

function makeRuntimeRoute(path: string): RuntimeRouteRecord {
  return {
    method: "GET",

    path,

    handler: HANDLER,

    flags: 0,

    input: undefined,

    beforeHandle: undefined,

    afterHandle: undefined,

    responses: undefined,
  };
}

void sink;
