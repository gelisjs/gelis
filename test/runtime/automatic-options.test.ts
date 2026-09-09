import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";

describe("automatic OPTIONS semantics", () => {
  test("returns 204 with GET implicit HEAD and automatic OPTIONS", async () => {
    const app = new Gelis();

    app.get("/resource", () => "resource");

    const response = await app.fetch(
      new Request("http://gelis.test/resource", {
        method: "OPTIONS",
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(await response.text()).toBe("");
  });

  test("preserves method-table order and appends synthetic protocol methods deterministically", async () => {
    const app = new Gelis();

    app.post("/resource", () => "post");
    app.get("/resource", () => "get");
    app.route("PURGE", "/resource", () => "purge");

    const response = await app.fetch(
      new Request("http://gelis.test/resource", {
        method: "OPTIONS",
      }),
    );

    expect(response.headers.get("allow")).toBe(
      "POST, GET, HEAD, PURGE, OPTIONS",
    );
  });

  test("prefers an explicit OPTIONS route over automatic OPTIONS", async () => {
    const app = new Gelis();

    app.get("/resource", () => "get");

    app.options(
      "/resource",
      () =>
        new Response("explicit-options", {
          status: 200,

          headers: {
            "x-route": "OPTIONS",
          },
        }),
    );

    const response = await app.fetch(
      new Request("http://gelis.test/resource", {
        method: "OPTIONS",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-route")).toBe("OPTIONS");
    expect(await response.text()).toBe("explicit-options");
  });

  test("prefers ALL over automatic OPTIONS", async () => {
    const app = new Gelis();

    app.get("/resource", () => "get");

    app.all(
      "/resource",
      ({ request }) =>
        new Response(`all:${request.method}`, {
          headers: {
            "x-route": "ALL",
          },
        }),
    );

    const response = await app.fetch(
      new Request("http://gelis.test/resource", {
        method: "OPTIONS",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-route")).toBe("ALL");
    expect(await response.text()).toBe("all:OPTIONS");
  });

  test("builds Allow from every route topology matching the actual pathname", async () => {
    const app = new Gelis();

    app.get("/users/:id", () => "get-user");
    app.post("/users/admin", () => "post-admin");
    app.delete("/users/:id", () => "delete-user");

    const response = await app.fetch(
      new Request("http://gelis.test/users/admin", {
        method: "OPTIONS",
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("allow")).toBe(
      "GET, HEAD, POST, DELETE, OPTIONS",
    );
  });

  test("preserves custom method casing and ordinary ALL wire-token identity", async () => {
    const app = new Gelis();

    app.route("MiXeD-Gelis", "/resource", () => "mixed");
    app.route("ALL", "/resource", () => "ordinary-all");

    const response = await app.fetch(
      new Request("http://gelis.test/resource", {
        method: "OPTIONS",
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("allow")).toBe("MiXeD-Gelis, ALL, OPTIONS");
  });

  test("keeps an OPTIONS request to an unknown pathname as 404", async () => {
    const app = new Gelis();

    app.get("/resource", () => "resource");

    const response = await app.fetch(
      new Request("http://gelis.test/missing", {
        method: "OPTIONS",
      }),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("allow")).toBeNull();
    expect(await response.text()).toBe("Not Found");
  });

  test("runs application onRequest but skips route lifecycle for synthetic OPTIONS", async () => {
    const app = new Gelis();

    const events: string[] = [];

    app.onRequest(() => {
      events.push("onRequest");
    });

    app.get(
      "/resource",
      () => {
        events.push("handler");

        return "resource";
      },
      {
        beforeHandle: () => {
          events.push("beforeHandle");
        },

        afterHandle: () => {
          events.push("afterHandle");
        },
      },
    );

    const response = await app.fetch(
      new Request("http://gelis.test/resource", {
        method: "OPTIONS",
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect(events).toEqual(["onRequest"]);
  });
});
