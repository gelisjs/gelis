import { Gelis, definePlugin } from "../../src";

import type {
  ModuleScopeResolver,
  PluginCleanup,
  PluginInstallErrorCode,
  PluginSetupContext,
  PluginStartup,
  PluginStartupContext,
} from "../../src";

import type { Equal, Expect } from "./assert";

const app = new Gelis();

const ready = app.ready();
const close = app.close();

type ReadyReturn = Expect<Equal<typeof ready, Promise<void>>>;
type CloseReturn = Expect<Equal<typeof close, Promise<void>>>;

type StartupMethod = Expect<
  Equal<PluginSetupContext["startup"], (callback: PluginStartup) => void>
>;

type StartupCallback = Expect<
  Equal<
    PluginStartup,
    (context: PluginStartupContext) => void | PromiseLike<void>
  >
>;

type CleanupMethod = Expect<
  Equal<PluginStartupContext["cleanup"], (callback: PluginCleanup) => void>
>;

type CleanupCallback = Expect<
  Equal<PluginCleanup, () => void | PromiseLike<void>>
>;

type InstallErrorCodes = Expect<
  Equal<
    PluginInstallErrorCode,
    | "PLUGIN_DEPENDENCY_MISSING"
    | "PLUGIN_CAPABILITY_ALREADY_PROVIDED"
    | "PLUGIN_SETUP_CONTEXT_INACTIVE"
    | "PLUGIN_STARTUP_CONTEXT_INACTIVE"
    | "PLUGIN_ASYNC_SETUP_UNSUPPORTED"
    | "PLUGIN_ALREADY_INSTALLED"
  >
>;

interface ExampleScope {
  readonly ready: true;
}

const syncScopeResolver: ModuleScopeResolver<ExampleScope> = () => ({
  ready: true,
});

const asyncScopeResolver: ModuleScopeResolver<ExampleScope> = async () => ({
  ready: true,
});

void syncScopeResolver;
void asyncScopeResolver;

definePlugin("lifecycle-api-freeze", (setup) => {
  setup.startup((startup) => {
    startup.cleanup(() => {});

    startup.cleanup(async () => {
      await Promise.resolve();
    });

    // Startup is intentionally resource-only, not route composition.
    // @ts-expect-error startup context must not expose routes.
    startup.routes.get("/late", () => null);

    // Startup must not recursively register more startup work.
    // @ts-expect-error startup context must not expose startup().
    startup.startup(() => {});
  });
});

export type {
  CleanupCallback,
  CleanupMethod,
  CloseReturn,
  InstallErrorCodes,
  ReadyReturn,
  StartupCallback,
  StartupMethod,
};
