const PLUGIN_SETUP_RUNTIME = Symbol("gelis.plugin.setup.runtime");

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

  readonly providerPluginName: string;
}

interface PluginRuntimeState {
  readonly capabilities: Map<object, CapabilityEntry>;

  readonly pluginInstallations: Set<Plugin>;
}

interface PluginInstallFrame {
  readonly plugin: Plugin;

  readonly state: PluginRuntimeState;

  readonly pendingCapabilities: Map<object, CapabilityEntry>;

  active: boolean;
}

export interface PluginSetupContext {
  readonly [PLUGIN_SETUP_RUNTIME]: PluginInstallFrame;
}

export interface Capability<Value> {
  readonly name: string;

  require(context: PluginSetupContext): Value;

  provide(
    context: PluginSetupContext,

    value: Value,
  ): void;
}

export type PluginSetup = (context: PluginSetupContext) => void;

export interface Plugin {
  readonly name: string;

  readonly setup: PluginSetup;
}

const applicationPluginStates = new WeakMap<object, PluginRuntimeState>();

export function defineCapability(name: string): Capability<never> {
  const capability: Capability<never> = {
    name,

    require(context) {
      const frame = getActivePluginInstallFrame(context);

      const entry = frame.state.capabilities.get(capability);

      if (entry === undefined) {
        throw missingDependencyError(frame.plugin.name, name);
      }

      return entry.value as never;
    },

    provide(context, value) {
      const frame = getActivePluginInstallFrame(context);

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

export function installPlugin(application: object, plugin: Plugin): void {
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

  let installationSucceeded = false;

  const frame: PluginInstallFrame = {
    plugin,

    state,

    pendingCapabilities: new Map(),

    active: true,
  };

  const context: PluginSetupContext = {
    [PLUGIN_SETUP_RUNTIME]: frame,
  };

  try {
    const result = plugin.setup(context);

    if (isPromiseLike(result)) {
      void Promise.resolve(result).catch(() => undefined);

      throw asyncSetupUnsupportedError(plugin.name);
    }

    for (const [capability, entry] of frame.pendingCapabilities) {
      state.capabilities.set(capability, entry);
    }

    installationSucceeded = true;
  } finally {
    frame.active = false;

    if (!installationSucceeded) {
      state.pluginInstallations.delete(plugin);
    }
  }
}

function getActivePluginInstallFrame(
  context: PluginSetupContext,
): PluginInstallFrame {
  const frame = getPluginInstallFrame(context);

  if (!frame.active) {
    throw setupContextInactiveError(frame.plugin.name);
  }

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
