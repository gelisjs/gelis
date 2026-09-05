import { describe, expect, test } from "bun:test";

import { Router } from "../../src/runtime/router";

import { hydrateRouterSnapshot } from "../../src/runtime/router-snapshot";

import { compileRouterSnapshot } from "../../src/tooling/router-snapshot-compiler";

import type { RuntimeRouteRecord } from "../../src/runtime/types";

describe("Gelis router snapshot compiler", () => {
  test("matches normal Router semantics across routing modes", () => {
    const routes = [
      route("GET", "/health"),

      /*
       * Initially eligible for trailing fast-map.
       */
      route("GET", "/users/:id"),

      /*
       * Separate HTTP method remains independently
       * eligible for trailing fast-map.
       */
      route("POST", "/users/:id"),

      /*
       * Switch GET to generic trie mode and migrate
       * the existing trailing route.
       */
      route("GET", "/users/:id/details"),

      /*
       * Static must continue to win.
       */
      route("GET", "/users/me"),

      /*
       * Registered after GET entered generic mode,
       * therefore this trailing-shaped route must
       * also live in the trie.
       */
      route("GET", "/posts/:slug"),
    ];

    const normal = new Router();

    for (const item of routes) {
      normal.register(item);
    }

    const snapshot = compileRouterSnapshot(routes);

    const hydrated = hydrateRouterSnapshot(snapshot, routes);

    const cases = [
      ["GET", "/health"],

      ["GET", "/users/42"],

      ["GET", "/users/42/details"],

      ["GET", "/users/me"],

      ["GET", "/posts/hello"],

      ["POST", "/users/77"],

      ["GET", "/missing"],
    ] as const;

    for (const [method, pathname] of cases) {
      const expected = normal.match(method, pathname);

      const actual = hydrated.match(method, pathname);

      expect(actual?.route).toBe(expected?.route);

      expect(actual?.params).toEqual(expected?.params);
    }
  });

  test("rejects equivalent dynamic routes like normal Router", () => {
    const routes = [
      route("GET", "/users/:id/details"),

      route("GET", "/users/:name/details"),
    ];

    const normal = new Router();

    expect(() => {
      for (const item of routes) {
        normal.register(item);
      }
    }).toThrow("Duplicate route");

    expect(() => compileRouterSnapshot(routes)).toThrow("Duplicate route");
  });

  test("produces deterministic serializable snapshots", () => {
    const routes = [
      route("GET", "/health"),

      route("GET", "/users/:id"),

      route("POST", "/users/:id/details"),
    ];

    const first = compileRouterSnapshot(routes);

    const second = compileRouterSnapshot(routes);

    const serialized = JSON.stringify(first);

    expect(serialized).toBe(JSON.stringify(second));

    const restored = JSON.parse(serialized);

    const hydrated = hydrateRouterSnapshot(restored, routes);

    expect(hydrated.match("GET", "/users/42")?.params).toEqual({
      id: "42",
    });

    expect(hydrated.match("POST", "/users/42/details")?.params).toEqual({
      id: "42",
    });
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
