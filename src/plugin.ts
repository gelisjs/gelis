const PLUGIN_SETUP_RUNTIME = Symbol("gelis.plugin.setup.runtime");

interface PluginRuntimeState {
  readonly capabilities: Map<object, unknown>;
}

interface PluginInstallFrame {
  readonly plugin: Plugin;

  readonly state: PluginRuntimeState;

  readonly pendingCapabilities: Map<object, unknown>;
}

export interface PluginSetupContext {
  readonly [PLUGIN_SETUP_RUNTIME]: PluginInstallFrame;
}

export interface Capability<Value> {
  readonly name: string;

  require(context: PluginSetupContext): Value;

  provide(context: PluginSetupContext, value: Value): void;
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
      const frame = getPluginInstallFrame(context);

      const pending = frame.pendingCapabilities;

      if (pending.has(capability)) {
        return pending.get(capability) as never;
      }

      const capabilities = frame.state.capabilities;

      if (!capabilities.has(capability)) {
        throw new Error(
          `Missing capability dependency "${name}" required by plugin "${frame.plugin.name}"`,
        );
      }

      return capabilities.get(capability) as never;
    },

    provide(context, value) {
      const frame = getPluginInstallFrame(context);

      if (
        frame.pendingCapabilities.has(capability) ||
        frame.state.capabilities.has(capability)
      ) {
        throw new Error(
          `Capability "${name}" is already provided while installing plugin "${frame.plugin.name}"`,
        );
      }

      frame.pendingCapabilities.set(capability, value);
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
    };

    applicationPluginStates.set(application, state);
  }

  const frame: PluginInstallFrame = {
    plugin,

    state,

    pendingCapabilities: new Map(),
  };

  const context: PluginSetupContext = {
    [PLUGIN_SETUP_RUNTIME]: frame,
  };

  const result = plugin.setup(context);

  if (isPromiseLike(result)) {
    throw new Error(`Async setup is not supported for plugin "${plugin.name}"`);
  }

  for (const [capability, value] of frame.pendingCapabilities) {
    state.capabilities.set(capability, value);
  }
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
