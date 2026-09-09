import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";

import type { StandardSchemaV1 } from "../../src";

describe("Gelis input runtime", () => {
  test("keeps plain routes synchronous", () => {
    const app = new Gelis();

    app.get("/health", () => "ok");

    const result = app.fetch(new Request("http://gelis.test/health"));

    expect(result).toBeInstanceOf(Response);
  });

  test("parses and validates query synchronously", async () => {
    const Query = createSchema<
      Record<string, string | string[]>,
      {
        page: number;

        tags: string[];

        query: string;
      }
    >((value) => {
      const input = value as Record<string, string | string[]>;

      if (typeof input.page !== "string" || typeof input.q !== "string") {
        return {
          issues: [
            {
              message: "Invalid query",
            },
          ],
        };
      }

      const tags = Array.isArray(input.tag)
        ? input.tag
        : input.tag === undefined
          ? []
          : [input.tag];

      return {
        value: {
          page: Number(input.page),

          tags,

          query: input.q,
        },
      };
    });

    const app = new Gelis();

    app.get(
      "/search",

      {
        query: Query,
      },

      ({ query }) => query,
    );

    const result = app.fetch(
      new Request("http://gelis.test/search?page=2&tag=a&tag=b&q=hello+world"),
    );

    expect(result).toBeInstanceOf(Response);

    const response = await result;

    expect(await response.json()).toEqual({
      page: 2,

      tags: ["a", "b"],

      query: "hello world",
    });
  });

  test("preserves encoded and repeated query semantics", async () => {
    const Query = createSchema<Record<string, string | string[]>>((value) => ({
      value: value as Record<string, string | string[]>,
    }));

    const app = new Gelis();

    app.get(
      "/encoded-query",
      {
        query: Query,
      },
      ({ query }) => query,
    );

    const response = await app.fetch(
      new Request(
        [
          "http://gelis.test/encoded-query",
          "?hello%20world=foo+bar",
          "&tag=x%2By",
          "&tag=z+q",
          "&token=a=b=c",
        ].join(""),
      ),
    );

    expect(await response.json()).toEqual({
      "hello world": "foo bar",

      tag: ["x+y", "z q"],

      token: "a=b=c",
    });
  });

  test("returns 422 for invalid query", async () => {
    const Query = createSchema<Record<string, string | string[]>>(() => ({
      issues: [
        {
          message: "page is required",

          path: ["page"],
        },
      ],
    }));

    const app = new Gelis();

    app.get(
      "/search",

      {
        query: Query,
      },

      () => "never",
    );

    const response = await app.fetch(new Request("http://gelis.test/search"));

    expect(response.status).toBe(422);

    expect(await response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",

        target: "query",

        issues: [
          {
            message: "page is required",

            path: ["page"],
          },
        ],
      },
    });
  });

  test("supports asynchronous query schemas", async () => {
    const Query = createSchema<
      Record<string, string | string[]>,
      {
        value: string;
      }
    >(async (value) => {
      const input = value as Record<string, string | string[]>;

      const queryValue = input.value;

      if (typeof queryValue !== "string") {
        return {
          issues: [
            {
              message: "value is required",

              path: ["value"],
            },
          ],
        };
      }

      return {
        value: {
          value: queryValue,
        },
      };
    });

    const app = new Gelis();

    app.get(
      "/async-query",

      {
        query: Query,
      },

      ({ query }) => query,
    );

    const result = app.fetch(
      new Request("http://gelis.test/async-query?value=ok"),
    );

    expect(result).toBeInstanceOf(Promise);

    const response = await result;

    expect(await response.json()).toEqual({
      value: "ok",
    });
  });

  test("rejects malformed query encoding", async () => {
    const Query = createSchema<Record<string, string | string[]>>((value) => ({
      value: value as Record<string, string | string[]>,
    }));

    const app = new Gelis();

    app.get(
      "/query",

      {
        query: Query,
      },

      ({ query }) => query,
    );

    const response = await app.fetch(
      new Request("http://gelis.test/query?q=%ZZ"),
    );

    expect(response.status).toBe(400);
  });

  test("parses and validates JSON body", async () => {
    const Body = createSchema<
      {
        name: string;
      },
      {
        name: string;

        normalized: true;
      }
    >((value) => {
      const body = value as {
        name?: unknown;
      };

      if (typeof body.name !== "string") {
        return {
          issues: [
            {
              message: "name must be a string",

              path: ["name"],
            },
          ],
        };
      }

      return {
        value: {
          name: body.name.trim(),

          normalized: true,
        },
      };
    });

    const app = new Gelis();

    app.post(
      "/users",

      {
        body: Body,
      },

      ({ body }) => body,
    );

    const response = await app.fetch(
      new Request(
        "http://gelis.test/users",

        {
          method: "POST",

          headers: {
            "content-type": "application/json",
          },

          body: JSON.stringify({
            name: " Gelis ",
          }),
        },
      ),
    );

    expect(await response.json()).toEqual({
      name: "Gelis",

      normalized: true,
    });
  });

  test("returns 400 for malformed JSON", async () => {
    const Body = createSchema((value) => ({
      value,
    }));

    const app = new Gelis();

    app.post(
      "/body",

      {
        body: Body,
      },

      ({ body }) => body,
    );

    const response = await app.fetch(
      new Request(
        "http://gelis.test/body",

        {
          method: "POST",

          headers: {
            "content-type": "application/json",
          },

          body: "{broken",
        },
      ),
    );

    expect(response.status).toBe(400);
  });

  test("returns 415 for non-JSON body", async () => {
    const Body = createSchema((value) => ({
      value,
    }));

    const app = new Gelis();

    app.post(
      "/body",

      {
        body: Body,
      },

      ({ body }) => body,
    );

    const response = await app.fetch(
      new Request(
        "http://gelis.test/body",

        {
          method: "POST",

          headers: {
            "content-type": "text/plain",
          },

          body: "hello",
        },
      ),
    );

    expect(response.status).toBe(415);
  });

  test("validates query and body together", async () => {
    const Query = createSchema<
      Record<string, string | string[]>,
      {
        limit: number;
      }
    >((value) => {
      const query = value as Record<string, string>;

      return {
        value: {
          limit: Number(query.limit),
        },
      };
    });

    const Body = createSchema<{
      name: string;
    }>((value) => ({
      value: value as {
        name: string;
      },
    }));

    const app = new Gelis();

    app.post(
      "/combined",

      {
        query: Query,

        body: Body,
      },

      ({ query, body }) => ({
        limit: query.limit,

        name: body.name,
      }),
    );

    const response = await app.fetch(
      new Request(
        "http://gelis.test/combined?limit=10",

        {
          method: "POST",

          headers: {
            "content-type": "application/json",
          },

          body: JSON.stringify({
            name: "Gelis",
          }),
        },
      ),
    );

    expect(await response.json()).toEqual({
      limit: 10,

      name: "Gelis",
    });
  });

  test("accepts JSON content type parameters", async () => {
    const Body = createSchema<{
      name: string;
      count: number;
    }>((value) => ({
      value: value as {
        name: string;
        count: number;
      },
    }));

    const app = new Gelis();

    app.post(
      "/body",
      {
        body: Body,
      },
      ({ body }) => body,
    );

    const response = await app.fetch(
      new Request("http://gelis.test/body", {
        method: "POST",

        headers: {
          "content-type": "application/json; charset=utf-8",
        },

        body: JSON.stringify({
          name: "Gelis",
          count: 42,
        }),
      }),
    );

    expect(response.status).toBe(200);

    expect(await response.json()).toEqual({
      name: "Gelis",
      count: 42,
    });
  });

  test("accepts structured JSON media types", async () => {
    const Body = createSchema<{
      name: string;
      count: number;
    }>((value) => ({
      value: value as {
        name: string;
        count: number;
      },
    }));

    const app = new Gelis();

    app.post(
      "/body",
      {
        body: Body,
      },
      ({ body }) => body,
    );

    const response = await app.fetch(
      new Request("http://gelis.test/body", {
        method: "POST",

        headers: {
          "content-type": "application/problem+json",
        },

        body: JSON.stringify({
          name: "Gelis",
          count: 42,
        }),
      }),
    );

    expect(response.status).toBe(200);

    expect(await response.json()).toEqual({
      name: "Gelis",
      count: 42,
    });
  });

  test("accepts explicit JSON body parser metadata", async () => {
    const Body = createSchema<
      {
        name: string;
      },
      {
        name: string;
        normalized: true;
      }
    >((value) => {
      const body = value as {
        name: string;
      };

      return {
        value: {
          name: body.name.trim(),
          normalized: true,
        },
      };
    });

    const app = new Gelis();

    app.post(
      "/explicit-json",
      {
        body: Body,
        bodyParser: "json",
      },
      ({ body }) => body,
    );

    const response = await app.fetch(
      new Request("http://gelis.test/explicit-json", {
        method: "POST",

        headers: {
          "content-type": "application/json",
        },

        body: JSON.stringify({
          name: " Gelis ",
        }),
      }),
    );

    expect(response.status).toBe(200);

    expect(await response.json()).toEqual({
      name: "Gelis",
      normalized: true,
    });
  });

  test("rejects body parser metadata without a body schema", () => {
    const app = new Gelis();

    expect(() => {
      app.post(
        "/missing-body-schema",
        {
          bodyParser: "json",
        },
        () => "never",
      );
    }).toThrow(TypeError);
  });

  test("rejects request body parsers not yet implemented in P9-E3", () => {
    const Body = createSchema((value) => ({
      value,
    }));

    for (const bodyParser of [
      "urlencoded",
      "multipart",
      "arrayBuffer",
    ] as const) {
      const app = new Gelis();

      expect(() => {
        app.post(
          `/${bodyParser}`,
          {
            body: Body,
            bodyParser,
          },
          ({ body }) => body,
        );
      }).toThrow(TypeError);
    }
  });

  test("accepts compiled custom JSON media types", async () => {
    const Body = createSchema<{
      name: string;
    }>((value) => ({
      value: value as {
        name: string;
      },
    }));

    const app = new Gelis();

    app.post(
      "/vendor-json",
      {
        body: Body,

        bodyParser: "json",

        bodyContentTypes: ["application/vnd.gelis+json"],
      },
      ({ body }) => body,
    );

    const response = await app.fetch(
      new Request("http://gelis.test/vendor-json", {
        method: "POST",

        headers: {
          "content-type": "Application/Vnd.Gelis+Json; charset=utf-8",
        },

        body: JSON.stringify({
          name: "Gelis",
        }),
      }),
    );

    expect(response.status).toBe(200);

    expect(await response.json()).toEqual({
      name: "Gelis",
    });
  });

  test("custom body content types replace JSON defaults", async () => {
    const Body = createSchema((value) => ({
      value,
    }));

    const app = new Gelis();

    app.post(
      "/vendor-only",
      {
        body: Body,

        bodyParser: "json",

        bodyContentTypes: ["application/vnd.gelis+json"],
      },
      ({ body }) => body,
    );

    const response = await app.fetch(
      new Request("http://gelis.test/vendor-only", {
        method: "POST",

        headers: {
          "content-type": "application/json",
        },

        body: "{}",
      }),
    );

    expect(response.status).toBe(415);
  });

  test("returns 400 for malformed custom JSON representation", async () => {
    const Body = createSchema((value) => ({
      value,
    }));

    const app = new Gelis();

    app.post(
      "/vendor-malformed",
      {
        body: Body,

        bodyParser: "json",

        bodyContentTypes: ["application/vnd.gelis+json"],
      },
      ({ body }) => body,
    );

    const response = await app.fetch(
      new Request("http://gelis.test/vendor-malformed", {
        method: "POST",

        headers: {
          "content-type": "application/vnd.gelis+json",
        },

        body: "{broken",
      }),
    );

    expect(response.status).toBe(400);
  });

  test("rejects empty request body content type lists", () => {
    const Body = createSchema((value) => ({
      value,
    }));

    const app = new Gelis();

    expect(() => {
      app.post(
        "/empty-content-types",
        {
          body: Body,

          bodyParser: "json",

          bodyContentTypes: [],
        },
        ({ body }) => body,
      );
    }).toThrow(TypeError);
  });

  test("rejects wildcard request body media types", () => {
    const Body = createSchema((value) => ({
      value,
    }));

    const app = new Gelis();

    expect(() => {
      app.post(
        "/wildcard-content-type",
        {
          body: Body,

          bodyParser: "json",

          bodyContentTypes: ["application/*"],
        },
        ({ body }) => body,
      );
    }).toThrow(TypeError);
  });

  test("rejects combined request Content-Type values", async () => {
    const Body = createSchema((value) => ({
      value,
    }));

    const app = new Gelis();

    app.post(
      "/combined-content-type",
      {
        body: Body,
      },
      ({ body }) => body,
    );

    const response = await app.fetch(
      new Request("http://gelis.test/combined-content-type", {
        method: "POST",

        headers: {
          "content-type": "application/json; charset=utf-8, text/plain",
        },

        body: "{}",
      }),
    );

    expect(response.status).toBe(415);
  });

  test("does not treat quoted parameter commas as combined Content-Type", async () => {
    const Body = createSchema((value) => ({
      value,
    }));

    const app = new Gelis();

    app.post(
      "/quoted-comma",
      {
        body: Body,
      },
      ({ body }) => body,
    );

    const response = await app.fetch(
      new Request("http://gelis.test/quoted-comma", {
        method: "POST",

        headers: {
          "content-type": 'application/json; profile="a,b"',
        },

        body: "{}",
      }),
    );

    expect(response.status).toBe(200);
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
