import type { OnError, OnErrorContext } from "../error";

import type { RuntimeFetch } from "./fetch";

import { normalizeResponse } from "./response";

type RuntimeErrorHandler = (
  request: Request,
  error: unknown,
) => Response | Promise<Response>;

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

        /*
         * RuntimeFetch is an internal Gelis contract:
         * Response | Promise<Response>.
         */
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
       * Keep the successful request boundary independent
       * from the cold error-execution plan.
       *
       * This avoids the fixed generic-plan penalty for the
       * common two-handler configuration.
       */
      const compiledHooks: readonly OnError[] = [first, second];

      const handleError: RuntimeErrorHandler = (request, error) =>
        runErrorHooks(
          compiledHooks,
          {
            request,
            error,
          },
          error,
          0,
        );

      return compileErrorBoundary(innerFetch, handleError);
    }

    default: {
      /*
       * Configuration-time snapshot.
       *
       * Three or more handlers use the generic error plan.
       * Specialized triple plans did not improve the
       * successful request path on Bun/JSC.
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

function compileErrorBoundary(
  innerFetch: RuntimeFetch,
  handleError: RuntimeErrorHandler,
): RuntimeFetch {
  return (request) => {
    let result: Response | Promise<Response>;

    try {
      result = innerFetch(request);
    } catch (error) {
      return handleError(request, error);
    }

    if (result instanceof Promise) {
      return result.catch((error) => handleError(request, error));
    }

    return result;
  };
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

  /*
   * Response is the common synchronous handled-error path.
   * normalizeResponse() would perform the same check first.
   */
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
     * Deliberately do not wrap hook execution in another
     * error boundary.
     *
     * An error thrown by onError itself must escape
     * immediately and must not recursively enter onError.
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
