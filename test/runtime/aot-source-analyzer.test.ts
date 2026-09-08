import { describe, expect, test } from "bun:test";

import { analyzeAotSource } from "../../src/tooling/aot-source-analyzer";

describe("Gelis AOT source analyzer", () => {
  test("extracts canonical top-level plain routes", () => {
    const analysis = analyzeAotSource(`
            import { Gelis } from "../../src";

            const prefix = "runtime";

            const app = new Gelis();

            app.get(
              "/health",
              () => prefix + ":health",
            );

            app.post(
              "/users/:id",
              ({ params }) => prefix + ":" + params.id,
            );
          `);

    expect(
      analysis.routes.map((route) => ({
        method: route.method,

        path: route.path,
      })),
    ).toEqual([
      {
        method: "GET",

        path: "/health",
      },

      {
        method: "POST",

        path: "/users/:id",
      },
    ]);

    expect(analysis.routes[0]?.handlerText).toContain('prefix + ":health"');

    expect(analysis.routes[1]?.handlerText).toContain("params.id");
  });

  test("preserves source registration order", () => {
    const analysis = analyzeAotSource(`
            const app = new Gelis();

            app.post("/third", () => 3);
            app.get("/first", () => 1);
            app.delete("/second", () => 2);
          `);

    expect(analysis.routes.map((route) => [route.method, route.path])).toEqual([
      ["POST", "/third"],

      ["GET", "/first"],

      ["DELETE", "/second"],
    ]);
  });

  test("supports every convenience HTTP method including ALL", () => {
    const analysis = analyzeAotSource(`
            const app = new Gelis();

            app.get("/get", () => 1);
            app.post("/post", () => 1);
            app.put("/put", () => 1);
            app.patch("/patch", () => 1);
            app.delete("/delete", () => 1);
            app.options("/options", () => 1);
            app.head("/head", () => 1);
            app.query("/query", () => 1);
            app.all("/all", () => 1);
          `);

    expect(analysis.routes.map((route) => route.method)).toEqual([
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
      "HEAD",
      "QUERY",
      "*",
    ]);
  });

  test("extracts static generic custom methods and preserves identity", () => {
    const analysis = analyzeAotSource(`
            const app = new Gelis();

            app.route(
              "PURGE",
              "/cache",
              () => "purged",
            );

            app.route(
              "PROPFIND",
              "/resource/:id",
              ({ params }) => params.id,
            );

            app.route(
              "MiXeD-Gelis",
              "/mixed",
              () => "mixed",
            );

            app.route(
              "ALL",
              "/ordinary-all-token",
              () => "ordinary",
            );
          `);

    expect(
      analysis.routes.map((route) => ({
        method: route.method,

        path: route.path,
      })),
    ).toEqual([
      {
        method: "PURGE",

        path: "/cache",
      },

      {
        method: "PROPFIND",

        path: "/resource/:id",
      },

      {
        method: "MiXeD-Gelis",

        path: "/mixed",
      },

      {
        method: "ALL",

        path: "/ordinary-all-token",
      },
    ]);

    expect(analysis.routes[0]?.handlerText).toContain('"purged"');

    expect(analysis.routes[1]?.handlerText).toContain("params.id");
  });

  test("rejects dynamic generic route methods", () => {
    expect(() =>
      analyzeAotSource(`
              const app = new Gelis();

              const method = "PURGE";

              app.route(
                method,
                "/cache",
                () => "ok",
              );
            `),
    ).toThrow("route method must be a static string literal");
  });

  test("applies canonical runtime method validation to generic AOT routes", () => {
    expect(() =>
      analyzeAotSource(`
              const app = new Gelis();

              app.route(
                "*",
                "/reserved",
                () => "ok",
              );
            `),
    ).toThrow('HTTP method "*" is reserved for Gelis all-route matching');

    expect(() =>
      analyzeAotSource(`
              const app = new Gelis();

              app.route(
                "TRACE",
                "/forbidden",
                () => "ok",
              );
            `),
    ).toThrow("Forbidden Fetch HTTP method: TRACE");

    expect(() =>
      analyzeAotSource(`
              const app = new Gelis();

              app.route(
                "get",
                "/non-canonical",
                () => "ok",
              );
            `),
    ).toThrow("Non-canonical Fetch-normalized HTTP method: get");

    expect(() =>
      analyzeAotSource(`
              const app = new Gelis();

              app.route(
                "BAD METHOD",
                "/invalid-token",
                () => "ok",
              );
            `),
    ).toThrow('Invalid HTTP method token: "BAD METHOD"');
  });

  test("rejects unsupported generic route argument shapes", () => {
    expect(() =>
      analyzeAotSource(`
              const app = new Gelis();

              app.route(
                "PURGE",
                "/cache",
                {
                  response: schema,
                },
                () => "ok",
              );
            `),
    ).toThrow(
      "AOT v0.1 supports only static method + path + handler routes for app.route()",
    );
  });

  test("rejects dynamic route paths", () => {
    expect(() =>
      analyzeAotSource(`
              const app = new Gelis();

              const path = "/dynamic";

              app.get(path, () => "ok");
            `),
    ).toThrow("route path must be a static string literal");

    expect(() =>
      analyzeAotSource(`
              const app = new Gelis();

              const path = "/dynamic";

              app.route(
                "PURGE",
                path,
                () => "ok",
              );
            `),
    ).toThrow("route path must be a static string literal");
  });

  test("rejects rich route options for v0.1", () => {
    expect(() =>
      analyzeAotSource(`
              const app = new Gelis();

              app.get(
                "/users",
                {
                  query: schema,
                },
                () => "ok",
              );
            `),
    ).toThrow("AOT v0.1 supports only plain path + handler routes");
  });

  test("rejects route refs whose result is consumed", () => {
    expect(() =>
      analyzeAotSource(`
              const app = new Gelis();

              const route =
                app.get(
                  "/users",
                  () => "ok",
                );
            `),
    ).toThrow("route registration must be a top-level expression statement");

    expect(() =>
      analyzeAotSource(`
              const app = new Gelis();

              const route =
                app.route(
                  "PURGE",
                  "/cache",
                  () => "ok",
                );
            `),
    ).toThrow("route registration must be a top-level expression statement");
  });

  test("rejects conditional registration", () => {
    expect(() =>
      analyzeAotSource(`
              const app = new Gelis();

              if (enabled) {
                app.get(
                  "/optional",
                  () => "ok",
                );
              }
            `),
    ).toThrow("route registration must be a top-level expression statement");
  });

  test("rejects nested route registration", () => {
    expect(() =>
      analyzeAotSource(`
              const app = new Gelis();

              function register() {
                app.get(
                  "/nested",
                  () => "ok",
                );
              }

              register();
            `),
    ).toThrow("route registration must be a top-level expression statement");
  });

  test("rejects computed route method access", () => {
    expect(() =>
      analyzeAotSource(`
              const app = new Gelis();

              app["get"](
                "/computed",
                () => "ok",
              );
            `),
    ).toThrow("computed route method access is not supported");

    expect(() =>
      analyzeAotSource(`
              const app = new Gelis();

              app["all"](
                "/computed-all",
                () => "ok",
              );
            `),
    ).toThrow("computed route method access is not supported");

    expect(() =>
      analyzeAotSource(`
              const app = new Gelis();

              app["route"](
                "PURGE",
                "/computed-route",
                () => "ok",
              );
            `),
    ).toThrow("computed route method access is not supported");
  });

  test("requires canonical const Gelis application binding", () => {
    expect(() =>
      analyzeAotSource(`
              let app =
                new Gelis();

              app.get(
                "/route",
                () => "ok",
              );
            `),
    ).toThrow("app must be declared with const");

    expect(() =>
      analyzeAotSource(`
              const app =
                createApplication();

              app.get(
                "/route",
                () => "ok",
              );
            `),
    ).toThrow("app must be initialized directly with new Gelis()");
  });
});
