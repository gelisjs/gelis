import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";

describe("405 Method Not Allowed semantics", () => {
  test("returns 405 with Allow when the pathname exists under another method", async () => {
    const app = new Gelis();

    app.post("/resource", () => "post");

    const response = await app.fetch(
      new Request("http://gelis.test/resource", {
        method: "GET",
      }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST, OPTIONS");
    expect(await response.text()).toBe("Method Not Allowed");
  });

  test("advertises implicit HEAD when GET matches the pathname", async () => {
    const app = new Gelis();

    app.get("/resource", () => "get");

    const response = await app.fetch(
      new Request("http://gelis.test/resource", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
  });

  test("uses actual router topology across static and dynamic routes", async () => {
    const app = new Gelis();

    app.get("/users/:id", () => "get");
    app.post("/users/admin", () => "post");
    app.delete("/users/:id", () => "delete");

    const response = await app.fetch(
      new Request(
        "http://gelis.test/users/admin",

        {
          method: "PATCH",
        },
      ),
    );

    expect(response.status).toBe(405);

    expect(response.headers.get("allow")).toBe(
      "GET, HEAD, POST, DELETE, OPTIONS",
    );
  });

  test("preserves custom method casing and ordinary ALL token in Allow", async () => {
    const app = new Gelis();

    app.route(
      "MiXeD-Gelis",

      "/resource",

      () => "mixed",
    );

    app.route(
      "ALL",

      "/resource",

      () => "ordinary-all",
    );

    const response = await app.fetch(
      new Request(
        "http://gelis.test/resource",

        {
          method: "POST",
        },
      ),
    );

    expect(response.status).toBe(405);

    expect(response.headers.get("allow")).toBe("MiXeD-Gelis, ALL, OPTIONS");
  });

  test("keeps explicit HEAD and OPTIONS in their method-table order", async () => {
    const app = new Gelis();

    app.head("/resource", () => "head");
    app.get("/resource", () => "get");
    app.options("/resource", () => "options");

    const response = await app.fetch(
      new Request(
        "http://gelis.test/resource",

        {
          method: "POST",
        },
      ),
    );

    expect(response.status).toBe(405);

    expect(response.headers.get("allow")).toBe("HEAD, GET, OPTIONS");
  });

  test("lets ALL handle the request instead of generating 405", async () => {
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

  test("keeps an unknown pathname as 404", async () => {
    const app = new Gelis();

    app.get("/resource", () => "get");

    const response = await app.fetch(
      new Request(
        "http://gelis.test/missing",

        {
          method: "POST",
        },
      ),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("allow")).toBeNull();
    expect(await response.text()).toBe("Not Found");
  });

  test("runs onRequest but skips route lifecycle for synthetic 405", async () => {
    const app = new Gelis();

    const events: string[] = [];

    app.onRequest(() => {
      events.push("onRequest");
    });

    app.get(
      "/resource",

      () => {
        events.push("handler");

        return "get";
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
      new Request(
        "http://gelis.test/resource",

        {
          method: "POST",
        },
      ),
    );

    expect(response.status).toBe(405);

    expect(events).toEqual(["onRequest"]);
  });

  test("keeps a HEAD 405 response bodyless", async () => {
    const app = new Gelis();

    app.post("/resource", () => "post");

    const response = await app.fetch(
      new Request(
        "http://gelis.test/resource",

        {
          method: "HEAD",
        },
      ),
    );

    expect(response.status).toBe(405);

    expect(response.headers.get("allow")).toBe("POST, OPTIONS");

    expect(await response.text()).toBe("");
  });
});
