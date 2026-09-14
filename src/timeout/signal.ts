import { createTimeoutExecutionCleanup } from "./cleanup";

import type { TimeoutExecutionCleanup } from "./cleanup";
import type { GelisTimeoutError } from "./error";

export interface TimeoutSignalState {
  readonly signal: AbortSignal;
  readonly cleanup: TimeoutExecutionCleanup;
  abortDeadline(error: GelisTimeoutError): boolean;
}

export function createTimeoutSignalState(request: Request): TimeoutSignalState {
  const controller = new AbortController();
  const cleanup = createTimeoutExecutionCleanup();
  const incoming = request.signal;

  if (incoming.aborted) {
    controller.abort(incoming.reason);
  } else {
    const onIncomingAbort = () => {
      if (!controller.signal.aborted) {
        controller.abort(incoming.reason);
      }
    };

    incoming.addEventListener("abort", onIncomingAbort, { once: true });
    cleanup.add(() => incoming.removeEventListener("abort", onIncomingAbort));
  }

  return {
    signal: controller.signal,
    cleanup,

    abortDeadline(error) {
      if (controller.signal.aborted) {
        return false;
      }

      controller.abort(error);
      return true;
    },
  };
}
