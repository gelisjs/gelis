import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";

import type { StandardSchemaV1 } from "../../src";

describe("request scope async and error semantics", () => {
  test("keeps the complete synchronous request-scope path synchronous", () => {
    const app = new Gelis();

    const order: string[] = [];

    const routes = app.requestScope(() => {
      order.push("derive");

      return {
        marker: "scope",
      };
    });

    routes.get(
      "/sync",

      (_context, scope) => {
        order.push(`handler:${scope.marker}`);

        return new Response(null, {
          status: 204,
        });
      },

      {
        beforeHandle(_context, scope) {
          order.push(`local-before:${scope.marker}`);
        },

        afterHandle(_context, result, scope) {
          order.push(`local-after:${scope.marker}:${result.status}`);
        },
      },
    );

    app.onBeforeHandle(() => {
      order.push("global-before");
    });

    app.onAfterHandle((_context, result) => {
      /*
       * Global hooks intentionally receive `unknown`
       * because one hook can observe many route result
       * shapes. Narrow at runtime before reading fields.
       */
      expect(result).toBeInstanceOf(Response);

      if (!(result instanceof Response)) {
        throw new Error("Expected Response result");
      }

      order.push(`global-after:${result.status}`);
    });

    app.onError(() => {
      throw new Error("onError must not run");
    });

    const result = app.fetch(new Request("http://gelis.test/sync"));

    expect(isPromiseLike(result)).toBe(false);

    expect(result).toBeInstanceOf(Response);

    expect((result as Response).status).toBe(204);

    expect(order).toEqual([
      "global-before",
      "derive",
      "local-before:scope",
      "handler:scope",
      "local-after:scope:204",
      "global-after:204",
    ]);
  });

  test("waits for asynchronous global policy before deriving request scope", async () => {
    const app = new Gelis();

    const order: string[] = [];

    const routes = app.requestScope(() => {
      order.push("derive");

      return {
        marker: "scope",
      };
    });

    routes.get(
      "/async-global",

      (_context, scope) => {
        order.push(`handler:${scope.marker}`);

        return "ok";
      },
    );

    app.onBeforeHandle(async () => {
      order.push("global-before:start");

      await Promise.resolve();

      order.push("global-before:end");
    });

    const result = app.fetch(new Request("http://gelis.test/async-global"));

    expect(result).toBeInstanceOf(Promise);

    const response = await result;

    expect(await response.text()).toBe("ok");

    expect(order).toEqual([
      "global-before:start",
      "global-before:end",
      "derive",
      "handler:scope",
    ]);
  });

  test("preserves phase order through mixed asynchronous request-scope execution", async () => {
    const app = new Gelis();

    const order: string[] = [];

    const sharedScope = {
      marker: "scope",
    };

    const seenScopes: object[] = [];

    const routes = app.requestScope(async () => {
      order.push("derive:start");

      await Promise.resolve();

      order.push("derive:end");

      return sharedScope;
    });

    routes.get(
      "/mixed",

      async (_context, scope) => {
        seenScopes.push(scope);

        order.push("handler:start");

        await Promise.resolve();

        order.push("handler:end");

        return "ok";
      },

      {
        async beforeHandle(_context, scope) {
          seenScopes.push(scope);

          order.push("local-before:start");

          await Promise.resolve();

          order.push("local-before:end");
        },

        async afterHandle(_context, result, scope) {
          seenScopes.push(scope);

          order.push(`local-after:start:${result}`);

          await Promise.resolve();

          order.push("local-after:end");
        },
      },
    );

    app.onBeforeHandle(() => {
      order.push("global-before");
    });

    app.onAfterHandle(async (_context, result) => {
      order.push(`global-after:start:${result}`);

      await Promise.resolve();

      order.push("global-after:end");
    });

    const result = app.fetch(new Request("http://gelis.test/mixed"));

    expect(result).toBeInstanceOf(Promise);

    const response = await result;

    expect(await response.text()).toBe("ok");

    expect(order).toEqual([
      "global-before",
      "derive:start",
      "derive:end",
      "local-before:start",
      "local-before:end",
      "handler:start",
      "handler:end",
      "local-after:start:ok",
      "local-after:end",
      "global-after:start:ok",
      "global-after:end",
    ]);

    expect(seenScopes).toHaveLength(3);

    expect(seenScopes.every((scope) => scope === sharedScope)).toBe(true);
  });

  test("routes an asynchronous derive rejection through onError and skips downstream phases", async () => {
    const app = new Gelis();

    const marker = new Error("derive rejected");

    const order: string[] = [];

    const routes = app.requestScope(async () => {
      order.push("derive");

      await Promise.resolve();

      throw marker;
    });

    routes.get(
      "/derive-reject",

      () => {
        order.push("handler");

        return "unreachable";
      },

      {
        beforeHandle() {
          order.push("local-before");
        },

        afterHandle() {
          order.push("local-after");
        },
      },
    );

    app.onBeforeHandle(() => {
      order.push("global-before");
    });

    app.onAfterHandle(() => {
      order.push("global-after");
    });

    app.onError(({ error }) => {
      expect(error).toBe(marker);

      order.push("on-error");

      return new Response("handled", {
        status: 591,
      });
    });

    const response = await app.fetch(
      new Request("http://gelis.test/derive-reject"),
    );

    expect(response.status).toBe(591);

    expect(await response.text()).toBe("handled");

    expect(order).toEqual(["global-before", "derive", "on-error"]);
  });

  test("routes an asynchronous local beforeHandle rejection through onError", async () => {
    const app = new Gelis();

    const marker = new Error("local before rejected");

    const order: string[] = [];

    const routes = app.requestScope(() => {
      order.push("derive");

      return {
        marker: "scope",
      };
    });

    routes.get(
      "/before-reject",

      () => {
        order.push("handler");

        return "unreachable";
      },

      {
        async beforeHandle() {
          order.push("local-before");

          await Promise.resolve();

          throw marker;
        },

        afterHandle() {
          order.push("local-after");
        },
      },
    );

    app.onBeforeHandle(() => {
      order.push("global-before");
    });

    app.onAfterHandle(() => {
      order.push("global-after");
    });

    app.onError(({ error }) => {
      expect(error).toBe(marker);

      order.push("on-error");

      return new Response("handled", {
        status: 592,
      });
    });

    const response = await app.fetch(
      new Request("http://gelis.test/before-reject"),
    );

    expect(response.status).toBe(592);

    expect(order).toEqual([
      "global-before",
      "derive",
      "local-before",
      "on-error",
    ]);
  });

  test("routes an asynchronous handler rejection through onError and skips after hooks", async () => {
    const app = new Gelis();

    const marker = new Error("handler rejected");

    const order: string[] = [];

    const routes = app.requestScope(() => ({
      marker: "scope",
    }));

    routes.get(
      "/handler-reject",

      async () => {
        order.push("handler");

        await Promise.resolve();

        throw marker;
      },

      {
        beforeHandle() {
          order.push("local-before");
        },

        afterHandle() {
          order.push("local-after");
        },
      },
    );

    app.onBeforeHandle(() => {
      order.push("global-before");
    });

    app.onAfterHandle(() => {
      order.push("global-after");
    });

    app.onError(({ error }) => {
      expect(error).toBe(marker);

      order.push("on-error");

      return new Response("handled", {
        status: 593,
      });
    });

    const response = await app.fetch(
      new Request("http://gelis.test/handler-reject"),
    );

    expect(response.status).toBe(593);

    expect(order).toEqual([
      "global-before",
      "local-before",
      "handler",
      "on-error",
    ]);
  });

  test("routes an asynchronous local afterHandle rejection through onError and skips global afterHandle", async () => {
    const app = new Gelis();

    const marker = new Error("local after rejected");

    const order: string[] = [];

    const routes = app.requestScope(() => ({
      marker: "scope",
    }));

    routes.get(
      "/after-reject",

      () => {
        order.push("handler");

        return "ok";
      },

      {
        afterHandle: async () => {
          order.push("local-after");

          await Promise.resolve();

          throw marker;
        },
      },
    );

    app.onAfterHandle(() => {
      order.push("global-after");
    });

    app.onError(({ error }) => {
      expect(error).toBe(marker);

      order.push("on-error");

      return new Response("handled", {
        status: 594,
      });
    });

    const response = await app.fetch(
      new Request("http://gelis.test/after-reject"),
    );

    expect(response.status).toBe(594);

    expect(order).toEqual(["handler", "local-after", "on-error"]);
  });

  test("routes an asynchronous global afterHandle rejection through onError before response finalization", async () => {
    const app = new Gelis();

    const marker = new Error("global after rejected");

    const order: string[] = [];

    let responseValidationCalls = 0;

    const Output = createSchema<
      {
        ok: true;
      },
      {
        ok: true;
        serialized: true;
      }
    >((value) => {
      responseValidationCalls++;

      order.push("response");

      return {
        value: {
          ...(value as {
            ok: true;
          }),

          serialized: true,
        },
      };
    });

    const routes = app.requestScope(() => ({
      marker: "scope",
    }));

    routes.get(
      "/global-after-reject",

      {
        responses: {
          200: {
            schema: Output,

            validate: true,
          },
        },
      },

      () => {
        order.push("handler");

        return {
          ok: true as const,
        };
      },
    );

    app.onAfterHandle(async () => {
      order.push("global-after");

      await Promise.resolve();

      throw marker;
    });

    app.onError(({ error }) => {
      expect(error).toBe(marker);

      order.push("on-error");

      return new Response("handled", {
        status: 595,
      });
    });

    const response = await app.fetch(
      new Request("http://gelis.test/global-after-reject"),
    );

    expect(response.status).toBe(595);

    expect(responseValidationCalls).toBe(0);

    expect(order).toEqual(["handler", "global-after", "on-error"]);
  });

  test("treats an asynchronous local beforeHandle early result as control flow rather than an error", async () => {
    const app = new Gelis();

    const order: string[] = [];

    let errorCalls = 0;
    let responseValidationCalls = 0;

    const Output = createSchema<
      {
        ok: true;
      },
      {
        ok: true;
        serialized: true;
      }
    >((value) => {
      responseValidationCalls++;

      order.push("response");

      return {
        value: {
          ...(value as {
            ok: true;
          }),

          serialized: true,
        },
      };
    });

    const routes = app.requestScope(() => {
      order.push("derive");

      return {
        marker: "scope",
      };
    });

    routes.get(
      "/async-early",

      {
        responses: {
          200: {
            schema: Output,

            validate: true,
          },
        },
      },

      () => {
        order.push("handler");

        return {
          ok: true as const,
        };
      },

      {
        async beforeHandle() {
          order.push("local-before:start");

          await Promise.resolve();

          order.push("local-before:end");

          return new Response("early", {
            status: 401,
          });
        },

        afterHandle() {
          order.push("local-after");
        },
      },
    );

    app.onBeforeHandle(() => {
      order.push("global-before");
    });

    app.onAfterHandle(() => {
      order.push("global-after");
    });

    app.onError(() => {
      errorCalls++;

      return new Response("must not run");
    });

    const response = await app.fetch(
      new Request("http://gelis.test/async-early"),
    );

    expect(response.status).toBe(401);

    expect(await response.text()).toBe("early");

    expect(errorCalls).toBe(0);

    expect(responseValidationCalls).toBe(0);

    expect(order).toEqual([
      "global-before",
      "derive",
      "local-before:start",
      "local-before:end",
    ]);
  });
});

function createSchema<Input = unknown, Output = Input>(
  validate: (
    value: unknown,
  ) =>
    StandardSchemaV1.Result<Output> | Promise<StandardSchemaV1.Result<Output>>,
): StandardSchemaV1<Input, Output> {
  return {
    "~standard": {
      version: 1,

      vendor: "gelis-test",

      validate,

      types: {
        input: undefined as Input,

        output: undefined as Output,
      },
    },
  };
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return false;
  }

  return (
    typeof (
      value as {
        then?: unknown;
      }
    ).then === "function"
  );
}
