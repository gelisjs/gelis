import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";

import type { StandardSchemaV1 } from "../../src";

describe("Gelis lifecycle runtime", () => {
  test("keeps synchronous beforeHandle routes synchronous", async () => {
    const events: string[] = [];

    const app = new Gelis();

    app.get(
      "/sync",

      () => {
        events.push("handler");

        return "ok";
      },

      {
        beforeHandle: () => {
          events.push("before");
        },
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

      () => {
        events.push("handler");

        return "ok";
      },

      {
        beforeHandle: async () => {
          await Promise.resolve();

          events.push("before");
        },
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

      () => {
        handlerCalled = true;

        return "handler";
      },

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

      () => {
        handlerCalled = true;

        return "handler";
      },

      {
        beforeHandle: () => false,
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

      ({ params }) => ({
        id: params.id,
      }),

      {
        beforeHandle: ({ params }) => {
          capturedId = params.id;
        },
      },
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
      },

      ({ query }) => {
        events.push(`handler:${query.page}`);

        return {
          page: query.page,
        };
      },

      {
        beforeHandle: ({ query }) => {
          events.push(`before:${query.page}`);
        },
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
      },

      () => "handler",

      {
        beforeHandle: () => {
          beforeCalled = true;
        },
      },
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

      () => {
        handlerCalled = true;

        return "handler";
      },

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
    );

    const response = await app.fetch(
      new Request("http://gelis.test/async-blocked"),
    );

    expect(response.status).toBe(403);

    expect(await response.text()).toBe("async-blocked");

    expect(handlerCalled).toBe(false);
  });

  test("keeps synchronous afterHandle routes synchronous", async () => {
    const events: string[] = [];

    const app = new Gelis();

    app.get(
      "/after-sync",

      () => {
        events.push("handler");

        return "ok";
      },

      {
        afterHandle: () => {
          events.push("after");
        },
      },
    );

    const result = app.fetch(new Request("http://gelis.test/after-sync"));

    expect(result).toBeInstanceOf(Response);

    const response = await result;

    expect(await response.text()).toBe("ok");

    expect(events).toEqual(["handler", "after"]);
  });

  test("supports asynchronous afterHandle", async () => {
    const events: string[] = [];

    const app = new Gelis();

    app.get(
      "/after-async",

      () => {
        events.push("handler");

        return "ok";
      },

      {
        afterHandle: async () => {
          await Promise.resolve();

          events.push("after");
        },
      },
    );

    const result = app.fetch(new Request("http://gelis.test/after-async"));

    expect(result).toBeInstanceOf(Promise);

    const response = await result;

    expect(await response.text()).toBe("ok");

    expect(events).toEqual(["handler", "after"]);
  });

  test("passes raw handler result to afterHandle", async () => {
    let observed: unknown;

    const app = new Gelis();

    app.get(
      "/after-result",

      () => ({
        value: 42,
      }),

      {
        afterHandle: (_context, result) => {
          observed = result;
        },
      },
    );

    const response = await app.fetch(
      new Request("http://gelis.test/after-result"),
    );

    expect(observed).toEqual({
      value: 42,
    });

    expect(await response.json()).toEqual({
      value: 42,
    });
  });

  test("runs beforeHandle, handler, and afterHandle in phase order", async () => {
    const events: string[] = [];

    const app = new Gelis();

    app.get(
      "/phases",

      () => {
        events.push("handler");

        return "ok";
      },

      {
        beforeHandle: () => {
          events.push("before");
        },

        afterHandle: () => {
          events.push("after");
        },
      },
    );

    const result = app.fetch(new Request("http://gelis.test/phases"));

    expect(result).toBeInstanceOf(Response);

    const response = await result;

    expect(await response.text()).toBe("ok");

    expect(events).toEqual(["before", "handler", "after"]);
  });

  test("does not run afterHandle when beforeHandle short-circuits", async () => {
    let handlerCalled = false;
    let afterCalled = false;

    const app = new Gelis();

    app.get(
      "/early",

      () => {
        handlerCalled = true;

        return "handler";
      },

      {
        beforeHandle: () => {
          return new Response(
            "early",

            {
              status: 401,
            },
          );
        },

        afterHandle: () => {
          afterCalled = true;
        },
      },
    );

    const response = await app.fetch(new Request("http://gelis.test/early"));

    expect(response.status).toBe(401);

    expect(await response.text()).toBe("early");

    expect(handlerCalled).toBe(false);

    expect(afterCalled).toBe(false);
  });

  test("runs full validated lifecycle in order", async () => {
    const events: string[] = [];

    const Query = createSchema<
      Record<string, string | string[]>,
      {
        value: number;
      }
    >((raw) => {
      events.push("validate");

      const query = raw as Record<string, string | string[]>;

      return {
        value: {
          value: Number(query.value),
        },
      };
    });

    const app = new Gelis();

    app.get(
      "/full",

      {
        query: Query,
      },

      ({ query }) => {
        events.push(`handler:${query.value}`);

        return {
          value: query.value,
        };
      },

      {
        beforeHandle: ({ query }) => {
          events.push(`before:${query.value}`);
        },

        afterHandle: ({ query }, result) => {
          events.push(`after:${query.value}:${result.value}`);
        },
      },
    );

    const response = await app.fetch(
      new Request("http://gelis.test/full?value=7"),
    );

    expect(await response.json()).toEqual({
      value: 7,
    });

    expect(events).toEqual(["validate", "before:7", "handler:7", "after:7:7"]);
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
