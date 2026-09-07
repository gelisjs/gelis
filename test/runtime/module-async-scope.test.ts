import { describe, expect, test } from "bun:test";

import {
  Gelis,
  ModuleMountError,
  defineCapability,
  defineModule,
  definePlugin,
} from "../../src";

import type { Capability, ModuleSetupContext } from "../../src";

interface DatabaseClient {
  readonly id: string;
}

describe("async module scope resolution", () => {
  test("keeps async-scoped module routes hidden until app.ready succeeds", async () => {
    let release!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    let resolverCalls = 0;

    const module = defineModule(
      "/async-scope",

      async () => {
        resolverCalls++;

        await gate;

        return {
          value: "ready",
        };
      },

      (route) => ({
        read: route.get("/", (_context, scope) => scope.value),
      }),
    );

    const app = new Gelis();

    app.mount(module);

    expect(resolverCalls).toBe(1);

    const beforeReady = await app.fetch(
      new Request("http://gelis.test/async-scope"),
    );

    expect(beforeReady.status).toBe(503);

    const ready = app.ready();

    const whilePending = await app.fetch(
      new Request("http://gelis.test/async-scope"),
    );

    expect(whilePending.status).toBe(503);

    release();

    await ready;

    const response = await app.fetch(
      new Request("http://gelis.test/async-scope"),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ready");
  });

  test("preserves immediate synchronous resolver behavior before any async boundary", async () => {
    let resolverCalls = 0;

    const module = defineModule(
      "/sync-scope",

      () => {
        resolverCalls++;

        return {
          value: "sync",
        };
      },

      (route) => ({
        read: route.get("/", (_context, scope) => scope.value),
      }),
    );

    const app = new Gelis();

    app.mount(module);

    expect(resolverCalls).toBe(1);

    const response = await app.fetch(
      new Request("http://gelis.test/sync-scope"),
    );

    expect(await response.text()).toBe("sync");
  });

  test("defers a module resolver behind an earlier pending plugin startup", async () => {
    const Database: Capability<DatabaseClient> = defineCapability("database");

    const database = {
      id: "startup-db",
    } satisfies DatabaseClient;

    let release!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const provider = definePlugin(
      "database-provider",

      (setup) => {
        setup.startup(async (startup) => {
          await gate;

          Database.provide(startup, database);
        });
      },
    );

    let resolverCalls = 0;

    const module = defineModule(
      "/plugin-dependent-module",

      (setup) => {
        resolverCalls++;

        return {
          database: Database.require(setup),
        };
      },

      (route) => ({
        read: route.get("/", (_context, scope) => scope.database.id),
      }),
    );

    const app = new Gelis();

    app.use(provider);
    app.mount(module);

    expect(resolverCalls).toBe(0);

    const beforeReady = await app.fetch(
      new Request("http://gelis.test/plugin-dependent-module"),
    );

    expect(beforeReady.status).toBe(503);

    const ready = app.ready();

    await Promise.resolve();

    expect(resolverCalls).toBe(0);

    release();

    await ready;

    expect(resolverCalls).toBe(1);

    const response = await app.fetch(
      new Request("http://gelis.test/plugin-dependent-module"),
    );

    expect(await response.text()).toBe("startup-db");
  });

  test("keeps module setup context active across an async resolver await", async () => {
    const Database: Capability<DatabaseClient> = defineCapability("database");

    const database = {
      id: "primary",
    } satisfies DatabaseClient;

    const app = new Gelis();

    app.use(
      definePlugin(
        "database-provider",

        (setup) => {
          Database.provide(setup, database);
        },
      ),
    );

    let captured: ModuleSetupContext | undefined;

    const module = defineModule(
      "/async-context",

      async (setup) => {
        captured = setup;

        await Promise.resolve();

        return {
          database: Database.require(setup),
        };
      },

      (route) => ({
        read: route.get("/", (_context, scope) => scope.database.id),
      }),
    );

    app.mount(module);

    await app.ready();

    const response = await app.fetch(
      new Request("http://gelis.test/async-context"),
    );

    expect(await response.text()).toBe("primary");

    if (captured === undefined) {
      throw new Error("Expected captured module setup context");
    }

    let inactive: unknown;

    try {
      Database.require(captured);
    } catch (error) {
      inactive = error;
    }

    expect(inactive).toBeInstanceOf(ModuleMountError);

    expect((inactive as ModuleMountError).code).toBe(
      "MODULE_SETUP_CONTEXT_INACTIVE",
    );
  });

  test("rejects ready and exposes no route when async scope resolution fails", async () => {
    const failure = new Error("scope failed");

    const module = defineModule(
      "/async-failure",

      async () => {
        await Promise.resolve();

        throw failure;
      },

      (route) => ({
        read: route.get("/", () => "unreachable"),
      }),
    );

    const app = new Gelis();

    app.mount(module);

    await expect(app.ready()).rejects.toBe(failure);

    const response = await app.fetch(
      new Request("http://gelis.test/async-failure"),
    );

    expect(response.status).toBe(503);

    await expect(app.ready()).rejects.toBe(failure);
  });

  test("stages later module composition behind an async module", async () => {
    let release!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = defineModule(
      "/first-async-module",

      async () => {
        await gate;

        return {
          value: "first",
        };
      },

      (route) => ({
        read: route.get("/", (_context, scope) => scope.value),
      }),
    );

    const second = defineModule(
      "/second-static-module",

      (route) => ({
        read: route.get("/", () => "second"),
      }),
    );

    const app = new Gelis();

    app.mount(first);
    app.mount(second);

    const secondBeforeReady = await app.fetch(
      new Request("http://gelis.test/second-static-module"),
    );

    expect(secondBeforeReady.status).toBe(503);

    const ready = app.ready();

    const secondWhilePending = await app.fetch(
      new Request("http://gelis.test/second-static-module"),
    );

    expect(secondWhilePending.status).toBe(503);

    release();

    await ready;

    const firstResponse = await app.fetch(
      new Request("http://gelis.test/first-async-module"),
    );

    const secondResponse = await app.fetch(
      new Request("http://gelis.test/second-static-module"),
    );

    expect(await firstResponse.text()).toBe("first");
    expect(await secondResponse.text()).toBe("second");
  });

  test("rejects duplicate mount immediately while async scope is pending", () => {
    const module = defineModule(
      "/pending-duplicate",

      async () => ({
        ready: true,
      }),

      (route) => ({
        read: route.get("/", (_context, scope) => scope.ready),
      }),
    );

    const app = new Gelis();

    app.mount(module);

    let thrown: unknown;

    try {
      app.mount(module);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ModuleMountError);

    expect((thrown as ModuleMountError).code).toBe("MODULE_ALREADY_MOUNTED");
  });

  test("keeps synchronous missing dependency failures retryable before async startup", async () => {
    const Database: Capability<DatabaseClient> = defineCapability("database");

    const module = defineModule(
      "/sync-retry",

      (setup) => ({
        database: Database.require(setup),
      }),

      (route) => ({
        read: route.get("/", (_context, scope) => scope.database.id),
      }),
    );

    const app = new Gelis();

    expect(() => app.mount(module)).toThrow(ModuleMountError);

    app.use(
      definePlugin(
        "database-provider",

        (setup) => {
          Database.provide(setup, {
            id: "retry-db",
          });
        },
      ),
    );

    expect(() => app.mount(module)).not.toThrow();

    const response = await app.fetch(
      new Request("http://gelis.test/sync-retry"),
    );

    expect(await response.text()).toBe("retry-db");
  });
});
