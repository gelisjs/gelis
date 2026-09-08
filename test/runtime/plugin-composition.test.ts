import { describe, expect, test } from "bun:test";

import {
  defineCapability,
  definePlugin,
  Gelis,
  PluginInstallError,
} from "../../src";

import type { Capability, PluginRouteBuilder } from "../../src";

describe("plugin composition surface", () => {
  test("registers ordinary routes through the plugin route surface", async () => {
    const plugin = definePlugin(
      "health",

      (setup) => {
        setup.routes.get(
          "/plugin-health",

          () => "healthy",
        );

        setup.routes.query(
          "/plugin-query",

          () => "queried",
        );
      },
    );

    const app = new Gelis();

    app.use(plugin);

    const response = await app.fetch(
      new Request("http://gelis.test/plugin-health"),
    );

    const queryResponse = await app.fetch(
      new Request(
        "http://gelis.test/plugin-query",

        {
          method: "QUERY",
        },
      ),
    );

    expect(queryResponse.status).toBe(200);

    expect(await queryResponse.text()).toBe("queried");

    expect(response.status).toBe(200);

    expect(await response.text()).toBe("healthy");
  });

  test("applies plugin global lifecycle to routes registered before inside and after installation", async () => {
    const events: string[] = [];

    const app = new Gelis();

    app.get(
      "/before-plugin",

      () => {
        events.push("before-handler");

        return "before";
      },
    );

    const plugin = definePlugin(
      "lifecycle",

      (setup) => {
        setup.onBeforeHandle(() => {
          events.push("global-before");
        });

        setup.onAfterHandle(() => {
          events.push("global-after");
        });

        setup.routes.get(
          "/inside-plugin",

          () => {
            events.push("inside-handler");

            return "inside";
          },
        );
      },
    );

    app.use(plugin);

    app.get(
      "/after-plugin",

      () => {
        events.push("after-handler");

        return "after";
      },
    );

    await app.fetch(new Request("http://gelis.test/before-plugin"));

    expect(events).toEqual(["global-before", "before-handler", "global-after"]);

    events.length = 0;

    await app.fetch(new Request("http://gelis.test/inside-plugin"));

    expect(events).toEqual(["global-before", "inside-handler", "global-after"]);

    events.length = 0;

    await app.fetch(new Request("http://gelis.test/after-plugin"));

    expect(events).toEqual(["global-before", "after-handler", "global-after"]);
  });

  test("registers onRequest and onError through the plugin surface", async () => {
    const events: string[] = [];

    const original = new Error("plugin-error");

    const plugin = definePlugin(
      "request-error",

      (setup) => {
        setup.onRequest(() => {
          events.push("request");
        });

        setup.onError(({ error }) => {
          events.push("error");

          expect(error).toBe(original);

          return new Response("handled", {
            status: 503,
          });
        });
      },
    );

    const app = new Gelis();

    app.use(plugin);

    app.get(
      "/throws",

      () => {
        throw original;
      },
    );

    const response = await app.fetch(new Request("http://gelis.test/throws"));

    expect(response.status).toBe(503);

    expect(await response.text()).toBe("handled");

    expect(events).toEqual(["request", "error"]);
  });

  test("registers application-scoped plugin routes through the canonical scope builder", async () => {
    const service = {
      value: 42,
    };

    const plugin = definePlugin(
      "scoped-route",

      (setup) => {
        const scoped = setup.scope({
          service,
        });

        scoped.get(
          "/plugin-scope",

          (_context, scope) => scope.service.value,
        );
      },
    );

    const app = new Gelis();

    app.use(plugin);

    const response = await app.fetch(
      new Request("http://gelis.test/plugin-scope"),
    );

    expect(await response.json()).toBe(42);
  });

  test("registers request-scoped plugin routes through the canonical requestScope builder", async () => {
    const plugin = definePlugin(
      "request-scoped-route",

      (setup) => {
        const scoped = setup.requestScope(({ request }) => ({
          user: request.headers.get("x-user") ?? "anonymous",
        }));

        scoped.get(
          "/plugin-profile",

          (_context, scope) => scope.user,
        );
      },
    );

    const app = new Gelis();

    app.use(plugin);

    const response = await app.fetch(
      new Request("http://gelis.test/plugin-profile", {
        headers: {
          "x-user": "alice",
        },
      }),
    );

    expect(await response.text()).toBe("alice");
  });

  test("does not mutate application composition when setup fails", async () => {
    const Missing: Capability<object> = defineCapability("missing");

    let hookCalls = 0;

    const plugin = definePlugin(
      "failing-composition",

      (setup) => {
        setup.onBeforeHandle(() => {
          hookCalls++;
        });

        setup.routes.get(
          "/ghost-route",

          () => "ghost",
        );

        Missing.require(setup);
      },
    );

    const app = new Gelis();

    expect(() => app.use(plugin)).toThrow();

    app.get(
      "/ordinary",

      () => "ordinary",
    );

    const ghost = await app.fetch(new Request("http://gelis.test/ghost-route"));

    const ordinary = await app.fetch(new Request("http://gelis.test/ordinary"));

    expect(ghost.status).toBe(404);

    expect(await ordinary.text()).toBe("ordinary");

    expect(hookCalls).toBe(0);
  });

  test("prevalidates plugin routes so a duplicate does not partially install composition or capabilities", async () => {
    const Service: Capability<object> = defineCapability("service");

    const service = {};

    const app = new Gelis();

    app.get(
      "/existing",

      () => "existing",
    );

    const plugin = definePlugin(
      "duplicate-routes",

      (setup) => {
        Service.provide(setup, service);

        setup.routes.get(
          "/would-be-new",

          () => "new",
        );

        setup.routes.get(
          "/existing",

          () => "duplicate",
        );
      },
    );

    expect(() => app.use(plugin)).toThrow(/Duplicate route: GET \/existing/);

    const newRoute = await app.fetch(
      new Request("http://gelis.test/would-be-new"),
    );

    expect(newRoute.status).toBe(404);

    const consumer = definePlugin(
      "consumer",

      (setup) => {
        Service.require(setup);
      },
    );

    const error = capturePluginInstallError(() => {
      app.use(consumer);
    });

    expect(error.code).toBe("PLUGIN_DEPENDENCY_MISSING");
  });

  test("rejects duplicate route shapes declared inside one plugin before app mutation", async () => {
    const app = new Gelis();

    const plugin = definePlugin(
      "duplicate-shape",

      (setup) => {
        setup.routes.get(
          "/users/:id",

          () => "first",
        );

        setup.routes.get(
          "/users/:name",

          () => "second",
        );
      },
    );

    expect(() => app.use(plugin)).toThrow(
      /Duplicate route: GET \/users\/:name/,
    );

    const response = await app.fetch(
      new Request("http://gelis.test/users/123"),
    );

    expect(response.status).toBe(404);
  });

  test("invalidates a captured plugin route builder after installation", () => {
    let routes: PluginRouteBuilder | undefined;

    const plugin = definePlugin(
      "captured-routes",

      (setup) => {
        routes = setup.routes;
      },
    );

    const app = new Gelis();

    app.use(plugin);

    if (routes === undefined) {
      throw new Error("Expected captured plugin routes");
    }

    const error = capturePluginInstallError(() => {
      routes!.get(
        "/late-route",

        () => "late",
      );
    });

    expect(error.code).toBe("PLUGIN_SETUP_CONTEXT_INACTIVE");
  });

  test("invalidates builders returned by plugin scope methods after installation", () => {
    let registerLateScope: (() => void) | undefined;

    let registerLateRequestScope: (() => void) | undefined;

    const plugin = definePlugin(
      "captured-scopes",

      (setup) => {
        const scoped = setup.scope({
          value: 1,
        });

        const requestScoped = setup.requestScope(() => ({
          value: 1,
        }));

        registerLateScope = () => {
          scoped.get(
            "/late-scope",

            () => "late",
          );
        };

        registerLateRequestScope = () => {
          requestScoped.get(
            "/late-request-scope",

            () => "late",
          );
        };
      },
    );

    const app = new Gelis();

    app.use(plugin);

    if (
      registerLateScope === undefined ||
      registerLateRequestScope === undefined
    ) {
      throw new Error("Expected captured plugin scope registrations");
    }

    const scopedError = capturePluginInstallError(registerLateScope);

    const requestError = capturePluginInstallError(registerLateRequestScope);

    expect(scopedError.code).toBe("PLUGIN_SETUP_CONTEXT_INACTIVE");

    expect(requestError.code).toBe("PLUGIN_SETUP_CONTEXT_INACTIVE");
  });
});

function capturePluginInstallError(run: () => void): PluginInstallError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(PluginInstallError);

    return error as PluginInstallError;
  }

  throw new Error("Expected PluginInstallError");
}
