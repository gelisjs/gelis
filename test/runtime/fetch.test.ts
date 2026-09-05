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
    const Created = createSchema<{
      id: string;
    }>();

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

  test("supports async handlers", async () => {
    const app = new Gelis();

    app.get(
      "/async",

      async () => ({
        ok: true,
      }),
    );

    const response = await app.fetch(new Request("http://gelis.test/async"));

    expect(await response.json()).toEqual({
      ok: true,
    });
  });

  test("ignores query string when matching", async () => {
    const app = new Gelis();

    app.get(
      "/users/:id",

      ({ params }) => ({
        id: params.id,
      }),
    );

    const response = await app.fetch(
      new Request("http://gelis.test/users/123?tab=profile"),
    );

    expect(await response.json()).toEqual({
      id: "123",
    });
  });

  test("matches root URL", async () => {
    const app = new Gelis();

    app.get("/", () => "root");

    const response = await app.fetch(new Request("http://gelis.test"));

    expect(await response.text()).toBe("root");
  });

  test("normalizes null as JSON", async () => {
    const app = new Gelis();

    app.get("/null", () => null);

    const response = await app.fetch(new Request("http://gelis.test/null"));

    expect(response.status).toBe(200);

    expect(await response.json()).toBeNull();
  });

  test("supports text reply.status", async () => {
    const Text = createSchema<string>();

    const app = new Gelis();

    app.get(
      "/created",

      {
        responses: {
          201: Text,
        },
      },

      ({ reply }) => reply.status(201, "created"),
    );

    const response = await app.fetch(new Request("http://gelis.test/created"));

    expect(response.status).toBe(201);

    expect(await response.text()).toBe("created");

    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
  });

  test("decodes dynamic params", async () => {
    const app = new Gelis();

    app.get(
      "/users/:id",

      ({ params }) => ({
        id: params.id,
      }),
    );

    const response = await app.fetch(
      new Request("http://gelis.test/users/hello%20world"),
    );

    expect(await response.json()).toEqual({
      id: "hello world",
    });
  });

  test("does not ignore trailing path segments", async () => {
    const app = new Gelis();

    app.get(
      "/users/:id",

      ({ params }) => ({
        id: params.id,
      }),
    );

    const response = await app.fetch(
      new Request("http://gelis.test/users/123/extra"),
    );

    expect(response.status).toBe(404);
  });

  test("keeps trailing-param routes compatible with deeper dynamic routes", async () => {
    const app = new Gelis();

    app.get(
      "/users/:id",

      ({ params }) => ({
        route: "user",

        id: params.id,
      }),
    );

    app.get(
      "/users/:id/posts/:postId",

      ({ params }) => ({
        route: "post",

        userId: params.id,

        postId: params.postId,
      }),
    );

    const userResponse = await app.fetch(
      new Request("http://gelis.test/users/42"),
    );

    expect(await userResponse.json()).toEqual({
      route: "user",

      id: "42",
    });

    const postResponse = await app.fetch(
      new Request("http://gelis.test/users/42/posts/99"),
    );

    expect(await postResponse.json()).toEqual({
      route: "post",

      userId: "42",

      postId: "99",
    });
  });

  test("preserves trailing-param specificity over generic dynamic fallback", async () => {
    const app = new Gelis();

    /*
     * Register generic route first deliberately.
     * Matching must follow route specificity,
     * not registration order.
     */
    app.get(
      "/:scope/:id",

      ({ params }) => ({
        route: "generic",

        scope: params.scope,

        id: params.id,
      }),
    );

    app.get(
      "/users/:id",

      ({ params }) => ({
        route: "users",

        id: params.id,
      }),
    );

    const response = await app.fetch(
      new Request("http://gelis.test/users/123"),
    );

    expect(await response.json()).toEqual({
      route: "users",

      id: "123",
    });
  });

  test("isolates trailing-param routes by HTTP method", async () => {
    const app = new Gelis();

    app.get(
      "/users/:id",

      ({ params }) => ({
        method: "GET",

        id: params.id,
      }),
    );

    app.post(
      "/users/:id",

      ({ params }) => ({
        method: "POST",

        id: params.id,
      }),
    );

    const getResponse = await app.fetch(
      new Request("http://gelis.test/users/42"),
    );

    expect(await getResponse.json()).toEqual({
      method: "GET",

      id: "42",
    });

    const postResponse = await app.fetch(
      new Request("http://gelis.test/users/42", {
        method: "POST",
      }),
    );

    expect(await postResponse.json()).toEqual({
      method: "POST",

      id: "42",
    });
  });

  test("does not let a root trailing param match the root URL", async () => {
    const app = new Gelis();

    app.get(
      "/:id",

      ({ params }) => ({
        id: params.id,
      }),
    );

    const response = await app.fetch(new Request("http://gelis.test/"));

    expect(response.status).toBe(404);
  });
});

function createSchema<Input = unknown, Output = Input>(): StandardSchemaV1<
  Input,
  Output
> {
  return {
    "~standard": {
      version: 1,

      vendor: "gelis-test",

      validate(value) {
        return {
          value: value as Output,
        };
      },
    },
  } as StandardSchemaV1<Input, Output>;
}
