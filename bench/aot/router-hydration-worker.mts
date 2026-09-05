import { Router } from "../../src/runtime/router.ts";

import type {
  RuntimeRouteHandler,
  RuntimeRouteRecord,
} from "../../src/runtime/types.ts";

const ROUTES = 5000;

const kind = process.env.ROUTE_KIND === "dynamic" ? "dynamic" : "static";

const scenario = process.env.SCENARIO;

if (
  scenario !== "route-record-build" &&
  scenario !== "router-register" &&
  scenario !== "table-hydrate"
) {
  throw new Error(`Invalid SCENARIO: ${scenario}`);
}

const RESPONSE = new Response(null, {
  status: 204,
});

const HANDLER: RuntimeRouteHandler = () => RESPONSE;

/*
 * Paths represent build-time-known route grammar.
 *
 * Keep path generation outside the timed section.
 */
const paths = new Array<string>(ROUTES);

for (let index = 0; index < ROUTES; index++) {
  paths[index] = kind === "static" ? `/r/${index}` : `/r/${index}/:id`;
}

/*
 * These are prepared before the timer for scenarios
 * that specifically measure router construction.
 */
const prebuiltRoutes =
  scenario === "route-record-build" ? undefined : paths.map(makeRuntimeRoute);

interface HydratedTrailingRoute {
  readonly route: RuntimeRouteRecord;

  readonly paramName: string;
}

const precomputedStaticEntries =
  scenario === "table-hydrate" && kind === "static"
    ? prebuiltRoutes!.map((route) => [route.path, route] as const)
    : undefined;

const precomputedDynamicEntries =
  scenario === "table-hydrate" && kind === "dynamic"
    ? prebuiltRoutes!.map((route) => {
        const slash = route.path.lastIndexOf("/");

        const prefix = route.path.slice(0, slash + 1);

        return [
          prefix,
          {
            route,

            paramName: "id",
          },
        ] as const;
      })
    : undefined;

let sink: unknown;

const started = performance.now();

switch (scenario) {
  case "route-record-build": {
    const routes = paths.map(makeRuntimeRoute);

    sink = routes;

    break;
  }

  case "router-register": {
    const router = new Router();

    for (const route of prebuiltRoutes!) {
      router.register(route);
    }

    sink = router;

    break;
  }

  case "table-hydrate": {
    /*
     * Lower bound for a future precomputed
     * routing representation.
     *
     * Grammar analysis and placement happened
     * before the timed section.
     *
     * Runtime only materializes the lookup table.
     */
    if (kind === "static") {
      const entries = precomputedStaticEntries;

      if (!entries) {
        throw new Error("Missing static hydration entries");
      }

      const table = new Map<string, RuntimeRouteRecord>(entries);

      const route = table.get(`/r/${ROUTES - 1}`);

      if (!route) {
        throw new Error("Static hydration sanity check failed");
      }

      sink = table;

      break;
    }

    const entries = precomputedDynamicEntries;

    if (!entries) {
      throw new Error("Missing dynamic hydration entries");
    }

    const table = new Map<string, HydratedTrailingRoute>(entries);

    const entry = table.get(`/r/${ROUTES - 1}/`);

    if (!entry) {
      throw new Error("Dynamic hydration sanity check failed");
    }

    sink = table;

    break;
  }
}

const milliseconds = performance.now() - started;

console.log(
  JSON.stringify({
    routeKind: kind,

    scenario,

    milliseconds,
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
