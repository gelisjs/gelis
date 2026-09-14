import type { RuntimeApplicationTimeoutPolicy } from "../runtime/application-http";
import { normalizeResponseForRequest } from "../runtime/response";

import { GelisTimeoutError } from "./error";
import { createTimeoutSignalState } from "./signal";

import type { TimeoutSignalState } from "./signal";

export type TimeoutHandler = (
  request: Request,
  error: GelisTimeoutError,
) => Response | PromiseLike<Response>;

export type TimeoutRequestStateStore = WeakMap<Request, TimeoutSignalState>;

export function createApplicationTimeoutPolicy(
  duration: number,
  onTimeout: TimeoutHandler | undefined,
  states: TimeoutRequestStateStore,
): RuntimeApplicationTimeoutPolicy {
  return {
    run(request, innerFetch) {
      const state = createTimeoutSignalState(request);
      const timeoutError = new GelisTimeoutError(duration, "application");

      states.set(request, state);

      let terminalSelected = false;
      let resolveBoundary: ((response: Response) => void) | undefined;
      let rejectBoundary: ((error: unknown) => void) | undefined;

      const timer = setTimeout(() => {
        if (terminalSelected) {
          return;
        }

        /*
         * Select the framework deadline before running onTimeout.
         *
         * An asynchronous timeout handler must not allow a later user
         * execution result to replace the already-winning deadline.
         */
        terminalSelected = true;
        state.abortDeadline(timeoutError);
        state.cleanup.run();

        let timeoutResponse: Response | PromiseLike<Response>;

        try {
          timeoutResponse =
            onTimeout === undefined
              ? defaultTimeoutResponse()
              : onTimeout(request, timeoutError);
        } catch (error) {
          states.delete(request);
          rejectBoundary!(error);
          return;
        }

        if (isPromiseLike(timeoutResponse)) {
          Promise.resolve(timeoutResponse).then(
            (response) => {
              states.delete(request);
              resolveBoundary!(normalizeResponseForRequest(request, response));
            },
            (error) => {
              states.delete(request);
              rejectBoundary!(error);
            },
          );
          return;
        }

        states.delete(request);
        resolveBoundary!(normalizeResponseForRequest(request, timeoutResponse));
      }, duration);

      state.cleanup.add(() => clearTimeout(timer));

      let execution: Response | Promise<Response>;

      try {
        execution = innerFetch(request);
      } catch (error) {
        terminalSelected = true;
        state.cleanup.run();
        states.delete(request);
        throw error;
      }

      if (!(execution instanceof Promise)) {
        terminalSelected = true;
        state.cleanup.run();
        states.delete(request);
        return execution;
      }

      const boundary = new Promise<Response>((resolve, reject) => {
        resolveBoundary = resolve;
        rejectBoundary = reject;
      });

      execution.then(
        (response) => {
          if (terminalSelected) {
            return;
          }

          terminalSelected = true;
          state.cleanup.run();
          states.delete(request);
          resolveBoundary!(response);
        },
        (error) => {
          if (terminalSelected) {
            return;
          }

          terminalSelected = true;
          state.cleanup.run();
          states.delete(request);
          rejectBoundary!(error);
        },
      );

      return boundary;
    },
  };
}

function defaultTimeoutResponse(): Response {
  return new Response("Service Unavailable", {
    status: 503,
  });
}

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return false;
  }

  return typeof (value as { then?: unknown }).then === "function";
}
