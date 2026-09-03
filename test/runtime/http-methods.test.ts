import { describe, expect, test } from "bun:test";

import { Gelis, inspectContract } from "../../src";

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

    const methods = [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
      "HEAD",
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
});
