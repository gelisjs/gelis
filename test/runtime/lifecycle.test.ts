import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";

import type { StandardSchemaV1 } from "../../src";

describe("Gelis lifecycle runtime", () => {
  test("keeps synchronous beforeHandle routes synchronous", async () => {
    const events: string[] = [];

    const app = new Gelis();

    app.get(
      "/sync",

      {
        beforeHandle: () => {
          events.push("before");
        },
      },

      () => {
        events.push("handler");

        return "ok";
      },
    );

    const result = app.fetch(new Request("http://gelis.test/sync"));

    expect(result).toBeInstanceOf(Response);

    const response = await result;

    expect(await response.text()).toBe("ok");

    expect(events).toEqual(["before", "handler"]);
  });

  test("supports asynchronous beforeHandle", async () => {
    const events: string[] = [];

    const app = new Gelis();

    app.get(
      "/async",

      {
        beforeHandle: async () => {
          await Promise.resolve();

          events.push("before");
        },
      },

      () => {
        events.push("handler");

        return "ok";
      },
    );

    const result = app.fetch(new Request("http://gelis.test/async"));

    expect(result).toBeInstanceOf(Promise);

    const response = await result;

    expect(await response.text()).toBe("ok");

    expect(events).toEqual(["before", "handler"]);
  });

  test("short-circuits the handler on early response", async () => {
    let handlerCalled = false;

    const app = new Gelis();

    app.get(
      "/blocked",

      {
        beforeHandle: () => {
          return new Response(
            "blocked",

            {
              status: 401,
            },
          );
        },
      },

      () => {
        handlerCalled = true;

        return "handler";
      },
    );

    const response = await app.fetch(new Request("http://gelis.test/blocked"));

    expect(response.status).toBe(401);

    expect(await response.text()).toBe("blocked");

    expect(handlerCalled).toBe(false);
  });

  test("treats falsy non-undefined values as early responses", async () => {
    let handlerCalled = false;

    const app = new Gelis();

    app.get(
      "/false",

      {
        beforeHandle: () => false,
      },

      () => {
        handlerCalled = true;

        return "handler";
      },
    );

    const response = await app.fetch(new Request("http://gelis.test/false"));

    expect(await response.json()).toBe(false);

    expect(handlerCalled).toBe(false);
  });

  test("provides dynamic params to beforeHandle", async () => {
    let capturedId: string | undefined;

    const app = new Gelis();

    app.get(
      "/users/:id",

      {
        beforeHandle: ({ params }) => {
          capturedId = params.id;
        },
      },

      ({ params }) => ({
        id: params.id,
      }),
    );

    const response = await app.fetch(
      new Request("http://gelis.test/users/user-123"),
    );

    expect(capturedId).toBe("user-123");

    expect(await response.json()).toEqual({
      id: "user-123",
    });
  });

  test("runs validation before beforeHandle", async () => {
    const events: string[] = [];

    const Query = createSchema<
      Record<string, string | string[]>,
      {
        page: number;
      }
    >((value) => {
      events.push("validate");

      const query = value as Record<string, string | string[]>;

      if (typeof query.page !== "string") {
        return {
          issues: [
            {
              message: "page is required",
            },
          ],
        };
      }

      return {
        value: {
          page: Number(query.page),
        },
      };
    });

    const app = new Gelis();

    app.get(
      "/validated",

      {
        query: Query,

        beforeHandle: ({ query }) => {
          events.push(`before:${query.page}`);
        },
      },

      ({ query }) => {
        events.push(`handler:${query.page}`);

        return {
          page: query.page,
        };
      },
    );

    const result = app.fetch(
      new Request("http://gelis.test/validated?page=42"),
    );

    expect(result).toBeInstanceOf(Response);

    const response = await result;

    expect(await response.json()).toEqual({
      page: 42,
    });

    expect(events).toEqual(["validate", "before:42", "handler:42"]);
  });

  test("does not run beforeHandle when validation fails", async () => {
    let beforeCalled = false;

    const Query = createSchema<Record<string, string | string[]>>(() => ({
      issues: [
        {
          message: "invalid",
        },
      ],
    }));

    const app = new Gelis();

    app.get(
      "/invalid",

      {
        query: Query,

        beforeHandle: () => {
          beforeCalled = true;
        },
      },

      () => "handler",
    );

    const response = await app.fetch(new Request("http://gelis.test/invalid"));

    expect(response.status).toBe(422);

    expect(beforeCalled).toBe(false);
  });

  test("supports asynchronous early responses", async () => {
    let handlerCalled = false;

    const app = new Gelis();

    app.get(
      "/async-blocked",

      {
        beforeHandle: async () => {
          await Promise.resolve();

          return new Response(
            "async-blocked",

            {
              status: 403,
            },
          );
        },
      },

      () => {
        handlerCalled = true;

        return "handler";
      },
    );

    const response = await app.fetch(
      new Request("http://gelis.test/async-blocked"),
    );

    expect(response.status).toBe(403);

    expect(await response.text()).toBe("async-blocked");

    expect(handlerCalled).toBe(false);
  });
});

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
    },
  } as StandardSchemaV1<Input, Output>;
}
