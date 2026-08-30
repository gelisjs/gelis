import { describe, expect, test } from "bun:test";

import { Gelis, defineModule } from "../../src";

import type { StandardSchemaV1 } from "../../src";

describe("Gelis runtime", () => {
  test("matches static routes", async () => {
    const app = new Gelis();

    app.get(
      "/health",

      () => ({
        status: "ok",
      }),
    );

    const response = await app.fetch(new Request("http://gelis.test/health"));

    expect(response.status).toBe(200);

    expect(await response.json()).toEqual({
      status: "ok",
    });
  });

  test("matches dynamic params", async () => {
    const app = new Gelis();

    app.get(
      "/users/:id",

      ({ params }) => ({
        id: params.id,
      }),
    );

    const response = await app.fetch(
      new Request("http://gelis.test/users/123"),
    );

    expect(await response.json()).toEqual({
      id: "123",
    });
  });

  test("prefers static routes", async () => {
    const app = new Gelis();

    app.get(
      "/users/:id",

      ({ params }) => ({
        kind: "dynamic",

        id: params.id,
      }),
    );

    app.get(
      "/users/me",

      () => ({
        kind: "static",
      }),
    );

    const response = await app.fetch(new Request("http://gelis.test/users/me"));

    expect(await response.json()).toEqual({
      kind: "static",
    });
  });

  test("falls back from dead static branch", async () => {
    const app = new Gelis();

    app.get(
      "/a/:id/x",

      () => ({
        route: "first",
      }),
    );

    app.get(
      "/:scope/b/y",

      ({ params }) => ({
        route: "fallback",

        scope: params.scope,
      }),
    );

    const response = await app.fetch(new Request("http://gelis.test/a/b/y"));

    expect(await response.json()).toEqual({
      route: "fallback",

      scope: "a",
    });
  });

  test("mounts module routes", async () => {
    const users = defineModule(
      "/users",

      (route) => ({
        find: route.get(
          "/:id",

          ({ params }) => ({
            id: params.id,
          }),
        ),
      }),
    );

    const app = new Gelis();

    app.mount(users);

    const response = await app.fetch(new Request("http://gelis.test/users/42"));

    expect(await response.json()).toEqual({
      id: "42",
    });
  });

  test("returns 404", async () => {
    const app = new Gelis();

    const response = await app.fetch(new Request("http://gelis.test/missing"));

    expect(response.status).toBe(404);
  });

  test("normalizes strings", async () => {
    const app = new Gelis();

    app.get("/text", () => "hello");

    const response = await app.fetch(new Request("http://gelis.test/text"));

    expect(response.status).toBe(200);

    expect(await response.text()).toBe("hello");
  });

  test("normalizes undefined to 204", async () => {
    const app = new Gelis();

    app.get("/empty", () => undefined);

    const response = await app.fetch(new Request("http://gelis.test/empty"));

    expect(response.status).toBe(204);
  });

  test("passes Response through", async () => {
    const app = new Gelis();

    app.get(
      "/raw",

      () =>
        new Response("raw", {
          status: 202,
        }),
    );

    const response = await app.fetch(new Request("http://gelis.test/raw"));

    expect(response.status).toBe(202);

    expect(await response.text()).toBe("raw");
  });

  test("supports reply.status", async () => {
    const Created = {} as StandardSchemaV1<{
      id: string;
    }>;

    const app = new Gelis();

    app.post(
      "/users",

      {
        responses: {
          201: Created,
        },
      },

      ({ reply }) =>
        reply.status(201, {
          id: "user-1",
        }),
    );

    const response = await app.fetch(
      new Request("http://gelis.test/users", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(201);

    expect(await response.json()).toEqual({
      id: "user-1",
    });
  });

  test("rejects duplicate static routes", () => {
    const app = new Gelis();

    app.get("/duplicate", () => null);

    expect(() => {
      app.get("/duplicate", () => null);
    }).toThrow("Duplicate route");
  });

  test("rejects equivalent dynamic routes", () => {
    const app = new Gelis();

    app.get("/users/:id", () => null);

    expect(() => {
      app.get("/users/:userId", () => null);
    }).toThrow("Duplicate route");
  });
});
