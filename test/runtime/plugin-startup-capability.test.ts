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

describe("plugin startup capabilities", () => {
  test("provides an asynchronously acquired capability from startup", async () => {
    const Database: Capability<DatabaseClient> = defineCapability("database");

    const database = {
      name: "primary",
    } satisfies DatabaseClient;

    const provider = definePlugin(
      "database-provider",

      (setup) => {
        setup.startup(async (startup) => {
          await Promise.resolve();

          Database.provide(startup, database);
        });
      },
    );

    const app = new Gelis();

    app.use(provider);

    expect(readInstalledCapability(app, Database)).toBe(MISSING_CAPABILITY);

    await app.ready();

    expect(readInstalledCapability(app, Database)).toBe(database);
  });

  test("resolves a startup-produced capability in a later plugin by source order", async () => {
    const Database: Capability<DatabaseClient> = defineCapability("database");

    const database = {
      name: "primary",
    } satisfies DatabaseClient;

    const events: string[] = [];

    let resolved: DatabaseClient | undefined;

    const provider = definePlugin(
      "database-provider",

      (setup) => {
        setup.startup(async (startup) => {
          events.push("provider:start");

          await Promise.resolve();

          Database.provide(startup, database);

          events.push("provider:end");
        });
      },
    );

    const consumer = definePlugin(
      "database-consumer",

      (setup) => {
        setup.startup((startup) => {
          events.push("consumer");

          resolved = Database.require(startup);
        });
      },
    );

    const app = new Gelis();

    app.use(provider);
    app.use(consumer);

    expect(resolved).toBeUndefined();

    await app.ready();

    expect(resolved).toBe(database);

    expect(events).toEqual(["provider:start", "provider:end", "consumer"]);
  });

  test("allows a later startup callback in the same plugin to require a pending capability", async () => {
    const Database: Capability<DatabaseClient> = defineCapability("database");

    const database = {
      name: "primary",
    } satisfies DatabaseClient;

    let resolved: DatabaseClient | undefined;

    const provider = definePlugin(
      "database-provider",

      (setup) => {
        setup.startup((startup) => {
          Database.provide(startup, database);
        });

        setup.startup((startup) => {
          resolved = Database.require(startup);
        });
      },
    );

    const app = new Gelis();

    app.use(provider);

    await app.ready();

    expect(resolved).toBe(database);
  });

  test("does not commit a startup-produced capability when later startup work fails", async () => {
    const Database: Capability<DatabaseClient> = defineCapability("database");

    const database = {
      name: "primary",
    } satisfies DatabaseClient;

    const failure = new Error("startup failed");

    const provider = definePlugin(
      "database-provider",

      (setup) => {
        setup.startup((startup) => {
          Database.provide(startup, database);
        });

        setup.startup(() => {
          throw failure;
        });
      },
    );

    const app = new Gelis();

    app.use(provider);

    await expect(app.ready()).rejects.toBe(failure);

    expect(readInstalledCapability(app, Database)).toBe(MISSING_CAPABILITY);
  });

  test("rejects a duplicate startup provider without committing its composition", async () => {
    const Database: Capability<DatabaseClient> = defineCapability("database");

    const firstDatabase = {
      name: "first",
    } satisfies DatabaseClient;

    const secondDatabase = {
      name: "second",
    } satisfies DatabaseClient;

    const first = definePlugin(
      "first-provider",

      (setup) => {
        setup.startup((startup) => {
          Database.provide(startup, firstDatabase);
        });
      },
    );

    const second = definePlugin(
      "second-provider",

      (setup) => {
        setup.routes.get(
          "/duplicate-provider-route",

          () => "should-not-commit",
        );

        setup.startup((startup) => {
          Database.provide(startup, secondDatabase);
        });
      },
    );

    const app = new Gelis();

    app.use(first);
    app.use(second);

    try {
      await app.ready();

      throw new Error("Expected duplicate provider failure");
    } catch (error) {
      expect(error).toBeInstanceOf(PluginInstallError);

      const installError = error as PluginInstallError;

      expect(installError.code).toBe("PLUGIN_CAPABILITY_ALREADY_PROVIDED");

      expect(installError.providerPluginName).toBe("first-provider");
    }

    expect(readInstalledCapability(app, Database)).toBe(firstDatabase);

    const response = await app.fetch(
      new Request("http://gelis.test/duplicate-provider-route"),
    );

    expect(response.status).toBe(503);
  });

  test("revalidates setup-provided capabilities at staged commit time", async () => {
    const Database: Capability<DatabaseClient> = defineCapability("database");

    const firstDatabase = {
      name: "first",
    } satisfies DatabaseClient;

    const secondDatabase = {
      name: "second",
    } satisfies DatabaseClient;

    const first = definePlugin(
      "first-provider",

      (setup) => {
        Database.provide(setup, firstDatabase);

        setup.startup(async () => {
          await Promise.resolve();
        });
      },
    );

    const second = definePlugin(
      "second-provider",

      (setup) => {
        Database.provide(setup, secondDatabase);

        setup.routes.get(
          "/second-provider-route",

          () => "should-not-commit",
        );
      },
    );

    const app = new Gelis();

    app.use(first);
    app.use(second);

    await expect(app.ready()).rejects.toBeInstanceOf(PluginInstallError);

    expect(readInstalledCapability(app, Database)).toBe(firstDatabase);

    const response = await app.fetch(
      new Request("http://gelis.test/second-provider-route"),
    );

    expect(response.status).toBe(503);
  });

  test("invalidates startup capability provide after the callback finishes", async () => {
    const Database: Capability<DatabaseClient> = defineCapability("database");

    const database = {
      name: "primary",
    } satisfies DatabaseClient;

    let captured: PluginStartupContext | undefined;

    const provider = definePlugin(
      "provider",

      (setup) => {
        setup.startup((startup) => {
          captured = startup;
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
      Database.provide(captured, database);

      throw new Error("Expected startup context to be inactive");
    } catch (error) {
      expect(error).toBeInstanceOf(PluginInstallError);

      expect((error as PluginInstallError).code).toBe(
        "PLUGIN_SETUP_CONTEXT_INACTIVE",
      );
    }

    expect(readInstalledCapability(app, Database)).toBe(MISSING_CAPABILITY);
  });
});
