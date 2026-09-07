import { describe, expect, test } from "bun:test";

import {
  defineCapability,
  definePlugin,
  Gelis,
  PluginInstallError,
} from "../../src";

import type { Capability } from "../../src";

describe("plugin duplicate and multi-instance semantics", () => {
  test("rejects the same plugin object twice on one application", () => {
    let setupCalls = 0;

    const plugin = definePlugin(
      "logger",

      () => {
        setupCalls++;
      },
    );

    const app = new Gelis();

    app.use(plugin);

    const error = capturePluginInstallError(() => {
      app.use(plugin);
    });

    expect(error.code).toBe("PLUGIN_ALREADY_INSTALLED");

    expect(error.pluginName).toBe("logger");

    expect(error.message).toBe(
      'Plugin "logger" cannot be installed more than once on the same application',
    );

    expect(setupCalls).toBe(1);
  });

  test("rejects a re-entrant installation of the same plugin object", () => {
    const app = new Gelis();

    let plugin: ReturnType<typeof definePlugin>;

    plugin = definePlugin(
      "recursive",

      () => {
        app.use(plugin);
      },
    );

    const error = capturePluginInstallError(() => {
      app.use(plugin);
    });

    expect(error.code).toBe("PLUGIN_ALREADY_INSTALLED");

    expect(error.pluginName).toBe("recursive");
  });

  test("allows the same plugin object on separate applications", () => {
    let setupCalls = 0;

    const plugin = definePlugin(
      "logger",

      () => {
        setupCalls++;
      },
    );

    new Gelis().use(plugin);

    new Gelis().use(plugin);

    expect(setupCalls).toBe(2);
  });

  test("does not consume plugin identity when installation fails", () => {
    const Database: Capability<object> = defineCapability("database");

    let resolved: object | undefined;

    const consumer = definePlugin(
      "consumer",

      (context) => {
        resolved = Database.require(context);
      },
    );

    const app = new Gelis();

    const firstError = capturePluginInstallError(() => {
      app.use(consumer);
    });

    expect(firstError.code).toBe("PLUGIN_DEPENDENCY_MISSING");

    const database = {};

    app.use(
      definePlugin(
        "provider",

        (context) => {
          Database.provide(context, database);
        },
      ),
    );

    expect(() => app.use(consumer)).not.toThrow();

    expect(resolved).toBe(database);
  });

  test("allows different plugin objects with the same display name", () => {
    const calls: string[] = [];

    const first = definePlugin(
      "worker",

      () => {
        calls.push("first");
      },
    );

    const second = definePlugin(
      "worker",

      () => {
        calls.push("second");
      },
    );

    const app = new Gelis();

    app.use(first);

    app.use(second);

    expect(calls).toEqual(["first", "second"]);
  });

  test("allows explicit multi-instance plugins when capability identities are distinct", () => {
    const primary = createDatabaseInstance("primary");

    const analytics = createDatabaseInstance("analytics");

    const app = new Gelis();

    app.use(primary.plugin);

    app.use(analytics.plugin);

    let primaryValue: DatabaseInstance | undefined;

    let analyticsValue: DatabaseInstance | undefined;

    app.use(
      definePlugin(
        "consumer",

        (context) => {
          primaryValue = primary.capability.require(context);

          analyticsValue = analytics.capability.require(context);
        },
      ),
    );

    expect(primaryValue).toEqual({
      id: "primary",
    });

    expect(analyticsValue).toEqual({
      id: "analytics",
    });
  });

  test("keeps capability collision semantics stronger than plugin name equality", () => {
    const Database: Capability<object> = defineCapability("database");

    const first = definePlugin(
      "database",

      (context) => {
        Database.provide(context, {});
      },
    );

    const second = definePlugin(
      "database",

      (context) => {
        Database.provide(context, {});
      },
    );

    const app = new Gelis();

    app.use(first);

    const error = capturePluginInstallError(() => {
      app.use(second);
    });

    expect(error.code).toBe("PLUGIN_CAPABILITY_ALREADY_PROVIDED");

    expect(error.providerPluginName).toBe("database");
  });

  test("does not mark a plugin installed when async setup is rejected", () => {
    let setupCalls = 0;

    const plugin = definePlugin(
      "async-plugin",

      async () => {
        setupCalls++;
      },
    );

    const app = new Gelis();

    const first = capturePluginInstallError(() => {
      app.use(plugin);
    });

    const second = capturePluginInstallError(() => {
      app.use(plugin);
    });

    expect(first.code).toBe("PLUGIN_ASYNC_SETUP_UNSUPPORTED");

    expect(second.code).toBe("PLUGIN_ASYNC_SETUP_UNSUPPORTED");

    expect(setupCalls).toBe(2);
  });
});

interface DatabaseInstance {
  readonly id: string;
}

function createDatabaseInstance(id: string): {
  readonly capability: Capability<DatabaseInstance>;

  readonly plugin: ReturnType<typeof definePlugin>;
} {
  const capability: Capability<DatabaseInstance> = defineCapability(
    `database:${id}`,
  );

  const plugin = definePlugin(
    "database",

    (context) => {
      capability.provide(context, {
        id,
      });
    },
  );

  return {
    capability,
    plugin,
  };
}

function capturePluginInstallError(run: () => void): PluginInstallError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(PluginInstallError);

    return error as PluginInstallError;
  }

  throw new Error("Expected PluginInstallError");
}
