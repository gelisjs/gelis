import type { RuntimeApplicationTimeoutPolicy } from "../runtime/application-http";
import { normalizeResponseForRequest } from "../runtime/response";

import { GelisTimeoutError } from "./error";

import type { TimeoutSource } from "./error";
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
      return runTimeoutBoundary(
        request,
        duration,
        "application",
        onTimeout,
        states,
        () => innerFetch(request),
      );
    },
  };
}

export function runTimeoutBoundary(
  request: Request,
  duration: number,
  source: TimeoutSource,
  onTimeout: TimeoutHandler | undefined,
  states: TimeoutRequestStateStore,
  execute: () => Response | Promise<Response>,
): Response | Promise<Response> {
  const existingState = states.get(request);
  const ownsState = existingState === undefined;
  const state = existingState ?? createTimeoutSignalState(request);
  const timeoutError = new GelisTimeoutError(duration, source);

  if (ownsState) {
    states.set(request, state);
  }

  let terminalSelected = false;
  let resolveBoundary: ((response: Response) => void) | undefined;
  let rejectBoundary: ((error: unknown) => void) | undefined;

  const deleteOwnedState = () => {
    if (ownsState) {
      states.delete(request);
    }
  };

  const timer = setTimeout(() => {
    if (terminalSelected) {
      return;
    }

    /*
     * Deadline selection itself is the terminal race event.
     *
     * Shared timeout state means a route deadline and its enclosing
     * application deadline cancel each other's pending timers through the
     * same cleanup set. The earlier deadline therefore wins without ever
     * replacing the AbortSignal object exposed to user code.
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
      deleteOwnedState();
      rejectBoundary!(error);
      return;
    }

    if (isPromiseLike(timeoutResponse)) {
      Promise.resolve(timeoutResponse).then(
        (response) => {
          deleteOwnedState();
          resolveBoundary!(normalizeResponseForRequest(request, response));
        },
        (error) => {
          deleteOwnedState();
          rejectBoundary!(error);
        },
      );
      return;
    }

    deleteOwnedState();
    resolveBoundary!(normalizeResponseForRequest(request, timeoutResponse));
  }, duration);

  state.cleanup.add(() => clearTimeout(timer));

  let execution: Response | Promise<Response>;

  try {
    execution = execute();
  } catch (error) {
    terminalSelected = true;
    state.cleanup.run();
    deleteOwnedState();
    throw error;
  }

  if (!(execution instanceof Promise)) {
    terminalSelected = true;
    state.cleanup.run();
    deleteOwnedState();
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
      deleteOwnedState();
      resolveBoundary!(response);
    },
    (error) => {
      if (terminalSelected) {
        return;
      }

      terminalSelected = true;
      state.cleanup.run();
      deleteOwnedState();
      rejectBoundary!(error);
    },
  );

  return boundary;
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
