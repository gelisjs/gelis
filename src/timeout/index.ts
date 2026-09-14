import { defineCapability, definePlugin } from "../plugin";

import type { Capability, Plugin } from "../plugin";

import { createOfficialApplicationHttpMarker } from "../runtime/application-http";

import { createApplicationTimeoutPolicy } from "./application";
import { assertTimeoutDuration, GelisTimeoutError } from "./error";
import { createTimeoutRoutePolicy } from "./route-policy";

import type { TimeoutHandler, TimeoutRequestStateStore } from "./application";
import type { TimeoutRoutePolicy } from "./route-policy";
import type { TimeoutSignalState } from "./signal";

export { GelisTimeoutError } from "./error";
export type { TimeoutHandler } from "./application";
export type { TimeoutSource } from "./error";
export type { TimeoutRoutePolicy } from "./route-policy";

export interface TimeoutOptions {
  readonly duration?: number;
  readonly onTimeout?: TimeoutHandler;
}

export interface TimeoutCapability extends Plugin {
  route(duration: number): TimeoutRoutePolicy;
  signal(request: Request): AbortSignal | undefined;
}

const timeoutApplicationCapability = defineCapability(
  "gelis.timeout.application-policy",
) as unknown as Capability<TimeoutCapability>;

export function timeout(options?: TimeoutOptions): TimeoutCapability {
  const compiled = compileTimeoutOptions(options);
  const states: TimeoutRequestStateStore = new WeakMap<
    Request,
    TimeoutSignalState
  >();

  let capability!: TimeoutCapability;

  const plugin = definePlugin("gelis/timeout", (context) => {
    timeoutApplicationCapability.provide(context, capability);

    const duration = compiled.duration;

    if (duration === undefined) {
      return;
    }

    context.onRequest(
      createOfficialApplicationHttpMarker({
        kind: "timeout",
        policy: createApplicationTimeoutPolicy(
          duration,
          compiled.onTimeout,
          states,
        ),
      }),
    );
  });

  capability = {
    ...plugin,

    route(duration) {
      assertTimeoutDuration(duration);
      return createTimeoutRoutePolicy(capability, duration);
    },

    signal(request) {
      return states.get(request)?.signal;
    },
  };

  return capability;
}

interface CompiledTimeoutOptions {
  readonly duration: number | undefined;
  readonly onTimeout: TimeoutHandler | undefined;
}

function compileTimeoutOptions(
  options?: TimeoutOptions,
): CompiledTimeoutOptions {
  if (options !== undefined) {
    assertOptionsObject(options);
  }

  const duration = options?.duration;
  const onTimeout = options?.onTimeout;

  if (duration !== undefined) {
    assertTimeoutDuration(duration);
  }

  if (onTimeout !== undefined && typeof onTimeout !== "function") {
    throw new TypeError("Timeout onTimeout must be a function");
  }

  return {
    duration,
    onTimeout,
  };
}

function assertOptionsObject(options: TimeoutOptions): void {
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options)
  ) {
    throw new TypeError("Timeout options must be an object");
  }
}
