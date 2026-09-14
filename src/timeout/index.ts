import {
  declareOfficialPluginRouteSpecializer,
  defineCapability,
  definePlugin,
} from "../plugin";

import type { Capability, Plugin } from "../plugin";

import { createOfficialApplicationHttpMarker } from "../runtime/application-http";

import {
  createApplicationTimeoutPolicy,
  runTimeoutBoundary,
} from "./application";
import { assertTimeoutDuration, GelisTimeoutError } from "./error";
import {
  createTimeoutRoutePolicy,
  TIMEOUT_ROUTE_BOUNDARY_FAMILY,
} from "./route-policy";

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

    /*
     * Route policies encode their owner directly, so route-only timeout
     * usage does not depend on plugin installation order. When this
     * capability is installed application-wide, every timed route in the
     * application must resolve to this same owner.
     */
    declareOfficialPluginRouteSpecializer(context, (route) => {
      const boundary = route.executionBoundary;

      if (
        boundary !== undefined &&
        boundary.family === TIMEOUT_ROUTE_BOUNDARY_FAMILY &&
        boundary.owner !== capability
      ) {
        throw new Error(
          "Gelis application cannot mix distinct timeout capability owners",
        );
      }
    });

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

      return createTimeoutRoutePolicy(
        capability,
        duration,
        (request, execute) =>
          runTimeoutBoundary(
            request,
            duration,
            "route",
            compiled.onTimeout,
            states,
            execute,
          ),
      );
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
