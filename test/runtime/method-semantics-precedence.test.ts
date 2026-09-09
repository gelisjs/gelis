import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";

describe("HTTP method semantic precedence", () => {
  test("uses explicit HEAD before ALL and implicit GET", async () => {
    const app = new Gelis();

    app.get("/resource", () => "get");

    app.all(
      "/resource",

      () => "all",
    );

    app.head(
      "/resource",

      () =>
        new Response(
          "head",

          {
            headers: {
              "x-route": "HEAD",
            },
          },
        ),
    );

    const response = await app.fetch(
      new Request(
        "http://gelis.test/resource",

        {
          method: "HEAD",
        },
      ),
    );

    expect(response.status).toBe(200);

    expect(response.headers.get("x-route")).toBe("HEAD");

    expect(await response.text()).toBe("");
  });

  test("uses ALL before implicit HEAD to GET", async () => {
    const app = new Gelis();

    app.get(
      "/resource",

      () =>
        new Response(
          "get",

          {
            headers: {
              "x-route": "GET",
            },
          },
        ),
    );

    app.all(
      "/resource",

      () =>
        new Response(
          "all",

          {
            headers: {
              "x-route": "ALL",
            },
          },
        ),
    );

    const response = await app.fetch(
      new Request(
        "http://gelis.test/resource",

        {
          method: "HEAD",
        },
      ),
    );

    expect(response.status).toBe(200);

    expect(response.headers.get("x-route")).toBe("ALL");

    expect(await response.text()).toBe("");
  });

  test("uses implicit HEAD to GET before 405", async () => {
    const app = new Gelis();

    app.get(
      "/resource",

      () =>
        new Response(
          "get",

          {
            headers: {
              "x-route": "GET",
            },
          },
        ),
    );

    app.post("/resource", () => "post");

    const response = await app.fetch(
      new Request(
        "http://gelis.test/resource",

        {
          method: "HEAD",
        },
      ),
    );

    expect(response.status).toBe(200);

    expect(response.headers.get("x-route")).toBe("GET");

    expect(await response.text()).toBe("");
  });

  test("uses explicit OPTIONS before ALL and automatic OPTIONS", async () => {
    const app = new Gelis();

    app.get("/resource", () => "get");

    app.all(
      "/resource",

      () => "all",
    );

    app.options(
      "/resource",

      () =>
        new Response(
          "explicit-options",

          {
            headers: {
              "x-route": "OPTIONS",
            },
          },
        ),
    );

    const response = await app.fetch(
      new Request(
        "http://gelis.test/resource",

        {
          method: "OPTIONS",
        },
      ),
    );

    expect(response.status).toBe(200);

    expect(response.headers.get("x-route")).toBe("OPTIONS");

    expect(await response.text()).toBe("explicit-options");
  });

  test("uses ALL before automatic OPTIONS", async () => {
    const app = new Gelis();

    app.get("/resource", () => "get");

    app.all(
      "/resource",

      () =>
        new Response(
          "all-options",

          {
            headers: {
              "x-route": "ALL",
            },
          },
        ),
    );

    const response = await app.fetch(
      new Request(
        "http://gelis.test/resource",

        {
          method: "OPTIONS",
        },
      ),
    );

    expect(response.status).toBe(200);

    expect(response.headers.get("x-route")).toBe("ALL");

    expect(await response.text()).toBe("all-options");
  });

  test("uses automatic OPTIONS before 405", async () => {
    const app = new Gelis();

    app.get("/resource", () => "get");
    app.post("/resource", () => "post");

    const response = await app.fetch(
      new Request(
        "http://gelis.test/resource",

        {
          method: "OPTIONS",
        },
      ),
    );

    expect(response.status).toBe(204);

    expect(response.headers.get("allow")).toBe("GET, HEAD, POST, OPTIONS");

    expect(await response.text()).toBe("");
  });

  test("uses ALL before 405 for an otherwise unsupported method", async () => {
    const app = new Gelis();

    app.get("/resource", () => "get");

    app.all(
      "/resource",

      ({ request }) => `all:${request.method}`,
    );

    const response = await app.fetch(
      new Request(
        "http://gelis.test/resource",

        {
          method: "DELETE",
        },
      ),
    );

    expect(response.status).toBe(200);

    expect(await response.text()).toBe("all:DELETE");
  });

  test("uses 405 when the pathname exists but no exact ALL or implicit semantic route handles it", async () => {
    const app = new Gelis();

    app.get("/resource", () => "get");
    app.post("/resource", () => "post");

    const response = await app.fetch(
      new Request(
        "http://gelis.test/resource",

        {
          method: "DELETE",
        },
      ),
    );

    expect(response.status).toBe(405);

    expect(response.headers.get("allow")).toBe("GET, HEAD, POST, OPTIONS");

    expect(await response.text()).toBe("Method Not Allowed");
  });

  test("uses 404 only when no route topology matches the pathname", async () => {
    const app = new Gelis();

    app.get("/resource", () => "get");
    app.post("/resource", () => "post");

    const response = await app.fetch(
      new Request(
        "http://gelis.test/missing",

        {
          method: "DELETE",
        },
      ),
    );

    expect(response.status).toBe(404);

    expect(response.headers.get("allow")).toBeNull();

    expect(await response.text()).toBe("Not Found");
  });

  test("keeps application onRequest stronger than synthesized method semantics", async () => {
    const app = new Gelis();

    app.get("/resource", () => "get");

    app.onRequest(({ request }) => {
      if (request.headers.get("x-short-circuit") === "yes") {
        return new Response(
          "early",

          {
            status: 418,

            headers: {
              "x-route": "onRequest",
            },
          },
        );
      }

      return undefined;
    });

    const response = await app.fetch(
      new Request(
        "http://gelis.test/resource",

        {
          method: "DELETE",

          headers: {
            "x-short-circuit": "yes",
          },
        },
      ),
    );

    expect(response.status).toBe(418);

    expect(response.headers.get("x-route")).toBe("onRequest");

    expect(await response.text()).toBe("early");
  });
});
