import { describe, expect, test } from "bun:test";

import { Router } from "../../src/runtime/router";

import { hydrateRouterSnapshot } from "../../src/runtime/router-snapshot";

import { compileRouterSnapshot } from "../../src/tooling/router-snapshot-compiler";

import type { RuntimeRouteRecord } from "../../src/runtime/types";

describe("Router method discovery", () => {
  test("returns every matching method in method registration order", () => {
    const router = new Router();

    router.register(route("GET", "/users/:id"));
    router.register(route("POST", "/users/:id"));
    router.register(route("MiXeD-Gelis", "/users/:id"));
    router.register(route("HEAD", "/users/:id"));

    expect(router.matchingMethods("/users/42")).toEqual([
      "GET",
      "POST",
      "MiXeD-Gelis",
      "HEAD",
    ]);
  });

  test("uses the same static trailing-param and generic dynamic topology as match", () => {
    const router = new Router();

    router.register(route("GET", "/health"));
    router.register(route("POST", "/users/:id"));
    router.register(route("PATCH", "/users/:id/details"));
    router.register(route("QUERY", "/search/:bucket/:id"));

    expect(router.matchingMethods("/health")).toEqual(["GET"]);

    expect(router.matchingMethods("/users/42")).toEqual(["POST"]);

    expect(router.matchingMethods("/users/42/details")).toEqual(["PATCH"]);

    expect(router.matchingMethods("/search/docs/42")).toEqual(["QUERY"]);

    expect(router.matchingMethods("/missing")).toEqual([]);
  });

  test("reports every method whose own topology matches the actual pathname", () => {
    const router = new Router();

    router.register(route("GET", "/users/:id"));
    router.register(route("POST", "/users/admin"));
    router.register(route("DELETE", "/users/:id"));

    expect(router.matchingMethods("/users/admin")).toEqual([
      "GET",
      "POST",
      "DELETE",
    ]);
  });

  test("preserves the ALL pseudo-method as raw router topology", () => {
    const router = new Router();

    router.register(route("*", "/resource/:id"));

    expect(router.matchingMethods("/resource/42")).toEqual(["*"]);
  });

  test("discovers methods identically after router snapshot hydration", () => {
    const routes = [
      route("GET", "/users/:id"),
      route("POST", "/users/:id"),
      route("PURGE", "/cache/:key"),
      route("*", "/fallback/:id"),
    ];

    const normal = new Router();

    for (const item of routes) {
      normal.register(item);
    }

    const snapshot = compileRouterSnapshot(routes);

    const hydrated = hydrateRouterSnapshot(
      snapshot,

      routes,
    );

    for (const pathname of [
      "/users/42",
      "/cache/avatar",
      "/fallback/7",
      "/missing",
    ]) {
      expect(hydrated.matchingMethods(pathname)).toEqual(
        normal.matchingMethods(pathname),
      );
    }
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
