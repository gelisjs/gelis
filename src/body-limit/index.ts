import {
  declareOfficialPluginRouteSpecializer,
  defineCapability,
  definePlugin,
} from "../plugin";

import type { Capability, Plugin } from "../plugin";

import {
  assertBodyLimitMaxBytes,
  type RuntimeApplicationBodyLimitPolicy,
  type RuntimeBodyLimitExceededHandler,
} from "../runtime/body-limit";

import { specializeRuntimeInputPlanBodyLimit } from "../runtime/input";

export type BodyLimitExceededHandler = RuntimeBodyLimitExceededHandler;

export interface BodyLimitOptions {
  readonly maxBytes: number;
  readonly onExceeded?: BodyLimitExceededHandler;
}

export interface BodyLimitCapability extends Plugin {
  readonly maxBytes: number;
}

const applicationBodyLimitCapability = defineCapability(
  "gelis.body-limit.application-policy",
) as unknown as Capability<true>;

export function bodyLimit(options: BodyLimitOptions): BodyLimitCapability {
  assertBodyLimitMaxBytes(options.maxBytes);

  if (
    options.onExceeded !== undefined &&
    typeof options.onExceeded !== "function"
  ) {
    throw new TypeError("Gelis body limit onExceeded must be a function");
  }

  const policy: RuntimeApplicationBodyLimitPolicy = {
    maxBytes: options.maxBytes,
    ...(options.onExceeded === undefined
      ? {}
      : {
          onExceeded: options.onExceeded,
        }),
  };

  const plugin = definePlugin("gelis/body-limit", (context) => {
    applicationBodyLimitCapability.provide(context, true);

    declareOfficialPluginRouteSpecializer(context, (route) => {
      const input = route.input;

      if (input === undefined || input.body === undefined) {
        return;
      }

      route.input = specializeRuntimeInputPlanBodyLimit(input, policy);
    });
  }) as BodyLimitCapability;

  Object.defineProperty(plugin, "maxBytes", {
    configurable: false,
    enumerable: true,
    writable: false,
    value: options.maxBytes,
  });

  return plugin;
}
