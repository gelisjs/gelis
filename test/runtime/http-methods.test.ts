import { describe, expect, test } from "bun:test";

import { Gelis, inspectContract } from "../../src";

import type { StandardSchemaV1 } from "../../src";

describe("Gelis HTTP method surface", () => {
  test("routes every supported HTTP method through convenience methods", async () => {
    const app = new Gelis();

    const handler = (method: string) => () =>
      new Response(
        null,

        {
          status: 204,

          headers: {
            "x-gelis-method": method,
          },
        },
      );

    app.get("/methods", handler("GET"));

    app.post("/methods", handler("POST"));

    app.put("/methods", handler("PUT"));

    app.patch("/methods", handler("PATCH"));

    app.delete("/methods", handler("DELETE"));

    app.options("/methods", handler("OPTIONS"));

    app.head("/methods", handler("HEAD"));

    app.query("/methods", handler("QUERY"));

    const methods = [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
      "HEAD",
      "QUERY",
    ] as const;

    for (const method of methods) {
      const response = await app.fetch(
        new Request(
          "http://localhost/methods",

          {
            method,
          },
        ),
      );

      expect(response.status).toBe(204);

      expect(response.headers.get("x-gelis-method")).toBe(method);
    }
  });

  test("preserves options through convenience and generic method registration", () => {
    const app = new Gelis();

    app.delete(
      "/delete/:id",

      {
        openapi: {
          summary: "Delete",
        },
      },

      () =>
        new Response(
          null,

          {
            status: 204,
          },
        ),
    );

    app.route(
      "PATCH",

      "/generic/:id",

      {
        openapi: {
          summary: "Generic patch",
        },
      },

      () =>
        new Response(
          null,

          {
            status: 204,
          },
        ),
    );

    const snapshot = inspectContract(app);

    expect(snapshot.routes).toHaveLength(2);

    expect(snapshot.routes[0]?.method).toBe("DELETE");

    expect(snapshot.routes[0]?.openapi).toEqual({
      summary: "Delete",
    });

    expect(snapshot.routes[1]?.method).toBe("PATCH");

    expect(snapshot.routes[1]?.openapi).toEqual({
      summary: "Generic patch",
    });
  });

  test("preserves QUERY request content through Gelis", async () => {
    const app = new Gelis();

    app.query(
      "/query-body",

      async ({ request }) =>
        Response.json({
          method: request.method,

          body: await request.text(),
        }),
    );

    const payload = JSON.stringify({
      q: "gelis",
    });

    const response = await app.fetch(
      new Request(
        "http://localhost/query-body",

        {
          method: "QUERY",

          headers: {
            "content-type": "application/json",
          },

          body: payload,
        },
      ),
    );

    expect(response.status).toBe(200);

    expect(await response.json()).toEqual({
      method: "QUERY",

      body: payload,
    });
  });

  test("validates and transforms QUERY JSON body through the input plan", async () => {
    const Body: StandardSchemaV1<
      {
        term: string;
      },
      {
        term: string;
        length: number;
      }
    > = {
      "~standard": {
        version: 1,

        vendor: "gelis-test",

        types: {
          input: undefined as unknown as {
            term: string;
          },

          output: undefined as unknown as {
            term: string;
            length: number;
          },
        },

        validate(value) {
          if (
            typeof value !== "object" ||
            value === null ||
            typeof (value as { term?: unknown }).term !== "string"
          ) {
            return {
              issues: [
                {
                  message: "Expected term",
                },
              ],
            };
          }

          const term = (value as { term: string }).term;

          return {
            value: {
              term,

              length: term.length,
            },
          };
        },
      },
    };

    const app = new Gelis();

    app.query(
      "/validated-query",

      {
        body: Body,
      },

      ({ body }) =>
        Response.json({
          term: body.term,

          length: body.length,
        }),
    );

    const response = await app.fetch(
      new Request(
        "http://localhost/validated-query",

        {
          method: "QUERY",

          headers: {
            "content-type": "application/json",
          },

          body: JSON.stringify({
            term: "gelis",
          }),
        },
      ),
    );

    expect(response.status).toBe(200);

    expect(await response.json()).toEqual({
      term: "gelis",

      length: 5,
    });
  });
});
