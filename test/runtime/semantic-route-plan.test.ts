import { describe, expect, test } from "bun:test";

import { bindSemanticRoutePlan } from "../../src/runtime/semantic-route-plan";

import type { SemanticRouteBindings } from "../../src/runtime/semantic-route-plan";

import { hydrateRouterSnapshot } from "../../src/runtime/router-snapshot";

import type { RuntimeRouteHandler } from "../../src/runtime/types";

import { compileSemanticRoutePlan } from "../../src/tooling/semantic-route-plan-compiler";

const HANDLER_A: RuntimeRouteHandler = () => "a";

const HANDLER_B: RuntimeRouteHandler = () => "b";

const HANDLER_C: RuntimeRouteHandler = () => "c";

const SHAPES = [
  {
    method: "GET" as const,

    path: "/health",
  },

  {
    method: "GET" as const,

    path: "/users/:id",
  },

  {
    method: "POST" as const,

    path: "/posts/:id/detail",
  },
] as const;

describe("Gelis semantic route plan", () => {
  test("compiles deterministic serializable route semantics", async () => {
    const first = await compileSemanticRoutePlan(SHAPES);

    const second = await compileSemanticRoutePlan(SHAPES);

    expect(first.shapeFingerprint).toBe(second.shapeFingerprint);

    expect(first.routeCount).toBe(SHAPES.length);

    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });

  test("includes method path and registration order in fingerprint", async () => {
    const original = await compileSemanticRoutePlan(SHAPES);

    const changedPath = await compileSemanticRoutePlan([
      SHAPES[0],

      {
        method: "GET",

        path: "/members/:id",
      },

      SHAPES[2],
    ]);

    const changedMethod = await compileSemanticRoutePlan([
      {
        method: "POST",

        path: "/health",
      },

      SHAPES[1],
      SHAPES[2],
    ]);

    const changedOrder = await compileSemanticRoutePlan([
      SHAPES[1],
      SHAPES[0],
      SHAPES[2],
    ]);

    expect(changedPath.shapeFingerprint).not.toBe(original.shapeFingerprint);

    expect(changedMethod.shapeFingerprint).not.toBe(original.shapeFingerprint);

    expect(changedOrder.shapeFingerprint).not.toBe(original.shapeFingerprint);
  });

  test("binds runtime handler identity into prepared route records", async () => {
    const plan = await compileSemanticRoutePlan(SHAPES);

    const bindings: SemanticRouteBindings = {
      version: 1,

      shapeFingerprint: plan.shapeFingerprint,

      handlers: [HANDLER_A, HANDLER_B, HANDLER_C],
    };

    const routes = bindSemanticRoutePlan(plan, bindings);

    expect(routes[0]?.handler).toBe(HANDLER_A);

    expect(routes[1]?.handler).toBe(HANDLER_B);

    expect(routes[2]?.handler).toBe(HANDLER_C);

    const router = hydrateRouterSnapshot(plan.router, routes);

    expect(router.match("GET", "/health")?.route).toBe(routes[0]);

    expect(router.match("GET", "/users/123")?.route).toBe(routes[1]);

    expect(router.match("POST", "/posts/123/detail")?.route).toBe(routes[2]);
  });

  test("rejects a stale same-count binding artifact", async () => {
    const original = await compileSemanticRoutePlan(SHAPES);

    const stale = await compileSemanticRoutePlan([
      SHAPES[0],

      {
        method: "GET",

        path: "/members/:id",
      },

      SHAPES[2],
    ]);

    const bindings: SemanticRouteBindings = {
      version: 1,

      /*
       * Simulates generated runtime bindings
       * belonging to another build while route
       * count remains identical.
       */
      shapeFingerprint: stale.shapeFingerprint,

      handlers: [HANDLER_A, HANDLER_B, HANDLER_C],
    };

    expect(() => bindSemanticRoutePlan(original, bindings)).toThrow(
      "Gelis semantic route plan fingerprint mismatch",
    );
  });

  test("rejects binding count mismatch", async () => {
    const plan = await compileSemanticRoutePlan(SHAPES);

    const bindings: SemanticRouteBindings = {
      version: 1,

      shapeFingerprint: plan.shapeFingerprint,

      handlers: [HANDLER_A],
    };

    expect(() => bindSemanticRoutePlan(plan, bindings)).toThrow(
      "Gelis semantic route plan route count mismatch",
    );
  });
});
