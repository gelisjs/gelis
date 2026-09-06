import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";

describe("application context", () => {
  test("delivers application scope to a scoped route", async () => {
    const app = new Gelis();

    const scope = {
      db: {
        name: "primary",
      },

      logger: {
        level: "info",
      },
    };

    const routes = app.context(scope);

    routes.get(
      "/users/:id",

      (
        { params },

        context,
      ) => ({
        id: params.id,

        database: context.db.name,

        level: context.logger.level,
      }),
    );

    const response = await app.fetch(new Request("http://gelis.test/users/42"));

    expect(response.status).toBe(200);

    expect(await response.json()).toEqual({
      id: "42",

      database: "primary",

      level: "info",
    });
  });

  test("keeps separate application scopes isolated", async () => {
    const app = new Gelis();

    const first = app.context({
      name: "first",
    });

    const second = app.context({
      name: "second",
    });

    first.get(
      "/first",

      (_context, scope) => scope.name,
    );

    second.get(
      "/second",

      (_context, scope) => scope.name,
    );

    const firstResponse = await app.fetch(
      new Request("http://gelis.test/first"),
    );

    const secondResponse = await app.fetch(
      new Request("http://gelis.test/second"),
    );

    expect(await firstResponse.text()).toBe("first");

    expect(await secondResponse.text()).toBe("second");
  });

  test("keeps the application scope as a shared reference", async () => {
    const app = new Gelis();

    const scope = {
      counter: {
        value: 1,
      },
    };

    const routes = app.context(scope);

    routes.get(
      "/counter",

      (_context, context) => context.counter.value,
    );

    scope.counter.value = 7;

    const response = await app.fetch(new Request("http://gelis.test/counter"));

    expect(await response.json()).toBe(7);
  });

  test("does not affect ordinary routes", async () => {
    const app = new Gelis();

    app
      .context({
        service: "unused",
      })
      .get(
        "/scoped",

        (_context, scope) => scope.service,
      );

    app.get(
      "/plain",

      () => "plain",
    );

    const response = await app.fetch(new Request("http://gelis.test/plain"));

    expect(await response.text()).toBe("plain");
  });
});
