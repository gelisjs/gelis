import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";
import { GELIS_INTERNAL_RUNTIME } from "../../src/app";
import { Router } from "../../src/runtime/router";

describe("request URL offset routing", () => {
  test("preserves static precedence over trailing dynamic routes", async () => {
    const app = new Gelis();

    app.get("/users/:id", ({ params }) => `dynamic:${params.id}`);
    app.get("/users/me", () => "static");

    const response = await app.fetch(
      new Request("http://gelis.test/users/me?source=test"),
    );

    expect(await response.text()).toBe("static");
  });

  test("bounds trailing params before query strings", async () => {
    const app = new Gelis();

    app.get("/users/:id", ({ params }) => params.id);

    const response = await app.fetch(
      new Request("http://gelis.test/users/value-42?source=test"),
    );

    expect(await response.text()).toBe("value-42");
  });

  test("decodes encoded trailing params", async () => {
    const app = new Gelis();

    app.get("/users/:id", ({ params }) => params.id);

    const response = await app.fetch(
      new Request("https://gelis.test/users/value%2042?source=test"),
    );

    expect(await response.text()).toBe("value 42");
  });

  test("preserves generic multi-param fallback", async () => {
    const app = new Gelis();

    app.get("/teams/:team/users/:id", ({ params }) => ({
      team: params.team,
      id: params.id,
    }));

    const response = await app.fetch(
      new Request("http://gelis.test/teams/core/users/42?source=test"),
    );

    expect(await response.json()).toEqual({ team: "core", id: "42" });
  });

  test("preserves root static routing", async () => {
    const app = new Gelis();

    app.get("/", () => "root");

    const response = await app.fetch(new Request("http://gelis.test/"));

    expect(await response.text()).toBe("root");
  });

  test("falls back for routers without matchRequestUrl", async () => {
    const app = new Gelis();
    const router = new Router();

    const legacyRouter = {
      register: router.register.bind(router),
      registerBatchAtomic: router.registerBatchAtomic.bind(router),
      match: router.match.bind(router),
      matchingMethods: router.matchingMethods.bind(router),
    };

    app[GELIS_INTERNAL_RUNTIME]().installRouter(legacyRouter);
    app.get("/legacy/:id", ({ params }) => params.id);

    const response = await app.fetch(
      new Request("http://gelis.test/legacy/value-42?source=test"),
    );

    expect(await response.text()).toBe("value-42");
  });
});
