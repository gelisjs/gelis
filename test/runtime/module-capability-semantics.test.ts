import { describe, expect, test } from "bun:test";

import {
  Gelis,
  ModuleMountError,
  defineCapability,
  defineModule,
  definePlugin,
} from "../../src";

import type {
  Capability,
  ModuleScopeResolver,
  ModuleSetupContext,
} from "../../src";

interface DatabaseClient {
  readonly id: string;
}

const Database: Capability<DatabaseClient> = defineCapability("database");

function createDatabasePlugin(value: DatabaseClient) {
  return definePlugin(
    `database:${value.id}`,

    (setup) => {
      Database.provide(setup, value);
    },
  );
}

function createDatabaseModule(prefix = "/users") {
  return defineModule(
    prefix,

    (setup) => ({
      database: Database.require(setup),
    }),

    (route) => ({
      read: route.get(
        "/",

        (_context, scope) => scope.database.id,
      ),
    }),
  );
}

describe("module capability resolution semantics", () => {
  test("reports a stable missing-dependency error identity", () => {
    const app = new Gelis();

    const users = createDatabaseModule();

    let thrown: unknown;

    try {
      app.mount(users);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ModuleMountError);

    const error = thrown as ModuleMountError;

    expect(error.name).toBe("ModuleMountError");

    expect(error.code).toBe("MODULE_DEPENDENCY_MISSING");

    expect(error.modulePrefix).toBe("/users");

    expect(error.capabilityName).toBe("database");
  });

  test("resolves only capabilities committed by prior successful plugins", async () => {
    const app = new Gelis();

    const users = createDatabaseModule();

    expect(() => app.mount(users)).toThrow(ModuleMountError);

    app.use(
      createDatabasePlugin({
        id: "primary",
      }),
    );

    app.mount(users);

    const response = await app.fetch(new Request("http://gelis.test/users"));

    expect(await response.text()).toBe("primary");
  });

  test("does not expose a capability pending in a failed plugin installation", () => {
    const app = new Gelis();

    const failing = definePlugin(
      "failing-database",

      (setup) => {
        Database.provide(
          setup,

          {
            id: "uncommitted",
          },
        );

        throw new Error("setup failed");
      },
    );

    expect(() => app.use(failing)).toThrow("setup failed");

    const users = createDatabaseModule();

    expect(() => app.mount(users)).toThrow(ModuleMountError);
  });

  test("invalidates a captured module setup context after successful resolution", () => {
    const app = new Gelis();

    app.use(
      createDatabasePlugin({
        id: "primary",
      }),
    );

    let captured: ModuleSetupContext | undefined;

    const module = defineModule(
      "/captured-success",

      (setup) => {
        captured = setup;

        return {
          database: Database.require(setup),
        };
      },

      (route) => ({
        read: route.get("/", (_context, scope) => scope.database.id),
      }),
    );

    app.mount(module);

    expect(captured).toBeDefined();

    const inactiveError = captureError(() => Database.require(captured!));

    expect(inactiveError).toBeInstanceOf(ModuleMountError);

    expect((inactiveError as ModuleMountError).code).toBe(
      "MODULE_SETUP_CONTEXT_INACTIVE",
    );

    expect((inactiveError as ModuleMountError).modulePrefix).toBe(
      "/captured-success",
    );
  });

  test("invalidates a captured module setup context after failed resolution", () => {
    const app = new Gelis();

    let captured: ModuleSetupContext | undefined;

    const module = defineModule(
      "/captured-failure",

      (setup) => {
        captured = setup;

        Database.require(setup);

        return {};
      },

      (route) => ({
        read: route.get("/", () => "unreachable"),
      }),
    );

    expect(() => app.mount(module)).toThrow(ModuleMountError);

    expect(captured).toBeDefined();

    const inactiveError = captureError(() => Database.require(captured!));

    expect(inactiveError).toBeInstanceOf(ModuleMountError);

    expect((inactiveError as ModuleMountError).code).toBe(
      "MODULE_SETUP_CONTEXT_INACTIVE",
    );

    expect((inactiveError as ModuleMountError).modulePrefix).toBe(
      "/captured-failure",
    );
  });

  test("supports asynchronous module scope resolution through app.ready", async () => {
    const app = new Gelis();

    const asyncResolver: ModuleScopeResolver<{
      readonly ready: true;
    }> = async (_setup) => ({
      ready: true as const,
    });

    const module = defineModule(
      "/async-module",

      asyncResolver,

      (route) => ({
        read: route.get("/", (_context, scope) => scope.ready),
      }),
    );

    app.mount(module);

    const beforeReady = await app.fetch(
      new Request("http://gelis.test/async-module"),
    );

    expect(beforeReady.status).toBe(404);

    await app.ready();

    const response = await app.fetch(
      new Request("http://gelis.test/async-module"),
    );

    expect(await response.json()).toBe(true);
  });

  test("allows a failed mount to be retried after its dependency becomes available", async () => {
    const app = new Gelis();

    const module = createDatabaseModule("/retry");

    expect(() => app.mount(module)).toThrow(ModuleMountError);

    app.use(
      createDatabasePlugin({
        id: "retry-db",
      }),
    );

    expect(() => app.mount(module)).not.toThrow();

    const response = await app.fetch(new Request("http://gelis.test/retry"));

    expect(await response.text()).toBe("retry-db");
  });

  test("uses capability token identity rather than display name", () => {
    const First: Capability<DatabaseClient> = defineCapability("shared-name");

    const Second: Capability<DatabaseClient> = defineCapability("shared-name");

    const app = new Gelis();

    app.use(
      definePlugin(
        "first-provider",

        (setup) => {
          First.provide(
            setup,

            {
              id: "first",
            },
          );
        },
      ),
    );

    const module = defineModule(
      "/identity",

      (setup) => ({
        database: Second.require(setup),
      }),

      (route) => ({
        read: route.get("/", (_context, scope) => scope.database.id),
      }),
    );

    const missingError = captureError(() => app.mount(module));

    expect(missingError).toBeInstanceOf(ModuleMountError);

    expect((missingError as ModuleMountError).code).toBe(
      "MODULE_DEPENDENCY_MISSING",
    );

    expect((missingError as ModuleMountError).capabilityName).toBe(
      "shared-name",
    );
  });
});

function captureError(run: () => void): unknown {
  try {
    run();

    return undefined;
  } catch (error) {
    return error;
  }
}
