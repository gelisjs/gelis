import { describe, expect, test } from "bun:test";

import { Gelis, inspectContract } from "../../src";

import { GELIS_INTERNAL_RUNTIME } from "../../src/app";

import { Router } from "../../src/runtime/router";

import { RUNTIME_ROUTE_PLAIN } from "../../src/runtime/types";

import type {
  RuntimeRouteHandler,
  RuntimeRouteRecord,
} from "../../src/runtime/types";

describe("Gelis prebuilt runtime installation", () => {
  test("serves prebuilt routes", async () => {
    const app = new Gelis();

    const routes = [
      plainRoute(
        "GET",

        "/health",

        () => "prebuilt:health",
      ),

      plainRoute(
        "GET",

        "/users/:id",

        ({ params }) => `prebuilt:user:${params.id}`,
      ),

      plainRoute(
        "GET",

        "/users/:id/details",

        ({ params }) => `prebuilt:details:${params.id}`,
      ),
    ];

    installPrebuilt(app, routes);

    expect(await text(app, "/health")).toBe("prebuilt:health");

    expect(await text(app, "/users/42")).toBe("prebuilt:user:42");

    expect(await text(app, "/users/42/details")).toBe("prebuilt:details:42");
  });

  test("projects prebuilt routes through the contract source", () => {
    const app = new Gelis();

    const routes = [
      plainRoute(
        "GET",

        "/first",

        () => "first",
      ),

      plainRoute(
        "POST",

        "/second/:id",

        () => "second",
      ),
    ];

    installPrebuilt(app, routes);

    const contract = inspectContract(app);

    expect(contract.routes).toHaveLength(2);

    expect(contract.routes.map((route) => [route.method, route.path])).toEqual([
      ["GET", "/first"],

      ["POST", "/second/:id"],
    ]);
  });

  test("allows normal route registration after prebuilt installation", async () => {
    const app = new Gelis();

    const routes = [
      plainRoute(
        "GET",

        "/prebuilt",

        () => "prebuilt",
      ),
    ];

    installPrebuilt(app, routes);

    app.get(
      "/later",

      () => "later",
    );

    expect(await text(app, "/prebuilt")).toBe("prebuilt");

    expect(await text(app, "/later")).toBe("later");

    const contract = inspectContract(app);

    expect(contract.routes.map((route) => route.path)).toEqual([
      "/prebuilt",
      "/later",
    ]);
  });

  test("rejects prebuilt installation after normal route registration", () => {
    const app = new Gelis();

    app.get(
      "/existing",

      () => "existing",
    );

    const routes = [
      plainRoute(
        "GET",

        "/prebuilt",

        () => "prebuilt",
      ),
    ];

    const router = buildRouter(routes);

    expect(() =>
      app[GELIS_INTERNAL_RUNTIME]().installPrebuiltRuntime(
        router,

        routes,
      ),
    ).toThrow("Cannot install Gelis prebuilt runtime after route registration");
  });

  test("rejects plain prebuilt installation after global lifecycle registration", () => {
    const beforeApp = new Gelis();

    beforeApp.onBeforeHandle(() => {});

    const beforeRoutes = [
      plainRoute(
        "GET",

        "/prebuilt",

        () => "prebuilt",
      ),
    ];

    expect(() =>
      beforeApp[GELIS_INTERNAL_RUNTIME]().installPrebuiltRuntime(
        buildRouter(beforeRoutes),

        beforeRoutes,
      ),
    ).toThrow(
      "Cannot install Gelis plain prebuilt runtime after lifecycle registration",
    );

    const afterApp = new Gelis();

    afterApp.onAfterHandle(() => {});

    const afterRoutes = [
      plainRoute(
        "GET",

        "/prebuilt",

        () => "prebuilt",
      ),
    ];

    expect(() =>
      afterApp[GELIS_INTERNAL_RUNTIME]().installPrebuiltRuntime(
        buildRouter(afterRoutes),

        afterRoutes,
      ),
    ).toThrow(
      "Cannot install Gelis plain prebuilt runtime after lifecycle registration",
    );
  });

  test("applies global lifecycle added after prebuilt installation", async () => {
    const events: string[] = [];

    const app = new Gelis();

    const routes = [
      plainRoute(
        "GET",

        "/route",

        () => {
          events.push("handler");

          return "ok";
        },
      ),
    ];

    installPrebuilt(app, routes);

    app.onBeforeHandle(() => {
      events.push("global-before");
    });

    app.onAfterHandle(() => {
      events.push("global-after");
    });

    expect(await text(app, "/route")).toBe("ok");

    expect(events).toEqual(["global-before", "handler", "global-after"]);
  });

  test("preserves application hooks installed before prebuilt runtime", async () => {
    const events: string[] = [];

    const app = new Gelis();

    app.onRequest(() => {
      events.push("on-request");
    });

    const routes = [
      plainRoute(
        "GET",

        "/route",

        () => {
          events.push("handler");

          return "ok";
        },
      ),
    ];

    installPrebuilt(app, routes);

    expect(await text(app, "/route")).toBe("ok");

    expect(events).toEqual(["on-request", "handler"]);
  });

  test("keeps normal Gelis route registration unchanged", async () => {
    const app = new Gelis();

    app.get(
      "/normal",

      () => "normal",
    );

    expect(await text(app, "/normal")).toBe("normal");
  });
});

function installPrebuilt(
  app: Gelis,

  routes: RuntimeRouteRecord[],
): void {
  const router = buildRouter(routes);

  app[GELIS_INTERNAL_RUNTIME]().installPrebuiltRuntime(
    router,

    routes,
  );
}

function buildRouter(routes: readonly RuntimeRouteRecord[]): Router {
  const router = new Router();

  for (const route of routes) {
    router.register(route);
  }

  return router;
}

function plainRoute(
  method: RuntimeRouteRecord["method"],

  path: string,

  handler: RuntimeRouteHandler,
): RuntimeRouteRecord {
  return {
    method,

    path,

    handler,

    flags: RUNTIME_ROUTE_PLAIN,

    input: undefined,

    beforeHandle: undefined,

    afterHandle: undefined,

    responses: undefined,
  };
}

async function text(
  app: Gelis,

  pathname: string,
): Promise<string> {
  const response = await app.fetch(new Request(`http://localhost${pathname}`));

  return response.text();
}
