import { defineCapability, definePlugin } from "../plugin";

import type { Capability, Plugin } from "../plugin";

import { createOfficialApplicationHttpMarker } from "../runtime/application-http";

import type { RuntimeApplicationTimeoutPolicy } from "../runtime/application-http";

import { TimeoutError } from "./error";
import { compileTimeoutPolicy } from "./policy";
import { createTimeoutState } from "./state";

import type { TimeoutOptions } from "./policy";

export type { TimeoutOptions } from "./policy";
export { TimeoutError } from "./error";
export type { TimeoutScope } from "./error";

export interface TimeoutCapability extends Plugin {
  signal(request: Request): AbortSignal;
}

const timeoutCapability = defineCapability(
  "gelis.timeout.application-policy",
) as unknown as Capability<true>;

export function timeout(options?: TimeoutOptions): TimeoutCapability {
  const compiled = compileTimeoutPolicy(options);
  const state = createTimeoutState(compiled.duration);
  const policy = createTimeoutPolicy(compiled.duration, state);

  const plugin = definePlugin("gelis/timeout", (context) => {
    timeoutCapability.provide(context, true);

    context.onRequest(
      createOfficialApplicationHttpMarker({
        kind: "timeout",
        policy,
      }),
    );
  });

  return {
    ...plugin,
    signal(request) {
      return state.signal(request);
    },
  };
}

function createTimeoutPolicy(
  duration: number | undefined,
  state: ReturnType<typeof createTimeoutState>,
): RuntimeApplicationTimeoutPolicy {
  return {
    hasApplicationDeadline: duration !== undefined,

    prepare(request) {
      state.prepare(request);
    },

    execute(request, run) {
      return state.executeApplication(request, run);
    },

    handleError(error) {
      if (!(error instanceof TimeoutError)) {
        return undefined;
      }

      return Response.json(
        {
          error: {
            code: "REQUEST_TIMEOUT",
            message: "Request exceeded the configured timeout",
          },
        },
        {
          status: 504,
        },
      );
    },
  };
}
