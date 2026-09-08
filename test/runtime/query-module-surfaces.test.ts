import { describe, expect, test } from "bun:test";

import { Gelis, defineModule } from "../../src";

describe("QUERY module route surfaces", () => {
  test("serves QUERY through static module routes", async () => {
    const module = defineModule(
      "/static-query",

      (routes) => ({
        query: routes.query(
          "/:id",

          ({ params }) => `static:${params.id}`,
        ),
      }),
    );

    const app = new Gelis();

    app.mount(module);

    const response = await app.fetch(
      new Request(
        "http://gelis.test/static-query/42",

        {
          method: "QUERY",
        },
      ),
    );

    expect(response.status).toBe(200);

    expect(await response.text()).toBe("static:42");
  });

  test("serves QUERY through scoped module routes", async () => {
    const module = defineModule(
      "/scoped-query",

      () => ({
        marker: "scope",
      }),

      (routes) => ({
        query: routes.query(
          "/:id",

          (
            { params },

            scope,
          ) => `${scope.marker}:${params.id}`,
        ),
      }),
    );

    const app = new Gelis();

    app.mount(module);

    const response = await app.fetch(
      new Request(
        "http://gelis.test/scoped-query/42",

        {
          method: "QUERY",
        },
      ),
    );

    expect(response.status).toBe(200);

    expect(await response.text()).toBe("scope:42");
  });

  test("serves QUERY through module request-scope routes", async () => {
    let derives = 0;

    const module = defineModule(
      "/request-query",

      (routes) => {
        const requestScope = routes.requestScope(() => ({
          sequence: ++derives,
        }));

        return {
          query: requestScope.query(
            "/:id",

            (
              { params },

              scope,
            ) => `${params.id}:${scope.sequence}`,
          ),
        };
      },
    );

    const app = new Gelis();

    app.mount(module);

    const first = await app.fetch(
      new Request(
        "http://gelis.test/request-query/a",

        {
          method: "QUERY",
        },
      ),
    );

    const second = await app.fetch(
      new Request(
        "http://gelis.test/request-query/b",

        {
          method: "QUERY",
        },
      ),
    );

    expect(await first.text()).toBe("a:1");

    expect(await second.text()).toBe("b:2");

    expect(derives).toBe(2);
  });
});
