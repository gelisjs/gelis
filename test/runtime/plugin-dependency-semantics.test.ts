import { describe, expect, test } from "bun:test";

import {
  defineCapability,
  definePlugin,
  Gelis,
  PluginInstallError,
} from "../../src";

import type { Capability, PluginSetupContext } from "../../src";

describe("plugin dependency semantics", () => {
  test("reports a stable missing-dependency error identity", () => {
    const Database: Capability<object> = defineCapability("database");

    const consumer = definePlugin(
      "auth",

      (plugin) => {
        Database.require(plugin);
      },
    );

    const error = capturePluginInstallError(() => {
      new Gelis().use(consumer);
    });

    expect(error.code).toBe("PLUGIN_DEPENDENCY_MISSING");

    expect(error.pluginName).toBe("auth");

    expect(error.capabilityName).toBe("database");

    expect(error.providerPluginName).toBeUndefined();

    expect(error.message).toBe(
      'Missing capability dependency "database" required by plugin "auth"',
    );
  });

  test("resolves dependencies only from successfully installed prior plugins", () => {
    const Database: Capability<object> = defineCapability("database");

    const value = {};

    const provider = definePlugin(
      "database-provider",

      (plugin) => {
        Database.provide(plugin, value);
      },
    );

    let resolved: object | undefined;

    const consumer = definePlugin(
      "auth",

      (plugin) => {
        resolved = Database.require(plugin);
      },
    );

    const app = new Gelis();

    app.use(provider);

    app.use(consumer);

    expect(resolved).toBe(value);
  });

  test("does not treat a pending output from the current plugin as its dependency", () => {
    const Database: Capability<object> = defineCapability("database");

    const selfReading = definePlugin(
      "database-provider",

      (plugin) => {
        Database.provide(plugin, {});

        Database.require(plugin);
      },
    );

    const error = capturePluginInstallError(() => {
      new Gelis().use(selfReading);
    });

    expect(error.code).toBe("PLUGIN_DEPENDENCY_MISSING");

    expect(error.pluginName).toBe("database-provider");

    expect(error.capabilityName).toBe("database");
  });

  test("reports the original provider when the same capability identity collides", () => {
    const Database: Capability<object> = defineCapability("database");

    const first = definePlugin(
      "first-provider",

      (plugin) => {
        Database.provide(plugin, {});
      },
    );

    const second = definePlugin(
      "second-provider",

      (plugin) => {
        Database.provide(plugin, {});
      },
    );

    const app = new Gelis();

    app.use(first);

    const error = capturePluginInstallError(() => {
      app.use(second);
    });

    expect(error.code).toBe("PLUGIN_CAPABILITY_ALREADY_PROVIDED");

    expect(error.pluginName).toBe("second-provider");

    expect(error.capabilityName).toBe("database");

    expect(error.providerPluginName).toBe("first-provider");

    expect(error.message).toBe(
      'Capability "database" is already provided by plugin "first-provider" while installing plugin "second-provider"',
    );
  });

  test("treats a second provide inside one setup as a capability collision", () => {
    const Database: Capability<object> = defineCapability("database");

    const provider = definePlugin(
      "database-provider",

      (plugin) => {
        Database.provide(plugin, {});

        Database.provide(plugin, {});
      },
    );

    const error = capturePluginInstallError(() => {
      new Gelis().use(provider);
    });

    expect(error.code).toBe("PLUGIN_CAPABILITY_ALREADY_PROVIDED");

    expect(error.providerPluginName).toBe("database-provider");
  });

  test("rolls back every pending capability when a later collision fails installation", () => {
    const Primary: Capability<object> = defineCapability("primary");

    const Existing: Capability<object> = defineCapability("existing");

    const existingProvider = definePlugin(
      "existing-provider",

      (plugin) => {
        Existing.provide(plugin, {});
      },
    );

    const failing = definePlugin(
      "failing-provider",

      (plugin) => {
        Primary.provide(plugin, {});

        Existing.provide(plugin, {});
      },
    );

    const primaryConsumer = definePlugin(
      "primary-consumer",

      (plugin) => {
        Primary.require(plugin);
      },
    );

    const app = new Gelis();

    app.use(existingProvider);

    const collision = capturePluginInstallError(() => {
      app.use(failing);
    });

    expect(collision.code).toBe("PLUGIN_CAPABILITY_ALREADY_PROVIDED");

    const missing = capturePluginInstallError(() => {
      app.use(primaryConsumer);
    });

    expect(missing.code).toBe("PLUGIN_DEPENDENCY_MISSING");

    expect(missing.capabilityName).toBe("primary");
  });

  test("invalidates a captured setup context after successful installation", () => {
    const Database: Capability<object> = defineCapability("database");

    let captured: PluginSetupContext | undefined;

    const plugin = definePlugin(
      "capture-context",

      (context) => {
        captured = context;

        Database.provide(context, {});
      },
    );

    const app = new Gelis();

    app.use(plugin);

    if (captured === undefined) {
      throw new Error("Expected captured plugin context");
    }

    const error = capturePluginInstallError(() => {
      Database.require(captured!);
    });

    expect(error.code).toBe("PLUGIN_SETUP_CONTEXT_INACTIVE");

    expect(error.pluginName).toBe("capture-context");
  });

  test("invalidates a captured setup context after failed installation", () => {
    const Missing: Capability<object> = defineCapability("missing");

    let captured: PluginSetupContext | undefined;

    const plugin = definePlugin(
      "failing-context",

      (context) => {
        captured = context;

        Missing.require(context);
      },
    );

    const app = new Gelis();

    expect(() => app.use(plugin)).toThrow();

    if (captured === undefined) {
      throw new Error("Expected captured plugin context");
    }

    const error = capturePluginInstallError(() => {
      Missing.require(captured!);
    });

    expect(error.code).toBe("PLUGIN_SETUP_CONTEXT_INACTIVE");
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
