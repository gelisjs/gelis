import { describe, expect, test } from "bun:test";

import {
  defineCapability,
  definePlugin,
  Gelis,
  PluginInstallError,
} from "../../src";

import { MISSING_CAPABILITY, readInstalledCapability } from "../../src/plugin";

import type { Capability, PluginStartupContext } from "../../src";

interface DatabaseClient {
  readonly name: string;
}

describe("plugin startup lifecycle", () => {
  test("runs explicit plugin startup only through app.ready and only once", async () => {
    let startupCalls = 0;

    const plugin = definePlugin(
      "startup-counter",

      (setup) => {
        setup.startup(async () => {
          await Promise.resolve();

          startupCalls++;
        });
      },
    );

    const app = new Gelis();

    app.use(plugin);

    expect(startupCalls).toBe(0);

    const first = app.ready();
    const second = app.ready();

    expect(second).toBe(first);

    await first;

    expect(startupCalls).toBe(1);

    await app.ready();

    expect(startupCalls).toBe(1);
  });

  test("keeps plugin composition hidden until startup succeeds", async () => {
    let release!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const plugin = definePlugin(
      "delayed-route",

      (setup) => {
        setup.routes.get(
          "/delayed",

          () => "ready",
        );

        setup.startup(() => gate);
      },
    );

    const app = new Gelis();

    app.use(plugin);

    const beforeReady = await app.fetch(
      new Request("http://gelis.test/delayed"),
    );

    expect(beforeReady.status).toBe(404);

    const ready = app.ready();

    await Promise.resolve();

    const whilePending = await app.fetch(
      new Request("http://gelis.test/delayed"),
    );

    expect(whilePending.status).toBe(404);

    release();

    await ready;

    const afterReady = await app.fetch(
      new Request("http://gelis.test/delayed"),
    );

    expect(afterReady.status).toBe(200);
    expect(await afterReady.text()).toBe("ready");
  });

  test("keeps setup-provided capabilities hidden until startup succeeds", async () => {
    const Database: Capability<DatabaseClient> = defineCapability("database");

    const database = {
      name: "primary",
    } satisfies DatabaseClient;

    const plugin = definePlugin(
      "database-provider",

      (setup) => {
        Database.provide(setup, database);

        setup.startup(async (startup) => {
          await Promise.resolve();

          expect(Database.require(startup)).toBe(database);
        });
      },
    );

    const app = new Gelis();

    app.use(plugin);

    expect(readInstalledCapability(app, Database)).toBe(MISSING_CAPABILITY);

    await app.ready();

    expect(readInstalledCapability(app, Database)).toBe(database);
  });

  test("does not commit plugin composition or capabilities when startup fails", async () => {
    const Service: Capability<object> = defineCapability("service");

    const service = {};

    const failure = new Error("startup failed");

    const plugin = definePlugin(
      "failing-startup",

      (setup) => {
        Service.provide(setup, service);

        setup.routes.get(
          "/never-committed",

          () => "ghost",
        );

        setup.startup(() => {
          throw failure;
        });
      },
    );

    const app = new Gelis();

    app.use(plugin);

    await expect(app.ready()).rejects.toBe(failure);

    expect(readInstalledCapability(app, Service)).toBe(MISSING_CAPABILITY);

    const response = await app.fetch(
      new Request("http://gelis.test/never-committed"),
    );

    expect(response.status).toBe(404);
  });

  test("stages later plugin composition behind an earlier pending startup", async () => {
    let release!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = definePlugin(
      "first",

      (setup) => {
        setup.routes.get(
          "/first",

          () => "first",
        );

        setup.startup(() => gate);
      },
    );

    const second = definePlugin(
      "second",

      (setup) => {
        setup.routes.get(
          "/second",

          () => "second",
        );
      },
    );

    const app = new Gelis();

    app.use(first);
    app.use(second);

    const beforeFirst = await app.fetch(new Request("http://gelis.test/first"));

    const beforeSecond = await app.fetch(
      new Request("http://gelis.test/second"),
    );

    expect(beforeFirst.status).toBe(404);
    expect(beforeSecond.status).toBe(404);

    const ready = app.ready();

    await Promise.resolve();

    const pendingSecond = await app.fetch(
      new Request("http://gelis.test/second"),
    );

    expect(pendingSecond.status).toBe(404);

    release();

    await ready;

    const afterFirst = await app.fetch(new Request("http://gelis.test/first"));

    const afterSecond = await app.fetch(
      new Request("http://gelis.test/second"),
    );

    expect(await afterFirst.text()).toBe("first");
    expect(await afterSecond.text()).toBe("second");
  });

  test("allows a later startup callback to require an earlier committed capability", async () => {
    const Database: Capability<DatabaseClient> = defineCapability("database");

    const database = {
      name: "primary",
    } satisfies DatabaseClient;

    let resolved: DatabaseClient | undefined;

    const provider = definePlugin(
      "provider",

      (setup) => {
        Database.provide(setup, database);

        setup.startup(async () => {
          await Promise.resolve();
        });
      },
    );

    const consumer = definePlugin(
      "consumer",

      (setup) => {
        setup.startup((startup) => {
          resolved = Database.require(startup);
        });
      },
    );

    const app = new Gelis();

    app.use(provider);
    app.use(consumer);

    await app.ready();

    expect(resolved).toBe(database);
  });

  test("invalidates a captured startup context after its callback finishes", async () => {
    const Database: Capability<DatabaseClient> = defineCapability("database");

    const database = {
      name: "primary",
    } satisfies DatabaseClient;

    let captured: PluginStartupContext | undefined;

    const provider = definePlugin(
      "provider",

      (setup) => {
        Database.provide(setup, database);

        setup.startup((startup) => {
          captured = startup;

          expect(Database.require(startup)).toBe(database);
        });
      },
    );

    const app = new Gelis();

    app.use(provider);

    await app.ready();

    if (captured === undefined) {
      throw new Error("Expected captured startup context");
    }

    try {
      Database.require(captured);

      throw new Error("Expected startup context to be inactive");
    } catch (error) {
      expect(error).toBeInstanceOf(PluginInstallError);
      expect((error as PluginInstallError).code).toBe(
        "PLUGIN_SETUP_CONTEXT_INACTIVE",
      );
    }
  });

  test("continues to reject a raw async PluginSetup callback", () => {
    const plugin = definePlugin(
      "raw-async",

      async () => {},
    );

    const app = new Gelis();

    expect(() => app.use(plugin)).toThrow(/Async setup is not supported/);
  });
});
