import { describe, expect, test } from "bun:test";

import { Gelis, defineModule, definePlugin, inspectContract } from "../../src";

import type { StandardSchemaV1 } from "../../src";

describe("ALL HTTP route semantics", () => {
  test("falls back to ALL for multiple wire methods", async () => {
    const app = new Gelis();

    app.all("/fallback", ({ request }) => `all:${request.method}`);

    for (const method of ["GET", "POST", "PURGE"]) {
      const response = await app.fetch(
        new Request("http://gelis.test/fallback", {
          method,
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.text()).toBe(`all:${method}`);
    }
  });

  test("prefers an exact method route over ALL", async () => {
    const app = new Gelis();

    app.all("/resource/:id", ({ params }) => `all:${params.id}`);

    app.get("/resource/:id", ({ params }) => `get:${params.id}`);

    const getResponse = await app.fetch(
      new Request("http://gelis.test/resource/42"),
    );

    const postResponse = await app.fetch(
      new Request("http://gelis.test/resource/42", {
        method: "POST",
      }),
    );

    expect(await getResponse.text()).toBe("get:42");
    expect(await postResponse.text()).toBe("all:42");
  });

  test("method precedence is stronger than cross-method path specificity", async () => {
    const app = new Gelis();

    app.all("/users/me", () => "all-static");

    app.get("/users/:id", ({ params }) => `get:${params.id}`);

    const response = await app.fetch(new Request("http://gelis.test/users/me"));

    expect(await response.text()).toBe("get:me");
  });

  test("preserves dynamic params through ALL fallback", async () => {
    const app = new Gelis();

    app.all(
      "/teams/:team/users/:id",
      ({ params }) => `${params.team}:${params.id}`,
    );

    const response = await app.fetch(
      new Request("http://gelis.test/teams/core/users/7", {
        method: "PATCH",
      }),
    );

    expect(await response.text()).toBe("core:7");
  });

  test("validates and transforms body input on ALL routes", async () => {
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

    app.all(
      "/validated",
      {
        body: Body,
      },
      ({ body }) => ({
        term: body.term,
        length: body.length,
      }),
    );

    const response = await app.fetch(
      new Request("http://gelis.test/validated", {
        method: "POST",

        headers: {
          "content-type": "application/json",
        },

        body: JSON.stringify({
          term: "gelis",
        }),
      }),
    );

    expect(response.status).toBe(200);

    expect(await response.json()).toEqual({
      term: "gelis",
      length: 5,
    });
  });

  test("allows exact and ALL routes to share one path but rejects duplicate ALL", () => {
    const app = new Gelis();

    app.get("/shared", () => "get");

    app.all("/shared", () => "all");

    expect(() => app.all("/shared", () => "duplicate")).toThrow(
      "Duplicate route: * /shared",
    );
  });

  test("projects ALL through the contract source as the pseudo-method marker", () => {
    const app = new Gelis();

    app.all("/contract", () => "ok");

    expect(inspectContract(app).routes[0]?.method).toBe("*");
  });

  test("serves ALL routes declared by modules and plugins", async () => {
    const module = defineModule("/module", (routes) => ({
      fallback: routes.all("/fallback", () => "module"),
    }));

    const plugin = definePlugin("all-route-runtime", (setup) => {
      setup.routes.all("/plugin/fallback", () => "plugin");
    });

    const app = new Gelis();

    app.mount(module);
    app.use(plugin);

    const moduleResponse = await app.fetch(
      new Request("http://gelis.test/module/fallback", {
        method: "POST",
      }),
    );

    const pluginResponse = await app.fetch(
      new Request("http://gelis.test/plugin/fallback", {
        method: "PATCH",
      }),
    );

    expect(await moduleResponse.text()).toBe("module");
    expect(await pluginResponse.text()).toBe("plugin");
  });

  test("does not install an application fetch wrapper merely for ALL", () => {
    const app = new Gelis();

    app.all("/fallback", () => "ok");

    expect(Object.prototype.hasOwnProperty.call(app, "fetch")).toBe(false);
  });
});
