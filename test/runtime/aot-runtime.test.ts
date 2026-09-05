import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src/app";

import { installAotRuntime } from "../../src/runtime/aot-runtime";

import { compileSemanticRoutePlan } from "../../src/tooling/semantic-route-plan-compiler";

import { SEMANTIC_ROUTE_PLAN_VERSION } from "../../src/runtime/semantic-route-plan";

import type { RuntimeRouteHandler } from "../../src/runtime/types";

describe("Gelis AOT runtime installation", () => {
  test("installs static routes from a semantic plan", async () => {
    const plan = await compileSemanticRoutePlan([
      {
        method: "GET",

        path: "/first",
      },

      {
        method: "GET",

        path: "/second",
      },
    ]);

    const handlers: RuntimeRouteHandler[] = [() => "first", () => "second"];

    const app = new Gelis();

    installAotRuntime(
      app,

      plan,

      {
        version: SEMANTIC_ROUTE_PLAN_VERSION,

        shapeFingerprint: plan.shapeFingerprint,

        handlers,
      },
    );

    const first = await app.fetch(new Request("http://gelis.test/first"));

    const second = await app.fetch(new Request("http://gelis.test/second"));

    expect(await first.text()).toBe("first");

    expect(await second.text()).toBe("second");
  });

  test("installs trailing-param routes", async () => {
    const plan = await compileSemanticRoutePlan([
      {
        method: "GET",

        path: "/users/:id",
      },
    ]);

    const app = new Gelis();

    installAotRuntime(
      app,

      plan,

      {
        version: SEMANTIC_ROUTE_PLAN_VERSION,

        shapeFingerprint: plan.shapeFingerprint,

        handlers: [({ params }) => params.id],
      },
    );

    const response = await app.fetch(new Request("http://gelis.test/users/42"));

    expect(await response.text()).toBe("42");
  });

  test("installs generic dynamic routes", async () => {
    const plan = await compileSemanticRoutePlan([
      {
        method: "GET",

        path: "/users/:id/detail",
      },
    ]);

    const app = new Gelis();

    installAotRuntime(
      app,

      plan,

      {
        version: SEMANTIC_ROUTE_PLAN_VERSION,

        shapeFingerprint: plan.shapeFingerprint,

        handlers: [({ params }) => params.id],
      },
    );

    const response = await app.fetch(
      new Request("http://gelis.test/users/99/detail"),
    );

    expect(await response.text()).toBe("99");
  });

  test("rejects a stale binding fingerprint", async () => {
    const plan = await compileSemanticRoutePlan([
      {
        method: "GET",

        path: "/route",
      },
    ]);

    const app = new Gelis();

    expect(() =>
      installAotRuntime(
        app,

        plan,

        {
          version: SEMANTIC_ROUTE_PLAN_VERSION,

          shapeFingerprint: "stale",

          handlers: [() => "route"],
        },
      ),
    ).toThrow("Gelis semantic route plan fingerprint mismatch");
  });

  test("rejects binding count mismatch", async () => {
    const plan = await compileSemanticRoutePlan([
      {
        method: "GET",

        path: "/first",
      },

      {
        method: "GET",

        path: "/second",
      },
    ]);

    const app = new Gelis();

    expect(() =>
      installAotRuntime(
        app,

        plan,

        {
          version: SEMANTIC_ROUTE_PLAN_VERSION,

          shapeFingerprint: plan.shapeFingerprint,

          handlers: [() => "first"],
        },
      ),
    ).toThrow("Gelis semantic route plan route count mismatch");
  });

  test("preserves application wrappers installed before AOT runtime", async () => {
    const events: string[] = [];

    const plan = await compileSemanticRoutePlan([
      {
        method: "GET",

        path: "/route",
      },
    ]);

    const app = new Gelis();

    app.onRequest(() => {
      events.push("request");
    });

    installAotRuntime(
      app,

      plan,

      {
        version: SEMANTIC_ROUTE_PLAN_VERSION,

        shapeFingerprint: plan.shapeFingerprint,

        handlers: [
          () => {
            events.push("handler");

            return "ok";
          },
        ],
      },
    );

    await app.fetch(new Request("http://gelis.test/route"));

    expect(events).toEqual(["request", "handler"]);
  });

  test("allows normal route registration after AOT installation", async () => {
    const plan = await compileSemanticRoutePlan([
      {
        method: "GET",

        path: "/prebuilt",
      },
    ]);

    const app = new Gelis();

    installAotRuntime(
      app,

      plan,

      {
        version: SEMANTIC_ROUTE_PLAN_VERSION,

        shapeFingerprint: plan.shapeFingerprint,

        handlers: [() => "prebuilt"],
      },
    );

    app.get(
      "/normal",

      () => "normal",
    );

    const prebuilt = await app.fetch(new Request("http://gelis.test/prebuilt"));

    const normal = await app.fetch(new Request("http://gelis.test/normal"));

    expect(await prebuilt.text()).toBe("prebuilt");

    expect(await normal.text()).toBe("normal");
  });
});
