import { describe, expect, test } from "bun:test";

import { Gelis, defineCapability, defineModule, definePlugin } from "../../src";

import type { Capability } from "../../src";

import {
  createAotAppSession,
  createAotBuildAppSession,
} from "../../src/tooling/aot-app";

import { compileRouterSnapshot } from "../../src/tooling/router-snapshot-compiler";

interface DatabaseClient {
  readonly id: string;
}

describe("AOT startup safety", () => {
  test("captures plugin and scoped-module route shape without acquiring runtime resources", async () => {
    const Database: Capability<DatabaseClient> = defineCapability("database");

    const database = {
      id: "runtime-db",
    } satisfies DatabaseClient;

    let startupCalls = 0;
    let resolverCalls = 0;

    const plugin = definePlugin(
      "database-provider",

      (setup) => {
        setup.routes.get(
          "/plugin-route",

          () => "plugin",
        );

        setup.startup(async (startup) => {
          startupCalls++;

          await Promise.resolve();

          Database.provide(startup, database);
        });
      },
    );

    const module = defineModule(
      "/scoped-module",

      async (setup) => {
        resolverCalls++;

        await Promise.resolve();

        return {
          database: Database.require(setup),
        };
      },

      (route) => ({
        read: route.get(
          "/",

          (_context, scope) => scope.database.id,
        ),
      }),
    );

    /*
     * Build-time capture:
     *
     * declaration shape must be available, but no startup callback
     * or module scope resolver may execute.
     */
    const build = createAotBuildAppSession();

    build.app.use(plugin);
    build.app.mount(module);

    expect(startupCalls).toBe(0);
    expect(resolverCalls).toBe(0);

    const buildRoutes = build.collectRoutes();

    expect(buildRoutes.map((route) => route.path)).toEqual([
      "/plugin-route",
      "/scoped-module",
    ]);

    /*
     * Even an accidental ready() on the capture application must not
     * execute runtime resource acquisition because no startup work was
     * queued during build capture.
     */
    await build.app.ready();

    expect(startupCalls).toBe(0);
    expect(resolverCalls).toBe(0);

    const snapshot = compileRouterSnapshot(buildRoutes);

    /*
     * Runtime replay:
     *
     * normal startup semantics are preserved. The module resolver is
     * ordered behind the startup-produced database capability.
     */
    const runtime = createAotAppSession();

    runtime.app.use(plugin);
    runtime.app.mount(module);

    expect(startupCalls).toBe(0);
    expect(resolverCalls).toBe(0);

    await runtime.app.ready();

    expect(startupCalls).toBe(1);
    expect(resolverCalls).toBe(1);

    runtime.hydrate(snapshot);

    const pluginResponse = await runtime.app.fetch(
      new Request("http://gelis.test/plugin-route"),
    );

    expect(pluginResponse.status).toBe(200);
    expect(await pluginResponse.text()).toBe("plugin");

    const moduleResponse = await runtime.app.fetch(
      new Request("http://gelis.test/scoped-module"),
    );

    expect(moduleResponse.status).toBe(200);
    expect(await moduleResponse.text()).toBe("runtime-db");
  });

  test("keeps normal Gelis independent from AOT capture state", async () => {
    const app = new Gelis();

    app.get("/plain", () => "plain");

    const response = await app.fetch(new Request("http://gelis.test/plain"));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("plain");
  });
});
