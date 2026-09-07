import { describe, expect, test } from "bun:test";

import { defineCapability, definePlugin, Gelis } from "../../src";

import type { Capability } from "../../src";

interface DatabaseClient {
  readonly name: string;
}

describe("plugin setup runtime", () => {
  test("provides a capability to a later plugin by source order", () => {
    const Database: Capability<DatabaseClient> = defineCapability("database");

    const database = {
      name: "primary",
    } satisfies DatabaseClient;

    const provider = definePlugin(
      "database-provider",

      (plugin) => {
        Database.provide(plugin, database);
      },
    );

    let resolved: DatabaseClient | undefined;

    const consumer = definePlugin(
      "database-consumer",

      (plugin) => {
        resolved = Database.require(plugin);
      },
    );

    const app = new Gelis();

    expect(app.use(provider)).toBe(app);

    app.use(consumer);

    expect(resolved).toBe(database);
  });

  test("fails immediately when a required capability is missing", () => {
    const Database: Capability<DatabaseClient> = defineCapability("database");

    const consumer = definePlugin(
      "database-consumer",

      (plugin) => {
        Database.require(plugin);
      },
    );

    const app = new Gelis();

    expect(() => app.use(consumer)).toThrow(
      /Missing capability dependency "database"/,
    );
  });

  test("keeps capability registries isolated between applications", () => {
    const Database: Capability<DatabaseClient> = defineCapability("database");

    const database = {
      name: "primary",
    } satisfies DatabaseClient;

    const provider = definePlugin(
      "database-provider",

      (plugin) => {
        Database.provide(plugin, database);
      },
    );

    const consumer = definePlugin(
      "database-consumer",

      (plugin) => {
        Database.require(plugin);
      },
    );

    const first = new Gelis();

    const second = new Gelis();

    first.use(provider);

    expect(() => second.use(consumer)).toThrow();

    expect(() => first.use(consumer)).not.toThrow();
  });

  test("does not commit capabilities from a failed installation", () => {
    const Primary: Capability<object> = defineCapability("primary");

    const Missing: Capability<object> = defineCapability("missing");

    const failing = definePlugin(
      "failing-plugin",

      (plugin) => {
        Primary.provide(plugin, {});

        Missing.require(plugin);
      },
    );

    const consumer = definePlugin(
      "consumer",

      (plugin) => {
        Primary.require(plugin);
      },
    );

    const app = new Gelis();

    expect(() => app.use(failing)).toThrow();

    expect(() => app.use(consumer)).toThrow(
      /Missing capability dependency "primary"/,
    );
  });

  test("rejects a duplicate provider for the same capability identity", () => {
    const Database: Capability<DatabaseClient> = defineCapability("database");

    const first = definePlugin(
      "first-provider",

      (plugin) => {
        Database.provide(plugin, {
          name: "first",
        });
      },
    );

    const second = definePlugin(
      "second-provider",

      (plugin) => {
        Database.provide(plugin, {
          name: "second",
        });
      },
    );

    const app = new Gelis();

    app.use(first);

    expect(() => app.use(second)).toThrow(
      /Capability "database" is already provided/,
    );
  });

  test("treats separate capability tokens with the same name as separate identities", () => {
    const Primary: Capability<DatabaseClient> = defineCapability("database");

    const Analytics: Capability<DatabaseClient> = defineCapability("database");

    const primary = {
      name: "primary",
    } satisfies DatabaseClient;

    const analytics = {
      name: "analytics",
    } satisfies DatabaseClient;

    let resolvedPrimary: DatabaseClient | undefined;

    let resolvedAnalytics: DatabaseClient | undefined;

    const provider = definePlugin(
      "database-provider",

      (plugin) => {
        Primary.provide(plugin, primary);

        Analytics.provide(plugin, analytics);
      },
    );

    const consumer = definePlugin(
      "database-consumer",

      (plugin) => {
        resolvedPrimary = Primary.require(plugin);

        resolvedAnalytics = Analytics.require(plugin);
      },
    );

    const app = new Gelis();

    app.use(provider);

    app.use(consumer);

    expect(resolvedPrimary).toBe(primary);

    expect(resolvedAnalytics).toBe(analytics);
  });

  test("runs plugin setup only during installation and not during requests", async () => {
    let setupCalls = 0;

    const plugin = definePlugin(
      "setup-counter",

      () => {
        setupCalls++;
      },
    );

    const app = new Gelis();

    app.use(plugin);

    app.get(
      "/plain",

      () => "plain",
    );

    const first = await app.fetch(new Request("http://gelis.test/plain"));

    const second = await app.fetch(new Request("http://gelis.test/plain"));

    expect(await first.text()).toBe("plain");

    expect(await second.text()).toBe("plain");

    expect(setupCalls).toBe(1);
  });

  test("rejects asynchronous setup until startup lifecycle support exists", () => {
    const plugin = definePlugin(
      "async-plugin",

      async () => {},
    );

    const app = new Gelis();

    expect(() => app.use(plugin)).toThrow(/Async setup is not supported/);
  });
});
