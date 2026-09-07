import { createApplicationScopeBuilder } from "./application-scope";

import type { ApplicationScopeBuilder } from "./application-scope";

import { createRequestScopeBuilder } from "./request-scope";

import type { RequestScopeBuilder, RequestScopeDerive } from "./request-scope";

import { RouteBuilder } from "./route-builder";

import type { GlobalAfterHandle, GlobalBeforeHandle } from "./route";

import type { OnRequest } from "./request";

import type { OnError } from "./error";

import type { RuntimeRouteRecord } from "./runtime/types";

import {
  enqueueApplicationStartup,
  hasPendingApplicationStartup,
  registerApplicationCleanup,
} from "./startup";

export const GELIS_CAPABILITY_REQUIRE_RUNTIME = Symbol(
  "gelis.capability.require.runtime",
);

export type CapabilityRequireRuntime = (
  capability: object,

  capabilityName: string,
) => unknown;

export interface CapabilitySetupContext {
  readonly [GELIS_CAPABILITY_REQUIRE_RUNTIME]: CapabilityRequireRuntime;
}

const PLUGIN_SETUP_RUNTIME = Symbol("gelis.plugin.setup.runtime");

const PLUGIN_STARTUP_RUNTIME = Symbol("gelis.plugin.startup.runtime");

type PluginRouteMethodName =
  | "get"
  | "post"
  | "put"
  | "patch"
  | "delete"
  | "options"
  | "head"
  | "route";

export type PluginRouteBuilder = Pick<RouteBuilder<"">, PluginRouteMethodName>;

export interface PluginCompositionDeclaration {
  readonly routes: RuntimeRouteRecord[];

  readonly onRequestHooks: OnRequest[];

  readonly onErrorHooks: OnError[];

  readonly beforeHandleHooks: GlobalBeforeHandle[];

  readonly afterHandleHooks: GlobalAfterHandle[];
}

export type PluginCompositionCommit = (
  composition: PluginCompositionDeclaration,
) => void;

export type PluginInstallErrorCode =
  | "PLUGIN_DEPENDENCY_MISSING"
  | "PLUGIN_CAPABILITY_ALREADY_PROVIDED"
  | "PLUGIN_SETUP_CONTEXT_INACTIVE"
  | "PLUGIN_ASYNC_SETUP_UNSUPPORTED"
  | "PLUGIN_ALREADY_INSTALLED";

export class PluginInstallError extends Error {
  override readonly name = "PluginInstallError";

  constructor(
    readonly code: PluginInstallErrorCode,

    message: string,

    readonly pluginName: string,

    readonly capabilityName?: string,

    readonly providerPluginName?: string,
  ) {
    super(message);
  }
}

interface CapabilityEntry {
  readonly value: unknown;

  readonly capabilityName: string;

  readonly providerPluginName: string;
}

interface PluginRuntimeState {
  readonly capabilities: Map<object, CapabilityEntry>;

  readonly pluginInstallations: Set<Plugin>;
}

interface PluginInstallFrame {
  readonly plugin: Plugin;

  readonly application: object;

  readonly state: PluginRuntimeState;

  readonly pendingCapabilities: Map<object, CapabilityEntry>;

  readonly composition: PluginCompositionDeclaration;

  readonly startupCallbacks: PluginStartup[];

  readonly commitComposition: PluginCompositionCommit;

  setupActive: boolean;
}

interface PluginStartupFrame {
  readonly installFrame: PluginInstallFrame;

  active: boolean;
}

export type PluginCleanup = () => void | PromiseLike<void>;

export interface PluginStartupContext extends CapabilitySetupContext {
  readonly [PLUGIN_STARTUP_RUNTIME]: PluginStartupFrame;

  cleanup(callback: PluginCleanup): void;
}

export type PluginStartup = (
  context: PluginStartupContext,
) => void | PromiseLike<void>;

export interface PluginSetupContext extends CapabilitySetupContext {
  readonly [PLUGIN_SETUP_RUNTIME]: PluginInstallFrame;

  readonly routes: PluginRouteBuilder;

  startup(callback: PluginStartup): void;

  onRequest(hook: OnRequest): void;

  onError(hook: OnError): void;

  onBeforeHandle(hook: GlobalBeforeHandle): void;

  onAfterHandle(hook: GlobalAfterHandle): void;

  scope<const Scope extends object>(
    scope: Scope,
  ): ApplicationScopeBuilder<Scope>;

  requestScope<const Scope extends object>(
    derive: RequestScopeDerive<Scope>,
  ): RequestScopeBuilder<Scope>;
}

export interface Capability<Value> {
  readonly name: string;

  require(context: CapabilitySetupContext): Value;

  provide(
    context: PluginSetupContext | PluginStartupContext,

    value: Value,
  ): void;
}

export type PluginSetup = (context: PluginSetupContext) => void;

export interface Plugin {
  readonly name: string;

  readonly setup: PluginSetup;
}

const applicationPluginStates = new WeakMap<object, PluginRuntimeState>();

class PluginSetupContextRuntime implements PluginSetupContext {
  readonly [PLUGIN_SETUP_RUNTIME]: PluginInstallFrame;

  #routes: PluginRouteBuilder | undefined;

  constructor(frame: PluginInstallFrame) {
    this[PLUGIN_SETUP_RUNTIME] = frame;

    this.#routes = undefined;
  }

  readonly [GELIS_CAPABILITY_REQUIRE_RUNTIME]: CapabilityRequireRuntime = (
    capability,

    capabilityName,
  ) => {
    const frame = getActivePluginInstallFrame(this);

    const entry = frame.state.capabilities.get(capability);

    if (entry === undefined) {
      throw missingDependencyError(frame.plugin.name, capabilityName);
    }

    return entry.value;
  };

  get routes(): PluginRouteBuilder {
    const frame = getActivePluginInstallFrame(this);

    let routes = this.#routes;

    if (routes === undefined) {
      routes = new RouteBuilder(
        "",

        (route) => {
          declarePluginRoute(frame, route);
        },
      );

      this.#routes = routes;
    }

    return routes;
  }

  startup(callback: PluginStartup): void {
    const frame = getActivePluginInstallFrame(this);

    frame.startupCallbacks.push(callback);
  }

  onRequest(hook: OnRequest): void {
    const frame = getActivePluginInstallFrame(this);

    frame.composition.onRequestHooks.push(hook);
  }

  onError(hook: OnError): void {
    const frame = getActivePluginInstallFrame(this);

    frame.composition.onErrorHooks.push(hook);
  }

  onBeforeHandle(hook: GlobalBeforeHandle): void {
    const frame = getActivePluginInstallFrame(this);

    frame.composition.beforeHandleHooks.push(hook);
  }

  onAfterHandle(hook: GlobalAfterHandle): void {
    const frame = getActivePluginInstallFrame(this);

    frame.composition.afterHandleHooks.push(hook);
  }

  scope<const Scope extends object>(
    scope: Scope,
  ): ApplicationScopeBuilder<Scope> {
    const frame = getActivePluginInstallFrame(this);

    return createApplicationScopeBuilder(
      scope,

      (route) => {
        declarePluginRoute(frame, route);
      },
    );
  }

  requestScope<const Scope extends object>(
    derive: RequestScopeDerive<Scope>,
  ): RequestScopeBuilder<Scope> {
    const frame = getActivePluginInstallFrame(this);

    return createRequestScopeBuilder(
      derive,

      (route) => {
        declarePluginRoute(frame, route);
      },
    );
  }
}

class PluginStartupContextRuntime implements PluginStartupContext {
  readonly [PLUGIN_STARTUP_RUNTIME]: PluginStartupFrame;

  constructor(frame: PluginInstallFrame) {
    this[PLUGIN_STARTUP_RUNTIME] = {
      installFrame: frame,

      active: true,
    };
  }

  readonly [GELIS_CAPABILITY_REQUIRE_RUNTIME]: CapabilityRequireRuntime = (
    capability,

    capabilityName,
  ) => {
    const startupFrame = getActivePluginStartupFrame(this);

    const frame = startupFrame.installFrame;

    const pending = frame.pendingCapabilities.get(capability);

    if (pending !== undefined) {
      return pending.value;
    }

    const committed = frame.state.capabilities.get(capability);

    if (committed === undefined) {
      throw missingDependencyError(
        frame.plugin.name,

        capabilityName,
      );
    }

    return committed.value;
  };
  cleanup(callback: PluginCleanup): void {
    const startupFrame = getActivePluginStartupFrame(this);

    registerApplicationCleanup(startupFrame.installFrame.application, callback);
  }

  deactivate(): void {
    this[PLUGIN_STARTUP_RUNTIME].active = false;
  }
}

export function defineCapability(name: string): Capability<never> {
  const capability: Capability<never> = {
    name,

    require(context) {
      return context[GELIS_CAPABILITY_REQUIRE_RUNTIME](
        capability,

        name,
      ) as never;
    },

    provide(context, value) {
      const frame = getActiveCapabilityProviderFrame(context);

      const pending = frame.pendingCapabilities.get(capability);

      if (pending !== undefined) {
        throw capabilityAlreadyProvidedError(
          frame.plugin.name,
          name,
          pending.providerPluginName,
        );
      }

      const committed = frame.state.capabilities.get(capability);

      if (committed !== undefined) {
        throw capabilityAlreadyProvidedError(
          frame.plugin.name,
          name,
          committed.providerPluginName,
        );
      }

      frame.pendingCapabilities.set(capability, {
        value,

        capabilityName: name,

        providerPluginName: frame.plugin.name,
      });
    },
  };

  return capability;
}

export function definePlugin(name: string, setup: PluginSetup): Plugin {
  return {
    name,

    setup,
  };
}

export function installPlugin(
  application: object,
  plugin: Plugin,
  commitComposition: PluginCompositionCommit,
): void {
  let state = applicationPluginStates.get(application);

  if (state === undefined) {
    state = {
      capabilities: new Map(),

      pluginInstallations: new Set(),
    };

    applicationPluginStates.set(application, state);
  }

  if (state.pluginInstallations.has(plugin)) {
    throw pluginAlreadyInstalledError(plugin.name);
  }

  state.pluginInstallations.add(plugin);

  let installationAccepted = false;

  const frame: PluginInstallFrame = {
    plugin,

    application,

    state,

    pendingCapabilities: new Map(),

    composition: {
      routes: [],

      onRequestHooks: [],

      onErrorHooks: [],

      beforeHandleHooks: [],

      afterHandleHooks: [],
    },

    startupCallbacks: [],

    commitComposition,

    setupActive: true,
  };

  const context = new PluginSetupContextRuntime(frame);

  try {
    const result = plugin.setup(context);

    if (isPromiseLike(result)) {
      void Promise.resolve(result).catch(() => undefined);

      throw asyncSetupUnsupportedError(plugin.name);
    }

    const requiresStartupStaging =
      frame.startupCallbacks.length !== 0 ||
      hasPendingApplicationStartup(application);

    if (requiresStartupStaging) {
      enqueueApplicationStartup(
        application,

        async () => {
          await runPluginStartup(frame);

          commitPluginInstallation(frame);
        },
      );
    } else {
      commitPluginInstallation(frame);
    }

    installationAccepted = true;
  } finally {
    frame.setupActive = false;

    if (!installationAccepted) {
      state.pluginInstallations.delete(plugin);
    }
  }
}

export function readInstalledCapability(
  application: object,

  capability: object,
): unknown | typeof MISSING_CAPABILITY {
  const state = applicationPluginStates.get(application);

  if (state === undefined) {
    return MISSING_CAPABILITY;
  }

  const entry = state.capabilities.get(capability);

  return entry === undefined ? MISSING_CAPABILITY : entry.value;
}

export const MISSING_CAPABILITY = Symbol("gelis.capability.missing");

async function runPluginStartup(frame: PluginInstallFrame): Promise<void> {
  const callbacks = frame.startupCallbacks;

  for (let index = 0; index < callbacks.length; index++) {
    const callback = callbacks[index]!;

    const context = new PluginStartupContextRuntime(frame);

    try {
      await callback(context);
    } finally {
      context.deactivate();
    }
  }
}

function commitPluginInstallation(frame: PluginInstallFrame): void {
  validatePendingCapabilities(frame);

  frame.commitComposition(frame.composition);

  for (const [capability, entry] of frame.pendingCapabilities) {
    frame.state.capabilities.set(capability, entry);
  }
}

function validatePendingCapabilities(frame: PluginInstallFrame): void {
  for (const [capability, pending] of frame.pendingCapabilities) {
    const committed = frame.state.capabilities.get(capability);

    if (committed !== undefined) {
      throw capabilityAlreadyProvidedError(
        frame.plugin.name,
        pending.capabilityName,
        committed.providerPluginName,
      );
    }
  }
}

function declarePluginRoute(
  frame: PluginInstallFrame,
  route: RuntimeRouteRecord,
): void {
  assertPluginInstallFrameActive(frame);

  frame.composition.routes.push(route);
}

function assertPluginInstallFrameActive(frame: PluginInstallFrame): void {
  if (!frame.setupActive) {
    throw setupContextInactiveError(frame.plugin.name);
  }
}

function getActiveCapabilityProviderFrame(
  context: PluginSetupContext | PluginStartupContext,
): PluginInstallFrame {
  if (PLUGIN_SETUP_RUNTIME in context) {
    return getActivePluginInstallFrame(context);
  }

  if (PLUGIN_STARTUP_RUNTIME in context) {
    return getActivePluginStartupFrame(context).installFrame;
  }

  throw new Error("Invalid Gelis capability provider context");
}

function getActivePluginInstallFrame(
  context: PluginSetupContext,
): PluginInstallFrame {
  const frame = getPluginInstallFrame(context);

  assertPluginInstallFrameActive(frame);

  return frame;
}

function getPluginInstallFrame(
  context: PluginSetupContext,
): PluginInstallFrame {
  const frame = context[PLUGIN_SETUP_RUNTIME];

  if (frame === undefined) {
    throw new Error("Invalid Gelis plugin setup context");
  }

  return frame;
}

function getActivePluginStartupFrame(
  context: PluginStartupContext,
): PluginStartupFrame {
  const frame = context[PLUGIN_STARTUP_RUNTIME];

  if (frame === undefined) {
    throw new Error("Invalid Gelis plugin startup context");
  }

  if (!frame.active) {
    throw startupContextInactiveError(frame.installFrame.plugin.name);
  }

  return frame;
}

function missingDependencyError(
  pluginName: string,
  capabilityName: string,
): PluginInstallError {
  return new PluginInstallError(
    "PLUGIN_DEPENDENCY_MISSING",

    `Missing capability dependency "${capabilityName}" required by plugin "${pluginName}"`,

    pluginName,

    capabilityName,
  );
}

function capabilityAlreadyProvidedError(
  pluginName: string,
  capabilityName: string,
  providerPluginName: string,
): PluginInstallError {
  return new PluginInstallError(
    "PLUGIN_CAPABILITY_ALREADY_PROVIDED",

    `Capability "${capabilityName}" is already provided by plugin "${providerPluginName}" while installing plugin "${pluginName}"`,

    pluginName,

    capabilityName,

    providerPluginName,
  );
}

function setupContextInactiveError(pluginName: string): PluginInstallError {
  return new PluginInstallError(
    "PLUGIN_SETUP_CONTEXT_INACTIVE",

    `Plugin setup context for "${pluginName}" is no longer active`,

    pluginName,
  );
}

function startupContextInactiveError(pluginName: string): PluginInstallError {
  return new PluginInstallError(
    "PLUGIN_SETUP_CONTEXT_INACTIVE",

    `Plugin startup context for "${pluginName}" is no longer active`,

    pluginName,
  );
}

function asyncSetupUnsupportedError(pluginName: string): PluginInstallError {
  return new PluginInstallError(
    "PLUGIN_ASYNC_SETUP_UNSUPPORTED",

    `Async setup is not supported for plugin "${pluginName}"`,

    pluginName,
  );
}

function pluginAlreadyInstalledError(pluginName: string): PluginInstallError {
  return new PluginInstallError(
    "PLUGIN_ALREADY_INSTALLED",

    `Plugin "${pluginName}" cannot be installed more than once on the same application`,

    pluginName,
  );
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    "then" in value &&
    typeof (
      value as {
        then?: unknown;
      }
    ).then === "function"
  );
}
