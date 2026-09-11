import { TimeoutError } from "./error";

import type { TimeoutScope } from "./error";

export interface TimeoutState {
  prepare(request: Request): void;
  signal(request: Request): AbortSignal;
  executeApplication(
    request: Request,
    run: () => Response | Promise<Response>,
  ): Response | Promise<Response>;
  executeRoute(
    request: Request,
    duration: number,
    run: () => Response | Promise<Response>,
  ): Response | Promise<Response>;
}

interface TimeoutRequestState {
  cooperativeController: AbortController | undefined;
  cooperativeAbortRecorded: boolean;
  cooperativeAbortReason: unknown;
  applicationDeadline: number | undefined;
  activeFrameworkDeadlines: number;
}

export function createTimeoutState(
  applicationDuration: number | undefined,
): TimeoutState {
  const requests = new WeakMap<Request, TimeoutRequestState>();

  return {
    prepare(request) {
      requests.set(request, {
        cooperativeController: undefined,
        cooperativeAbortRecorded: false,
        cooperativeAbortReason: undefined,
        applicationDeadline: undefined,
        activeFrameworkDeadlines: 0,
      });
    },

    signal(request) {
      const state = requests.get(request);

      if (state === undefined) {
        return request.signal;
      }

      const existing = state.cooperativeController;
      if (existing !== undefined) {
        return existing.signal;
      }

      if (
        state.activeFrameworkDeadlines === 0 &&
        !state.cooperativeAbortRecorded
      ) {
        return request.signal;
      }

      const controller = new AbortController();
      state.cooperativeController = controller;

      if (state.cooperativeAbortRecorded) {
        controller.abort(state.cooperativeAbortReason);
        return controller.signal;
      }

      if (request.signal.aborted) {
        recordCooperativeAbort(state, request.signal.reason);
        return controller.signal;
      }

      request.signal.addEventListener(
        "abort",
        () => {
          recordCooperativeAbort(state, request.signal.reason);
        },
        { once: true },
      );

      return controller.signal;
    },

    executeApplication(request, run) {
      if (applicationDuration === undefined) {
        return run();
      }

      const state = requests.get(request);
      if (state === undefined) {
        throw new Error("Missing Gelis timeout request state");
      }

      state.applicationDeadline = Date.now() + applicationDuration;

      return executeWithDeadline(
        request,
        state,
        applicationDuration,
        "application",
        run,
      );
    },

    executeRoute(request, duration, run) {
      const state = requests.get(request);

      if (state === undefined) {
        throw new Error("Missing Gelis timeout request state");
      }

      const routeDeadline = Date.now() + duration;
      const applicationDeadline = state.applicationDeadline;

      /*
       * The application deadline started earlier. If its absolute deadline
       * is already earlier than or equal to this route deadline, adding a
       * route timer cannot win and would only add overhead.
       */
      if (
        applicationDeadline !== undefined &&
        applicationDeadline <= routeDeadline
      ) {
        return run();
      }

      return executeWithDeadline(request, state, duration, "route", run);
    },
  };
}

function executeWithDeadline(
  request: Request,
  state: TimeoutRequestState,
  duration: number,
  scope: TimeoutScope,
  run: () => Response | Promise<Response>,
): Response | Promise<Response> {
  let settled = false;
  let rejectTimeout: ((error: TimeoutError) => void) | undefined;

  state.activeFrameworkDeadlines++;

  const settleDeadline = () => {
    state.activeFrameworkDeadlines--;
  };

  const timer = setTimeout(() => {
    if (settled) {
      return;
    }

    settled = true;
    settleDeadline();
    const error = new TimeoutError(duration, scope);

    if (!state.cooperativeAbortRecorded) {
      recordCooperativeAbort(
        state,
        request.signal.aborted ? request.signal.reason : error,
      );
    }

    rejectTimeout?.(error);
  }, duration);

  let result: Response | Promise<Response>;

  try {
    result = run();
  } catch (error) {
    settled = true;
    settleDeadline();
    clearTimeout(timer);
    throw error;
  }

  if (result instanceof Response) {
    settled = true;
    settleDeadline();
    clearTimeout(timer);
    return result;
  }

  return new Promise<Response>((resolve, reject) => {
    rejectTimeout = reject;

    result.then(
      (response) => {
        if (settled) {
          return;
        }

        settled = true;
        settleDeadline();
        clearTimeout(timer);
        resolve(response);
      },
      (error) => {
        if (settled) {
          return;
        }

        settled = true;
        settleDeadline();
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function recordCooperativeAbort(
  state: TimeoutRequestState,
  reason: unknown,
): void {
  if (state.cooperativeAbortRecorded) {
    return;
  }

  state.cooperativeAbortRecorded = true;
  state.cooperativeAbortReason = reason;
  state.cooperativeController?.abort(reason);
}
