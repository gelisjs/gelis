import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";

import type { StandardSchemaV1 } from "../../src";

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

describe("application scope route surface", () => {
  test("supports every convenience HTTP method", async () => {
    const app = new Gelis();

    const routes = app.scope({
      value: "scoped",
    });

    routes.get("/get", (_context, scope) => scope.value);

    routes.post("/post", (_context, scope) => scope.value);

    routes.put("/put", (_context, scope) => scope.value);

    routes.patch("/patch", (_context, scope) => scope.value);

    routes.delete("/delete", (_context, scope) => scope.value);

    routes.options("/options", (_context, scope) => scope.value);

    routes.query("/query", (_context, scope) => scope.value);

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
      ["QUERY", "/query"],
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

    const routes = app.scope({
      name: "generic",
    });

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

  test("preserves query and body validation", async () => {
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
        name: string;
      }
    >((value) => ({
      value: value as {
        name: string;
      },
    }));

    const app = new Gelis();

    const routes = app.scope({
      prefix: "ctx",
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

        name: `${scope.prefix}:${body.name}`,
      }),
    );

    const response = await app.fetch(
      new Request("http://gelis.test/validated?page=2", {
        method: "POST",

        headers: {
          "content-type": "application/json",
        },

        body: JSON.stringify({
          name: "alice",
        }),
      }),
    );

    expect(await response.json()).toEqual({
      page: 2,

      name: "ctx:alice",
    });
  });

  test("preserves scoped lifecycle ordering", async () => {
    const app = new Gelis();

    const order: string[] = [];

    const routes = app.scope({
      marker: "scope",
    });

    routes.get(
      "/lifecycle",

      (_context, scope) => {
        order.push(`handler:${scope.marker}`);

        return "ok";
      },

      {
        beforeHandle(_context, scope) {
          order.push(`before:${scope.marker}`);
        },

        afterHandle(_context, result, scope) {
          order.push(`after:${scope.marker}:${result}`);
        },
      },
    );

    const response = await app.fetch(
      new Request("http://gelis.test/lifecycle"),
    );

    expect(await response.text()).toBe("ok");

    expect(order).toEqual(["before:scope", "handler:scope", "after:scope:ok"]);
  });
});
