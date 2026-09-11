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
  signal: AbortSignal;
  readonly applicationController: AbortController | undefined;
  applicationDeadline: number | undefined;
}

export function createTimeoutState(
  applicationDuration: number | undefined,
): TimeoutState {
  const requests = new WeakMap<Request, TimeoutRequestState>();

  return {
    prepare(request) {
      if (applicationDuration === undefined) {
        requests.set(request, {
          signal: request.signal,
          applicationController: undefined,
          applicationDeadline: undefined,
        });
        return;
      }

      const applicationController = new AbortController();
      forwardAbort(request.signal, applicationController);

      requests.set(request, {
        signal: applicationController.signal,
        applicationController,
        applicationDeadline: undefined,
      });
    },

    signal(request) {
      return requests.get(request)?.signal ?? request.signal;
    },

    executeApplication(request, run) {
      if (applicationDuration === undefined) {
        return run();
      }

      const state = requests.get(request);
      if (state === undefined || state.applicationController === undefined) {
        throw new Error("Missing Gelis timeout request state");
      }

      state.applicationDeadline = Date.now() + applicationDuration;

      return executeWithDeadline(
        applicationDuration,
        "application",
        state.applicationController,
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

      const routeController = new AbortController();
      forwardAbort(state.signal, routeController);
      state.signal = routeController.signal;

      return executeWithDeadline(duration, "route", routeController, run);
    },
  };
}

function executeWithDeadline(
  duration: number,
  scope: TimeoutScope,
  controller: AbortController,
  run: () => Response | Promise<Response>,
): Response | Promise<Response> {
  let settled = false;
  let rejectTimeout: ((error: TimeoutError) => void) | undefined;

  const timer = setTimeout(() => {
    if (settled) {
      return;
    }

    settled = true;
    const error = new TimeoutError(duration, scope);
    controller.abort(error);
    rejectTimeout?.(error);
  }, duration);

  let result: Response | Promise<Response>;

  try {
    result = run();
  } catch (error) {
    settled = true;
    clearTimeout(timer);
    throw error;
  }

  if (result instanceof Response) {
    settled = true;
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
        clearTimeout(timer);
        resolve(response);
      },
      (error) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function forwardAbort(source: AbortSignal, target: AbortController): void {
  if (source.aborted) {
    target.abort(source.reason);
    return;
  }

  source.addEventListener(
    "abort",
    () => {
      target.abort(source.reason);
    },
    { once: true },
  );
}
