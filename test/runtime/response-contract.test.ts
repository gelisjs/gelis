import { describe, expect, test } from "bun:test";

import { defineModule, Gelis, ResponseContractError } from "../../src";

import type { StandardSchemaV1 } from "../../src";

describe("Gelis response contract runtime", () => {
  test("validates and transforms handler output synchronously", async () => {
    const Output = createSchema<
      {
        name: string;
      },
      {
        name: string;
        normalized: true;
      }
    >((value) => {
      const input = value as {
        name: string;
      };

      return {
        value: {
          name: input.name.trim(),

          normalized: true,
        },
      };
    });

    const app = new Gelis();

    app.get(
      "/validated",

      {
        responses: {
          200: {
            schema: Output,

            validate: true,
          },
        },
      },

      () => ({
        name: " Gelis ",
      }),
    );

    const result = app.fetch(new Request("http://gelis.test/validated"));

    /*
     * A synchronous response validator must not
     * force a synchronous route into Promise mode.
     */
    expect(result).toBeInstanceOf(Response);

    if (!(result instanceof Response)) {
      throw new Error("Expected synchronous Response");
    }

    expect(await result.json()).toEqual({
      name: "Gelis",

      normalized: true,
    });
  });

  test("supports asynchronous response validation through app fetch", async () => {
    const Output = createSchema<
      {
        name: string;
      },
      {
        name: string;
        normalized: true;
      }
    >(async (value) => {
      const input = value as {
        name: string;
      };

      return {
        value: {
          name: input.name.trim(),

          normalized: true,
        },
      };
    });

    const app = new Gelis();

    app.get(
      "/async-response",

      {
        responses: {
          200: {
            schema: Output,

            validate: true,
          },
        },
      },

      () => ({
        name: " Gelis ",
      }),
    );

    const result = app.fetch(new Request("http://gelis.test/async-response"));

    expect(result).not.toBeInstanceOf(Response);

    const response = await result;

    expect(await response.json()).toEqual({
      name: "Gelis",

      normalized: true,
    });
  });

  test("keeps raw Response as a complete response-plan bypass", () => {
    let validations = 0;

    const Output = createSchema<{
      id: string;
    }>((value) => {
      validations++;

      return {
        value: value as {
          id: string;
        },
      };
    });

    const raw = new Response(
      "raw-response",

      {
        status: 202,
      },
    );

    const app = new Gelis();

    app.get(
      "/raw",

      {
        responses: {
          200: {
            schema: Output,

            validate: true,
          },
        },
      },

      () => raw,
    );

    const response = app.fetch(new Request("http://gelis.test/raw"));

    expect(response).toBe(raw);

    expect(validations).toBe(0);
  });

  test("keeps beforeHandle early results outside the response plan", async () => {
    let validations = 0;

    const Output = createSchema<
      {
        name: string;
      },
      {
        name: string;
        normalized: true;
      }
    >((value) => {
      validations++;

      const input = value as {
        name: string;
      };

      return {
        value: {
          name: input.name,

          normalized: true,
        },
      };
    });

    const app = new Gelis();

    app.get(
      "/early",

      {
        responses: {
          200: {
            schema: Output,

            validate: true,
          },
        },
      },

      () => ({
        name: "handler",
      }),

      {
        beforeHandle: ({ reply }) =>
          reply.status(200, {
            name: "early",

            normalized: true,
          }),
      },
    );

    const response = await app.fetch(new Request("http://gelis.test/early"));

    expect(validations).toBe(0);

    expect(await response.json()).toEqual({
      name: "early",

      normalized: true,
    });
  });

  test("uses explicit JSON serialization in routed execution", async () => {
    const Text = createSchema<string>();

    const app = new Gelis();

    app.get(
      "/json-string",

      {
        responses: {
          200: {
            schema: Text,

            serialize: "json",

            contentType: "application/problem+json",
          },
        },
      },

      () => "hello",
    );

    const response = await app.fetch(
      new Request("http://gelis.test/json-string"),
    );

    expect(response.headers.get("content-type")).toBe(
      "application/problem+json",
    );

    expect(await response.text()).toBe('"hello"');
  });

  test("routes response-contract failures through onError without re-entering the plan", async () => {
    const Output = createSchema<{
      id: string;
    }>(() => ({
      issues: [
        {
          message: "Invalid server output",
        },
      ],
    }));

    const app = new Gelis();

    app.onError(({ error }) => {
      if (error instanceof ResponseContractError) {
        return {
          handled: true,

          kind: error.kind,

          status: error.status,
        };
      }

      return undefined;
    });

    app.get(
      "/broken-output",

      {
        responses: {
          200: {
            schema: Output,

            validate: true,
          },
        },
      },

      () => ({
        id: "invalid",
      }),
    );

    const response = await app.fetch(
      new Request("http://gelis.test/broken-output"),
    );

    expect(response.status).toBe(200);

    expect(await response.json()).toEqual({
      handled: true,

      kind: "validation",

      status: 200,
    });
  });

  test("runs input, beforeHandle, handler, afterHandle, then response finalization", async () => {
    const order: string[] = [];

    const Query = createSchema<
      Record<string, string | string[]>,
      {
        page: number;
      }
    >((value) => {
      order.push("input");

      const query = value as Record<string, string>;

      return {
        value: {
          page: Number(query.page),
        },
      };
    });

    const Output = createSchema<
      {
        page: number;
      },
      {
        page: number;
        normalized: true;
      }
    >((value) => {
      order.push("response");

      const input = value as {
        page: number;
      };

      return {
        value: {
          page: input.page,

          normalized: true,
        },
      };
    });

    const app = new Gelis();

    app.get(
      "/full",

      {
        query: Query,

        responses: {
          200: {
            schema: Output,

            validate: true,
          },
        },
      },

      ({ query }) => {
        order.push("handler");

        return {
          page: query.page,
        };
      },

      {
        beforeHandle: () => {
          order.push("before");

          return undefined;
        },

        afterHandle: () => {
          order.push("after");
        },
      },
    );

    const response = await app.fetch(
      new Request("http://gelis.test/full?page=2"),
    );

    expect(order).toEqual(["input", "before", "handler", "after", "response"]);

    expect(await response.json()).toEqual({
      page: 2,

      normalized: true,
    });
  });

  test("preserves the response flag when global lifecycle is compiled later", async () => {
    const order: string[] = [];

    const Output = createSchema<
      {
        name: string;
      },
      {
        name: string;
        normalized: true;
      }
    >((value) => {
      order.push("response");

      const input = value as {
        name: string;
      };

      return {
        value: {
          name: input.name,

          normalized: true,
        },
      };
    });

    const app = new Gelis();

    app.get(
      "/global-after",

      {
        responses: {
          200: {
            schema: Output,

            validate: true,
          },
        },
      },

      () => ({
        name: "Gelis",
      }),
    );

    /*
     * This recompiles effective lifecycle flags
     * after the executable response plan already
     * exists.
     */
    app.onAfterHandle(() => {
      order.push("after");
    });

    const response = await app.fetch(
      new Request("http://gelis.test/global-after"),
    );

    expect(order).toEqual(["after", "response"]);

    expect(await response.json()).toEqual({
      name: "Gelis",

      normalized: true,
    });
  });

  test("preserves executable response plans through module mounting", async () => {
    const Output = createSchema<
      {
        name: string;
      },
      {
        name: string;
        normalized: true;
      }
    >((value) => {
      const input = value as {
        name: string;
      };

      return {
        value: {
          name: input.name.trim(),
          normalized: true,
        },
      };
    });

    const module = defineModule(
      "/api",

      (route) => ({
        user: route.get(
          "/module-response",

          {
            responses: {
              200: {
                schema: Output,
                validate: true,
              },
            },
          },

          () => ({
            name: " Gelis ",
          }),
        ),
      }),
    );

    const app = new Gelis();

    app.mount(module);

    const response = await app.fetch(
      new Request("http://gelis.test/api/module-response"),
    );

    expect(await response.json()).toEqual({
      name: "Gelis",
      normalized: true,
    });
  });

  test("supports explicit 205 and 304 inside an executable response plan", async () => {
    const Output = createSchema<{
      ok: boolean;
    }>();

    const app = new Gelis();

    app.get(
      "/reset-content",

      {
        responses: {
          200: {
            schema: Output,
            validate: true,
          },

          205: undefined,
        },
      },

      ({ reply }) => reply.status(205),
    );

    app.get(
      "/not-modified",

      {
        responses: {
          200: {
            schema: Output,
            validate: true,
          },

          304: undefined,
        },
      },

      ({ reply }) => reply.status(304),
    );

    const reset = await app.fetch(
      new Request("http://gelis.test/reset-content"),
    );

    expect(reset.status).toBe(205);
    expect(await reset.text()).toBe("");

    const notModified = await app.fetch(
      new Request("http://gelis.test/not-modified"),
    );

    expect(notModified.status).toBe(304);
    expect(await notModified.text()).toBe("");
  });

  test("routes explicit JSON serialization failures through onError", async () => {
    const BigIntValue = createSchema<bigint>();

    const app = new Gelis();

    app.onError(({ error }) => {
      if (error instanceof ResponseContractError) {
        return {
          kind: error.kind,
          status: error.status,
          hasCause: error.cause !== undefined,
        };
      }

      return undefined;
    });

    app.get(
      "/json-failure",

      {
        responses: {
          200: {
            schema: BigIntValue,
            serialize: "json",
          },
        },
      },

      () => 1n,
    );

    const response = await app.fetch(
      new Request("http://gelis.test/json-failure"),
    );

    expect(await response.json()).toEqual({
      kind: "serialization",
      status: 200,
      hasCause: true,
    });
  });

  test("preserves asynchronous validator rejection identity through onError", async () => {
    const failure = new Error("response validator exploded");

    const Output = createSchema<{
      id: string;
    }>(async () => {
      throw failure;
    });

    const app = new Gelis();

    app.onError(({ error }) => ({
      sameError: error === failure,
    }));

    app.get(
      "/async-validator-failure",

      {
        responses: {
          200: {
            schema: Output,
            validate: true,
          },
        },
      },

      () => ({
        id: "user-1",
      }),
    );

    const response = await app.fetch(
      new Request("http://gelis.test/async-validator-failure"),
    );

    expect(await response.json()).toEqual({
      sameError: true,
    });
  });

  test("rejects undeclared managed statuses at runtime on executable routes", async () => {
    const Output = createSchema<{
      id: string;
    }>();

    const app = new Gelis();

    app.onError(({ error }) => {
      if (error instanceof ResponseContractError) {
        return {
          kind: error.kind,
          status: error.status,
        };
      }

      return undefined;
    });

    app.get(
      "/undeclared-status",

      {
        responses: {
          200: {
            schema: Output,
            validate: true,
          },
        },
      },

      ({ reply }) => {
        /*
         * Deliberately simulate JavaScript / unsafe
         * consumer code bypassing the TypeScript API.
         */
        const unsafeReply = reply as unknown as {
          status(status: number, body: unknown): never;
        };

        return unsafeReply.status(201, {
          id: "user-1",
        });
      },
    );

    const response = await app.fetch(
      new Request("http://gelis.test/undeclared-status"),
    );

    expect(await response.json()).toEqual({
      kind: "status",
      status: 201,
    });
  });
});

function createSchema<Input = unknown, Output = Input>(
  validate: (
    value: unknown,
  ) =>
    | StandardSchemaV1.Result<Output>
    | Promise<StandardSchemaV1.Result<Output>> = (value) => ({
    value: value as Output,
  }),
): StandardSchemaV1<Input, Output> {
  return {
    "~standard": {
      version: 1,

      vendor: "gelis-test",

      validate,
    },
  } as StandardSchemaV1<Input, Output>;
}
