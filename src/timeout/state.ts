import { TimeoutError } from "./error";

export interface TimeoutState {
  prepare(request: Request): void;
  signal(request: Request): AbortSignal;
  executeApplication(
    request: Request,
    run: () => Response | Promise<Response>,
  ): Response | Promise<Response>;
}

interface TimeoutRequestState {
  readonly signal: AbortSignal;
  readonly applicationController: AbortController | undefined;
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
        });
        return;
      }

      const applicationController = new AbortController();
      forwardAbort(request.signal, applicationController);

      requests.set(request, {
        signal: applicationController.signal,
        applicationController,
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

      return executeWithDeadline(
        applicationDuration,
        state.applicationController,
        run,
      );
    },
  };
}

function executeWithDeadline(
  duration: number,
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
    const error = new TimeoutError(duration, "application");
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
