import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";

describe("request scope", () => {
  test("derives exactly once and shares one scope across local lifecycle", async () => {
    const app = new Gelis();

    const sharedScope = {
      user: {
        id: "user-1",
      },
    };

    let deriveCalls = 0;

    const seenScopes: object[] = [];

    const routes = app.requestScope(({ params }) => {
      deriveCalls++;

      expect(params.id).toBe("42");

      return sharedScope;
    });

    routes.get(
      "/users/:id",

      (
        { params },

        scope,
      ) => {
        seenScopes.push(scope);

        return `${scope.user.id}:${params.id}`;
      },

      {
        beforeHandle(_context, scope) {
          seenScopes.push(scope);
        },

        afterHandle(_context, result, scope) {
          seenScopes.push(scope);

          expect(result).toBe("user-1:42");
        },
      },
    );

    const response = await app.fetch(new Request("http://gelis.test/users/42"));

    expect(await response.text()).toBe("user-1:42");

    expect(deriveCalls).toBe(1);

    expect(seenScopes).toHaveLength(3);

    expect(seenScopes.every((scope) => scope === sharedScope)).toBe(true);
  });

  test("supports asynchronous request derivation", async () => {
    const app = new Gelis();

    let deriveCalls = 0;

    const routes = app.requestScope(async () => {
      deriveCalls++;

      await Promise.resolve();

      return {
        tenant: "alpha",
      };
    });

    routes.get(
      "/tenant",

      (_context, scope) => scope.tenant,
    );

    const result = app.fetch(new Request("http://gelis.test/tenant"));

    expect(result).toBeInstanceOf(Promise);

    const response = await result;

    expect(await response.text()).toBe("alpha");

    expect(deriveCalls).toBe(1);
  });

  test("preserves global and local lifecycle ordering", async () => {
    const app = new Gelis();

    const order: string[] = [];

    const routes = app.requestScope(() => ({
      marker: "scope",
    }));

    routes.get(
      "/ordered",

      (_context, scope) => {
        order.push(`handler:${scope.marker}`);

        return "ok";
      },

      {
        beforeHandle(_context, scope) {
          order.push(`local-before:${scope.marker}`);
        },

        afterHandle(_context, result, scope) {
          order.push(`local-after:${scope.marker}:${result}`);
        },
      },
    );

    app.onBeforeHandle(() => {
      order.push("global-before");
    });

    app.onAfterHandle((_context, result) => {
      order.push(`global-after:${result}`);
    });

    const response = await app.fetch(new Request("http://gelis.test/ordered"));

    expect(await response.text()).toBe("ok");

    expect(order).toEqual([
      "global-before",
      "local-before:scope",
      "handler:scope",
      "local-after:scope:ok",
      "global-after:ok",
    ]);
  });

  test("routes derive failures through onError", async () => {
    const app = new Gelis();

    const marker = new Error("request scope failed");

    app.onError(({ error }) => {
      if (error !== marker) {
        return undefined;
      }

      return new Response("handled", {
        status: 555,
      });
    });

    const routes = app.requestScope(() => {
      throw marker;
    });

    routes.get("/failure", () => "unreachable");

    const response = await app.fetch(new Request("http://gelis.test/failure"));

    expect(response.status).toBe(555);

    expect(await response.text()).toBe("handled");
  });
});
