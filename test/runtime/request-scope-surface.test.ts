import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";

import type { StandardSchemaV1 } from "../../src";

function createSchema<Input = unknown, Output = Input>(
  validate: (
    value: unknown,
  ) =>
    | StandardSchemaV1.Result<Output>
    | Promise<StandardSchemaV1.Result<Output>>,
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

describe("request scope route surface", () => {
  test("supports every convenience HTTP method", async () => {
    const app = new Gelis();

    const routes = app.requestScope(() => ({
      value: "scoped",
    }));

    routes.get("/get", (_context, scope) => scope.value);

    routes.post("/post", (_context, scope) => scope.value);

    routes.put("/put", (_context, scope) => scope.value);

    routes.patch("/patch", (_context, scope) => scope.value);

    routes.delete("/delete", (_context, scope) => scope.value);

    routes.options("/options", (_context, scope) => scope.value);

    routes.head(
      "/head",

      () =>
        new Response(null, {
          status: 204,
        }),
    );

    const cases = [
      ["GET", "/get"],
      ["POST", "/post"],
      ["PUT", "/put"],
      ["PATCH", "/patch"],
      ["DELETE", "/delete"],
      ["OPTIONS", "/options"],
    ] as const;

    for (const [method, path] of cases) {
      const response = await app.fetch(
        new Request(`http://gelis.test${path}`, {
          method,
        }),
      );

      expect(await response.text()).toBe("scoped");
    }

    const head = await app.fetch(
      new Request("http://gelis.test/head", {
        method: "HEAD",
      }),
    );

    expect(head.status).toBe(204);
  });

  test("supports the generic route method", async () => {
    const app = new Gelis();

    const routes = app.requestScope(() => ({
      name: "generic",
    }));

    routes.route(
      "PATCH",
      "/generic/:id",

      (
        { params },

        scope,
      ) => ({
        id: params.id,

        name: scope.name,
      }),
    );

    const response = await app.fetch(
      new Request("http://gelis.test/generic/42", {
        method: "PATCH",
      }),
    );

    expect(await response.json()).toEqual({
      id: "42",

      name: "generic",
    });
  });

  test("derives from validated and transformed query and body values", async () => {
    const Query = createSchema<
      Record<string, string | string[]>,
      {
        page: number;
      }
    >((value) => {
      const input = value as Record<string, string | string[]>;

      if (typeof input.page !== "string") {
        return {
          issues: [
            {
              message: "Invalid page",
            },
          ],
        };
      }

      return {
        value: {
          page: Number(input.page),
        },
      };
    });

    const Body = createSchema<
      {
        name: string;
      },
      {
        normalizedName: string;
      }
    >((value) => {
      const input = value as {
        name: string;
      };

      return {
        value: {
          normalizedName: input.name.trim().toUpperCase(),
        },
      };
    });

    const app = new Gelis();

    let deriveCalls = 0;

    const routes = app.requestScope((context) => {
      deriveCalls++;

      expect(context.query).toEqual({
        page: 2,
      });

      expect(context.body).toEqual({
        normalizedName: "ALICE",
      });

      const query = context.query as {
        page: number;
      };

      const body = context.body as {
        normalizedName: string;
      };

      return {
        identity: `${query.page}:${body.normalizedName}`,
      };
    });

    routes.post(
      "/validated",

      {
        query: Query,

        body: Body,
      },

      (
        { query, body },

        scope,
      ) => ({
        page: query.page,

        name: body.normalizedName,

        identity: scope.identity,
      }),
    );

    const response = await app.fetch(
      new Request("http://gelis.test/validated?page=2", {
        method: "POST",

        headers: {
          "content-type": "application/json",
        },

        body: JSON.stringify({
          name: " alice ",
        }),
      }),
    );

    expect(deriveCalls).toBe(1);

    expect(await response.json()).toEqual({
      page: 2,

      name: "ALICE",

      identity: "2:ALICE",
    });
  });

  test("does not derive request scope when input validation fails", async () => {
    const Query = createSchema<
      Record<string, string | string[]>,
      {
        page: number;
      }
    >((value) => {
      const input = value as Record<string, string | string[]>;

      if (typeof input.page !== "string") {
        return {
          issues: [
            {
              message: "Missing page",
            },
          ],
        };
      }

      return {
        value: {
          page: Number(input.page),
        },
      };
    });

    const app = new Gelis();

    let deriveCalls = 0;
    let handlerCalls = 0;
    let beforeCalls = 0;
    let afterCalls = 0;

    const routes = app.requestScope(() => {
      deriveCalls++;

      return {
        marker: "scope",
      };
    });

    routes.get(
      "/invalid",

      {
        query: Query,
      },

      () => {
        handlerCalls++;

        return "unreachable";
      },

      {
        beforeHandle() {
          beforeCalls++;
        },

        afterHandle() {
          afterCalls++;
        },
      },
    );

    const response = await app.fetch(new Request("http://gelis.test/invalid"));

    expect(response.status).toBe(422);

    expect(deriveCalls).toBe(0);

    expect(beforeCalls).toBe(0);

    expect(handlerCalls).toBe(0);

    expect(afterCalls).toBe(0);
  });

  test("runs validation and global policy before request-scope derivation", async () => {
    const order: string[] = [];

    const Query = createSchema<
      Record<string, string | string[]>,
      {
        page: number;
      }
    >((value) => {
      order.push("input");

      const input = value as Record<string, string | string[]>;

      return {
        value: {
          page: Number(input.page),
        },
      };
    });

    const Output = createSchema<
      {
        page: number;
        scope: string;
      },
      {
        page: number;
        scope: string;
        normalized: true;
      }
    >((value) => {
      order.push("response");

      const input = value as {
        page: number;
        scope: string;
      };

      return {
        value: {
          ...input,

          normalized: true,
        },
      };
    });

    const app = new Gelis();

    const routes = app.requestScope((context) => {
      order.push("derive");

      const query = context.query as {
        page: number;
      };

      return {
        marker: `scope-${query.page}`,
      };
    });

    routes.get(
      "/ordered",

      {
        query: Query,

        responses: {
          200: {
            schema: Output,

            validate: true,
          },
        },
      },

      (
        { query },

        scope,
      ) => {
        order.push("handler");

        return {
          page: query.page,

          scope: scope.marker,
        };
      },

      {
        beforeHandle(_context, scope) {
          order.push(`local-before:${scope.marker}`);
        },

        afterHandle(_context, result, scope) {
          order.push(`local-after:${scope.marker}`);

          expect(result).toEqual({
            page: 3,

            scope: "scope-3",
          });
        },
      },
    );

    /*
     * Add global lifecycle after route registration.
     *
     * This also verifies that lifecycle recompilation
     * preserves the request-scope and response-plan bits.
     */
    app.onBeforeHandle(() => {
      order.push("global-before");
    });

    app.onAfterHandle((_context, result) => {
      const value = result as {
        page: number;
      };

      order.push(`global-after:${value.page}`);
    });

    const response = await app.fetch(
      new Request("http://gelis.test/ordered?page=3"),
    );

    expect(order).toEqual([
      "input",
      "global-before",
      "derive",
      "local-before:scope-3",
      "handler",
      "local-after:scope-3",
      "global-after:3",
      "response",
    ]);

    expect(await response.json()).toEqual({
      page: 3,

      scope: "scope-3",

      normalized: true,
    });
  });

  test("skips request-scope derivation when global beforeHandle short-circuits", async () => {
    const app = new Gelis();

    const order: string[] = [];

    let deriveCalls = 0;
    let localBeforeCalls = 0;
    let handlerCalls = 0;
    let localAfterCalls = 0;
    let globalAfterCalls = 0;

    const routes = app.requestScope(() => {
      deriveCalls++;

      order.push("derive");

      return {
        marker: "scope",
      };
    });

    routes.get(
      "/global-early",

      () => {
        handlerCalls++;

        order.push("handler");

        return "unreachable";
      },

      {
        beforeHandle() {
          localBeforeCalls++;

          order.push("local-before");
        },

        afterHandle() {
          localAfterCalls++;

          order.push("local-after");
        },
      },
    );

    app.onBeforeHandle(async ({ reply }) => {
      order.push("global-before");

      await Promise.resolve();

      return reply.status(401, {
        blocked: true,
      });
    });

    app.onAfterHandle(() => {
      globalAfterCalls++;

      order.push("global-after");
    });

    const response = await app.fetch(
      new Request("http://gelis.test/global-early"),
    );

    expect(response.status).toBe(401);

    expect(await response.json()).toEqual({
      blocked: true,
    });

    expect(order).toEqual(["global-before"]);

    expect(deriveCalls).toBe(0);

    expect(localBeforeCalls).toBe(0);

    expect(handlerCalls).toBe(0);

    expect(localAfterCalls).toBe(0);

    expect(globalAfterCalls).toBe(0);
  });

  test("keeps scoped beforeHandle early results outside the response plan", async () => {
    let responseValidations = 0;
    let handlerCalls = 0;
    let afterCalls = 0;

    const Output = createSchema<{
      name: string;
    }>((value) => {
      responseValidations++;

      return {
        value: value as {
          name: string;
        },
      };
    });

    const app = new Gelis();

    const routes = app.requestScope(() => ({
      marker: "scope",
    }));

    routes.get(
      "/early",

      {
        responses: {
          200: {
            schema: Output,

            validate: true,
          },
        },
      },

      () => {
        handlerCalls++;

        return {
          name: "handler",
        };
      },

      {
        beforeHandle({ reply }, scope) {
          expect(scope.marker).toBe("scope");

          return reply.status(200, {
            name: "early",
          });
        },

        afterHandle() {
          afterCalls++;
        },
      },
    );

    const response = await app.fetch(new Request("http://gelis.test/early"));

    expect(responseValidations).toBe(0);

    expect(handlerCalls).toBe(0);

    expect(afterCalls).toBe(0);

    expect(await response.json()).toEqual({
      name: "early",
    });
  });
});
