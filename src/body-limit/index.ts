import {
  declareOfficialPluginRouteSpecializer,
  defineCapability,
  definePlugin,
} from "../plugin";

import type { Capability, Plugin } from "../plugin";

import {
  assertBodyLimitMaxBytes,
  bodyTooLargeResponse,
  compileRuntimeLimitedBodyReader,
  type RuntimeApplicationBodyLimitPolicy,
  type RuntimeBodyLimitExceededHandler,
} from "../runtime/body-limit";

import { specializeRuntimeInputPlanBodyLimit } from "../runtime/input";

export type BodyLimitExceededHandler = RuntimeBodyLimitExceededHandler;

export interface BodyLimitOptions {
  readonly maxBytes: number;
  readonly onExceeded?: BodyLimitExceededHandler;
}

export type BodyLimitReadResult =
  | {
      readonly ok: true;
      readonly bytes: Uint8Array;
    }
  | {
      readonly ok: false;
      readonly response: Response;
    };

export interface BodyLimitCapability extends Plugin {
  readonly maxBytes: number;
  readBody(request: Request): Promise<BodyLimitReadResult>;
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

  const readLimitedBody = compileRuntimeLimitedBodyReader(options.maxBytes);

  const readBody = async (request: Request): Promise<BodyLimitReadResult> => {
    const result = await readLimitedBody(request);

    if (result.ok) {
      return result;
    }

    const onExceeded = policy.onExceeded;

    return {
      ok: false,
      response:
        onExceeded === undefined
          ? bodyTooLargeResponse()
          : await onExceeded(request, policy.maxBytes),
    };
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

  Object.defineProperties(plugin, {
    maxBytes: {
      configurable: false,
      enumerable: true,
      writable: false,
      value: options.maxBytes,
    },
    readBody: {
      configurable: false,
      enumerable: true,
      writable: false,
      value: readBody,
    },
  });

  return plugin;
}
