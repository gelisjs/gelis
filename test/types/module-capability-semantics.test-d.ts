import { ModuleMountError, defineCapability, defineModule } from "../../src";

import type {
  Capability,
  ModuleMountErrorCode,
  ModuleScopeResolver,
  ModuleSetupContext,
} from "../../src";

import type { Equal, Expect } from "./assert";

interface DatabaseClient {
  readonly kind: "database";
}

const Database: Capability<DatabaseClient> = defineCapability("database");

const resolver: ModuleScopeResolver<{
  readonly database: DatabaseClient;
}> = (setup) => ({
  database: Database.require(setup),
});

const module = defineModule(
  "/typed",

  resolver,

  (route) => ({
    read: route.get(
      "/",

      (_context, scope) => {
        const kind: "database" = scope.database.kind;

        return kind;
      },
    ),
  }),
);

void module;

type SetupStringKeys = Extract<keyof ModuleSetupContext, string>;

type ConsumerOnlySetup = Expect<Equal<SetupStringKeys, never>>;

type FrozenModuleMountErrorCodes =
  | "MODULE_DEPENDENCY_MISSING"
  | "MODULE_SETUP_CONTEXT_INACTIVE"
  | "MODULE_ASYNC_SCOPE_UNSUPPORTED"
  | "MODULE_ALREADY_MOUNTED";

type ErrorCodes = Expect<
  Equal<ModuleMountErrorCode, FrozenModuleMountErrorCodes>
>;

declare const error: ModuleMountError;

const code: ModuleMountErrorCode = error.code;

const modulePrefix: string = error.modulePrefix;

const capabilityName: string | undefined = error.capabilityName;

void code;
void modulePrefix;
void capabilityName;

defineModule(
  "/consumer-only",

  (setup) => {
    const database = Database.require(setup);

    // @ts-expect-error modules cannot provide capabilities.
    Database.provide(setup, database);

    // @ts-expect-error module setup exposes no route surface.
    setup.routes;

    // @ts-expect-error module setup exposes no plugin installation.
    setup.use;

    // @ts-expect-error module setup exposes no raw application.
    setup.app;

    return {
      database,
    };
  },

  (route) => ({
    read: route.get("/", (_context, scope) => scope.database.kind),
  }),
);

export type { ConsumerOnlySetup, ErrorCodes };
