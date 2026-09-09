import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";

describe("HEAD HTTP semantics", () => {
  test("falls back from HEAD to GET while preserving the original Request method", async () => {
    const app = new Gelis();

    let observedMethod: string | undefined;

    app.get("/resource", ({ request }) => {
      observedMethod = request.method;

      return new Response("representation", {
        headers: {
          "content-length": "14",
          "x-route": "GET",
        },
      });
    });

    const response = await app.fetch(
      new Request("http://gelis.test/resource", {
        method: "HEAD",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-route")).toBe("GET");
    expect(response.headers.get("content-length")).toBe("14");
    expect(await response.text()).toBe("");
    expect(observedMethod).toBe("HEAD");
  });

  test("prefers an explicit HEAD route over GET", async () => {
    const app = new Gelis();

    const events: string[] = [];

    app.get("/resource", () => {
      events.push("GET");

      return "get-body";
    });

    app.head("/resource", ({ request }) => {
      events.push(`HEAD:${request.method}`);

      return new Response("head-body", {
        headers: {
          "x-route": "HEAD",
        },
      });
    });

    const response = await app.fetch(
      new Request("http://gelis.test/resource", {
        method: "HEAD",
      }),
    );

    expect(response.headers.get("x-route")).toBe("HEAD");
    expect(await response.text()).toBe("");
    expect(events).toEqual(["HEAD:HEAD"]);
  });

  test("keeps ALL precedence stronger than implicit GET fallback", async () => {
    const app = new Gelis();

    const events: string[] = [];

    app.get("/resource", () => {
      events.push("GET");

      return "get-body";
    });

    app.all("/resource", ({ request }) => {
      events.push(`ALL:${request.method}`);

      return new Response("all-body", {
        headers: {
          "x-route": "ALL",
        },
      });
    });

    const response = await app.fetch(
      new Request("http://gelis.test/resource", {
        method: "HEAD",
      }),
    );

    expect(response.headers.get("x-route")).toBe("ALL");
    expect(await response.text()).toBe("");
    expect(events).toEqual(["ALL:HEAD"]);
  });

  test("preserves dynamic params through implicit GET fallback", async () => {
    const app = new Gelis();

    app.get(
      "/users/:id",
      ({ request, params }) =>
        new Response(`${request.method}:${params.id}`, {
          headers: {
            "x-id": params.id,
          },
        }),
    );

    const response = await app.fetch(
      new Request("http://gelis.test/users/42", {
        method: "HEAD",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-id")).toBe("42");
    expect(await response.text()).toBe("");
  });

  test("suppresses asynchronous GET fallback responses", async () => {
    const app = new Gelis();

    app.get("/async", async ({ request }) => {
      await Promise.resolve();

      return new Response(`async:${request.method}`, {
        headers: {
          "x-route": "async-get",
        },
      });
    });

    const response = await app.fetch(
      new Request("http://gelis.test/async", {
        method: "HEAD",
      }),
    );

    expect(response.headers.get("x-route")).toBe("async-get");
    expect(await response.text()).toBe("");
  });

  test("suppresses route lifecycle early responses", async () => {
    const app = new Gelis();

    let handlerCalls = 0;

    app.get(
      "/guarded",
      () => {
        handlerCalls++;

        return "handler";
      },
      {
        beforeHandle: () =>
          new Response("blocked", {
            status: 401,

            headers: {
              "x-phase": "before",
            },
          }),
      },
    );

    const response = await app.fetch(
      new Request("http://gelis.test/guarded", {
        method: "HEAD",
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("x-phase")).toBe("before");
    expect(await response.text()).toBe("");
    expect(handlerCalls).toBe(0);
  });

  test("suppresses onRequest early responses before routing", async () => {
    const app = new Gelis();

    let handlerCalls = 0;

    app.onRequest(({ request }) => {
      if (request.method === "HEAD") {
        return new Response("early", {
          status: 202,

          headers: {
            "x-phase": "on-request",
          },
        });
      }
    });

    app.get("/resource", () => {
      handlerCalls++;

      return "handler";
    });

    const response = await app.fetch(
      new Request("http://gelis.test/resource", {
        method: "HEAD",
      }),
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("x-phase")).toBe("on-request");
    expect(await response.text()).toBe("");
    expect(handlerCalls).toBe(0);
  });

  test("suppresses onError handled responses", async () => {
    const app = new Gelis();

    const failure = new Error("boom");

    app.onError(({ request, error }) => {
      expect(request.method).toBe("HEAD");
      expect(error).toBe(failure);

      return new Response("handled", {
        status: 500,

        headers: {
          "x-phase": "on-error",
        },
      });
    });

    app.get("/error", () => {
      throw failure;
    });

    const response = await app.fetch(
      new Request("http://gelis.test/error", {
        method: "HEAD",
      }),
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("x-phase")).toBe("on-error");
    expect(await response.text()).toBe("");
  });

  test("returns a bodyless HEAD 404", async () => {
    const app = new Gelis();

    const response = await app.fetch(
      new Request("http://gelis.test/missing", {
        method: "HEAD",
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });

  test("returns a bodyless HEAD startup-gate response", async () => {
    const app = new Gelis();

    app.get("/resource", () => "resource");

    await app.close();

    const response = await app.fetch(
      new Request("http://gelis.test/resource", {
        method: "HEAD",
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("");
  });
});
