import type { OnError, OnErrorContext } from "../error";

import type { RuntimeFetch } from "./fetch";

import { normalizeResponse } from "./response";

export function compileOnErrorFetch(
  hooks: readonly OnError[],
  innerFetch: RuntimeFetch,
): RuntimeFetch {
  switch (hooks.length) {
    case 0:
      return innerFetch;

    case 1: {
      const hook = hooks[0];

      if (hook === undefined) {
        throw new Error("Invalid Gelis onError single plan");
      }

      return (request) => {
        let result: Response | Promise<Response>;

        try {
          result = innerFetch(request);
        } catch (error) {
          return runSingleErrorHook(hook, request, error);
        }

        if (result instanceof Promise) {
          return result.catch((error) =>
            runSingleErrorHook(hook, request, error),
          );
        }

        return result;
      };
    }

    case 2: {
      const first = hooks[0];
      const second = hooks[1];

      if (first === undefined || second === undefined) {
        throw new Error("Invalid Gelis onError pair plan");
      }

      /*
       * Snapshot once at compilation time.
       *
       * Successful requests must not pay the generic
       * PromiseLike boundary used by the many-hook plan.
       */
      const compiledHooks: readonly OnError[] = [first, second];

      return (request) => {
        let result: Response | Promise<Response>;

        try {
          result = innerFetch(request);
        } catch (error) {
          return runErrorHooks(
            compiledHooks,
            {
              request,
              error,
            },
            error,
            0,
          );
        }

        if (result instanceof Promise) {
          return result.catch((error) =>
            runErrorHooks(
              compiledHooks,
              {
                request,
                error,
              },
              error,
              0,
            ),
          );
        }

        return result;
      };
    }

    case 3: {
      const first = hooks[0];
      const second = hooks[1];
      const third = hooks[2];

      if (first === undefined || second === undefined || third === undefined) {
        throw new Error("Invalid Gelis onError triple plan");
      }

      const compiledHooks: readonly OnError[] = [first, second, third];

      return (request) => {
        let result: Response | Promise<Response>;

        try {
          result = innerFetch(request);
        } catch (error) {
          return runErrorHooks(
            compiledHooks,
            {
              request,
              error,
            },
            error,
            0,
          );
        }

        if (result instanceof Promise) {
          return result.catch((error) =>
            runErrorHooks(
              compiledHooks,
              {
                request,
                error,
              },
              error,
              0,
            ),
          );
        }

        return result;
      };
    }

    default: {
      /*
       * Configuration-time snapshot.
       *
       * Error handlers are intentionally
       * not merged or copied per request.
       */
      const compiledHooks = [...hooks];

      return (request) => {
        let result: Response | Promise<Response>;

        try {
          result = innerFetch(request);
        } catch (error) {
          return runErrorHooks(
            compiledHooks,
            {
              request,
              error,
            },
            error,
            0,
          );
        }

        if (isPromiseLike(result)) {
          return Promise.resolve(result).catch((error) =>
            runErrorHooks(
              compiledHooks,
              {
                request,
                error,
              },
              error,
              0,
            ),
          );
        }

        return result;
      };
    }
  }
}

function runSingleErrorHook(
  hook: OnError,
  request: Request,
  error: unknown,
): Response | Promise<Response> {
  const result = hook({
    request,
    error,
  });

  if (result instanceof Response) {
    return result;
  }

  if (isPromiseLike(result)) {
    return Promise.resolve(result).then((handled) => {
      if (handled !== undefined) {
        return normalizeResponse(handled);
      }

      throw error;
    });
  }

  if (result !== undefined) {
    return normalizeResponse(result);
  }

  throw error;
}

function runErrorHooks(
  hooks: readonly OnError[],
  context: OnErrorContext,
  originalError: unknown,
  startIndex: number,
): Response | Promise<Response> {
  for (let index = startIndex; index < hooks.length; index++) {
    const hook = hooks[index];

    if (hook === undefined) {
      continue;
    }

    /*
     * Deliberately do not wrap hook execution
     * in another error boundary.
     *
     * If an onError handler itself throws,
     * that new error must escape immediately.
     */
    const result = hook(context);

    if (isPromiseLike(result)) {
      return Promise.resolve(result).then((handled) => {
        if (handled !== undefined) {
          return normalizeResponse(handled);
        }

        return runErrorHooks(hooks, context, originalError, index + 1);
      });
    }

    if (result !== undefined) {
      return normalizeResponse(result);
    }
  }

  throw originalError;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return false;
  }

  return (
    typeof (
      value as {
        then?: unknown;
      }
    ).then === "function"
  );
}
