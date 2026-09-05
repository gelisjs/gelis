import { describe, expect, test } from "bun:test";

import { hydrateRouterSnapshot } from "../../src/runtime/router-snapshot";

import type { RouterSnapshot } from "../../src/runtime/router-snapshot";

import type { RuntimeRouteRecord } from "../../src/runtime/types";

const EMPTY_NODE = {
  staticChildren: undefined,

  paramChild: undefined,

  route: undefined,
} as const;

describe("Gelis router snapshot hydration", () => {
  test("hydrates static routes", () => {
    const routes = [route("GET", "/health")];

    const snapshot: RouterSnapshot = {
      version: 1,

      routeCount: routes.length,

      methods: [
        [
          "GET",
          {
            staticRoutes: [["/health", 0]],

            trailingParamRoutes: undefined,

            dynamicRoot: EMPTY_NODE,

            usesDynamicTrie: false,
          },
        ],
      ],
    };

    const router = hydrateRouterSnapshot(snapshot, routes);

    const match = router.match("GET", "/health");

    expect(match?.route).toBe(routes[0]);

    expect(match?.params).toEqual({});
  });

  test("hydrates trailing-param fast-map routes", () => {
    const routes = [route("GET", "/users/:id")];

    const snapshot: RouterSnapshot = {
      version: 1,

      routeCount: routes.length,

      methods: [
        [
          "GET",
          {
            staticRoutes: [],

            trailingParamRoutes: [
              [
                "/users/",
                {
                  routeIndex: 0,

                  paramName: "id",
                },
              ],
            ],

            dynamicRoot: EMPTY_NODE,

            usesDynamicTrie: false,
          },
        ],
      ],
    };

    const router = hydrateRouterSnapshot(snapshot, routes);

    const match = router.match("GET", "/users/42");

    expect(match?.route).toBe(routes[0]);

    expect(match?.params).toEqual({
      id: "42",
    });
  });

  test("hydrates generic dynamic trie routes", () => {
    const routes = [route("GET", "/users/:id/details")];

    const snapshot: RouterSnapshot = {
      version: 1,

      routeCount: routes.length,

      methods: [
        [
          "GET",
          {
            staticRoutes: [],

            trailingParamRoutes: undefined,

            dynamicRoot: {
              staticChildren: [
                [
                  "users",
                  {
                    staticChildren: undefined,

                    paramChild: {
                      staticChildren: [
                        [
                          "details",
                          {
                            staticChildren: undefined,

                            paramChild: undefined,

                            route: {
                              routeIndex: 0,

                              paramNames: ["id"],
                            },
                          },
                        ],
                      ],

                      paramChild: undefined,

                      route: undefined,
                    },

                    route: undefined,
                  },
                ],
              ],

              paramChild: undefined,

              route: undefined,
            },

            usesDynamicTrie: true,
          },
        ],
      ],
    };

    const router = hydrateRouterSnapshot(snapshot, routes);

    const match = router.match("GET", "/users/42/details");

    expect(match?.route).toBe(routes[0]);

    expect(match?.params).toEqual({
      id: "42",
    });
  });

  test("accepts a JSON-round-tripped snapshot", () => {
    const routes = [route("GET", "/health")];

    const original: RouterSnapshot = {
      version: 1,

      routeCount: 1,

      methods: [
        [
          "GET",
          {
            staticRoutes: [["/health", 0]],

            trailingParamRoutes: undefined,

            dynamicRoot: EMPTY_NODE,

            usesDynamicTrie: false,
          },
        ],
      ],
    };

    const serialized = JSON.stringify(original);

    const restored = JSON.parse(serialized) as RouterSnapshot;

    const router = hydrateRouterSnapshot(restored, routes);

    expect(router.match("GET", "/health")?.route).toBe(routes[0]);
  });

  test("rejects a route-count mismatch", () => {
    const snapshot: RouterSnapshot = {
      version: 1,

      routeCount: 1,

      methods: [],
    };

    expect(() => hydrateRouterSnapshot(snapshot, [])).toThrow(
      "route count mismatch",
    );
  });
});

function route(
  method: RuntimeRouteRecord["method"],

  path: string,
): RuntimeRouteRecord {
  return {
    method,

    path,

    handler: () =>
      new Response(null, {
        status: 204,
      }),

    flags: 0,

    input: undefined,

    beforeHandle: undefined,

    afterHandle: undefined,

    responses: undefined,
  };
}
