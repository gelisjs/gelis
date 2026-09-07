import {
  Gelis,
  PluginInstallError,
  defineCapability,
  definePlugin,
} from "../../src";

import type {
  Capability,
  Plugin,
  PluginInstallErrorCode,
  PluginRouteBuilder,
  PluginSetup,
  PluginSetupContext,
} from "../../src";

import type { Equal, Expect } from "./assert";

// Internal composition transport is intentionally not package-root API.

// @ts-expect-error plugin composition declarations are runtime internals.
import type { PluginCompositionDeclaration } from "../../src";

// @ts-expect-error plugin composition commit callbacks are runtime internals.
import type { PluginCompositionCommit } from "../../src";

type PluginStringKeys = Extract<keyof Plugin, string>;

type FrozenPluginStringKeys = "name" | "setup";

type PluginShape = Expect<Equal<PluginStringKeys, FrozenPluginStringKeys>>;

type CapabilityStringKeys = Extract<keyof Capability<unknown>, string>;

type FrozenCapabilityStringKeys = "name" | "require" | "provide";

type CapabilityShape = Expect<
  Equal<CapabilityStringKeys, FrozenCapabilityStringKeys>
>;

type SetupStringKeys = Extract<keyof PluginSetupContext, string>;

type FrozenSetupStringKeys =
  | "routes"
  | "startup"
  | "onRequest"
  | "onError"
  | "onBeforeHandle"
  | "onAfterHandle"
  | "scope"
  | "requestScope";

type SetupShape = Expect<Equal<SetupStringKeys, FrozenSetupStringKeys>>;

type PluginRouteStringKeys = Extract<keyof PluginRouteBuilder, string>;

type FrozenPluginRouteStringKeys =
  | "get"
  | "post"
  | "put"
  | "patch"
  | "delete"
  | "options"
  | "head"
  | "route";

type PluginRouteShape = Expect<
  Equal<PluginRouteStringKeys, FrozenPluginRouteStringKeys>
>;

type FrozenInstallErrorCodes =
  | "PLUGIN_DEPENDENCY_MISSING"
  | "PLUGIN_CAPABILITY_ALREADY_PROVIDED"
  | "PLUGIN_SETUP_CONTEXT_INACTIVE"
  | "PLUGIN_ASYNC_SETUP_UNSUPPORTED"
  | "PLUGIN_ALREADY_INSTALLED";

type InstallErrorCodes = Expect<
  Equal<PluginInstallErrorCode, FrozenInstallErrorCodes>
>;

type PluginSetupParameter = Expect<
  Equal<Parameters<PluginSetup>[0], PluginSetupContext>
>;

type PluginSetupReturn = Expect<Equal<ReturnType<PluginSetup>, void>>;

interface DatabaseClient {
  readonly kind: "database";

  query(sql: string): string;
}

const Untyped = defineCapability("untyped");

type UntypedCapability = Expect<Equal<typeof Untyped, Capability<never>>>;

const Database: Capability<DatabaseClient> = defineCapability("database");

// @ts-expect-error defineCapability is intentionally non-generic.
defineCapability<DatabaseClient>("invalid-generic-construction");

const nestedPlugin = definePlugin("nested", () => {});

const plugin = definePlugin(
  "api-freeze",

  (setup) => {
    type SetupParameter = Expect<Equal<typeof setup, PluginSetupContext>>;

    const database = Database.require(setup);

    type RequiredDatabase = Expect<Equal<typeof database, DatabaseClient>>;

    Database.provide(
      setup,

      {
        kind: "database",

        query(sql) {
          return sql;
        },
      },
    );

    // Untyped capability tokens fail closed rather than widening to any.
    // @ts-expect-error Capability<never> cannot accept an arbitrary value.
    Untyped.provide(setup, "unsafe");

    setup.routes.get(
      "/plugin/:id",

      ({ params }) => {
        const id: string = params.id;

        return id;
      },
    );

    setup.onRequest(({ request }) => {
      void request;
    });

    setup.onError(({ error }) => {
      void error;
    });

    setup.onBeforeHandle(({ request }) => {
      void request;
    });

    setup.onAfterHandle(({ request }, result) => {
      void request;
      void result;
    });

    const services = setup.scope({
      database,
    });

    services.get(
      "/scoped",

      (_context, scope) => scope.database.kind,
    );

    const authenticated = setup.requestScope(({ request }) => ({
      user: {
        id: request.headers.get("x-user") ?? "anonymous",
      },
    }));

    authenticated.get(
      "/profile",

      (_context, scope) => scope.user.id,
    );

    // The route surface is deliberately namespaced.
    // @ts-expect-error direct route methods are not setup API.
    setup.get("/invalid", () => "invalid");

    // Plugins cannot recursively install plugins through setup.
    // @ts-expect-error nested app.use is intentionally absent.
    setup.use(nestedPlugin);

    // Plugins cannot mount modules through setup.
    // @ts-expect-error module mounting is intentionally absent.
    setup.mount(null);

    // Raw application access is intentionally absent.
    // @ts-expect-error no raw Gelis instance is exposed.
    setup.app;

    // The route builder reference itself is readonly.
    // @ts-expect-error setup.routes cannot be replaced.
    setup.routes = setup.routes;

    type _SetupParameter = SetupParameter;

    type _RequiredDatabase = RequiredDatabase;

    void database;
  },
);

type ErasedPlugin = Expect<Equal<typeof plugin, Plugin>>;

const app = new Gelis();

type RootBefore = typeof app;

const sameApp = app.use(plugin);

type RootAfter = typeof app;

type UseReturn = Expect<Equal<typeof sameApp, Gelis>>;

type StableRoot = Expect<Equal<RootBefore, RootAfter>>;

declare const installError: PluginInstallError;

const installErrorCode: PluginInstallErrorCode = installError.code;

const installPluginName: string = installError.pluginName;

const installCapabilityName: string | undefined = installError.capabilityName;

const providerPluginName: string | undefined = installError.providerPluginName;

void installErrorCode;
void installPluginName;
void installCapabilityName;
void providerPluginName;

export type {
  CapabilityShape,
  ErasedPlugin,
  InstallErrorCodes,
  PluginRouteShape,
  PluginSetupParameter,
  PluginSetupReturn,
  PluginShape,
  SetupShape,
  StableRoot,
  UntypedCapability,
  UseReturn,
};
