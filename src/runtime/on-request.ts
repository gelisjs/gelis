import { normalizeResponse } from "./response";

import type { OnRequest, OnRequestContext } from "../request";

export type RuntimeFetch = (request: Request) => Response | Promise<Response>;

export function compileOnRequestFetch(
  hooks: readonly OnRequest[],
  routedFetch: RuntimeFetch,
): RuntimeFetch {
  switch (hooks.length) {
    case 0:
      return routedFetch;

    case 1: {
      const hook = hooks[0];

      if (hook === undefined) {
        throw new Error("Invalid Gelis onRequest single plan");
      }

      return (request) => {
        const context = {
          request,
        };

        const result = hook(context);

        if (isPromiseLike(result)) {
          return Promise.resolve(result).then((early) => {
            if (early !== undefined) {
              return normalizeResponse(early);
            }

            return routedFetch(request);
          });
        }

        if (result !== undefined) {
          return normalizeResponse(result);
        }

        return routedFetch(request);
      };
    }

    case 2: {
      const first = hooks[0];

      const second = hooks[1];

      if (first === undefined || second === undefined) {
        throw new Error("Invalid Gelis onRequest pair plan");
      }

      /*
       * Keep the synchronous pair path fully
       * inline.
       *
       * Avoid an additional compiled-plan
       * function call followed by a pair
       * executor call on every request.
       */
      return (request) => {
        const context = {
          request,
        };

        const firstResult = first(context);

        if (isPromiseLike(firstResult)) {
          return Promise.resolve(firstResult).then((early) => {
            if (early !== undefined) {
              return normalizeResponse(early);
            }

            const secondResult = second(context);

            if (isPromiseLike(secondResult)) {
              return Promise.resolve(secondResult).then((secondEarly) => {
                if (secondEarly !== undefined) {
                  return normalizeResponse(secondEarly);
                }

                return routedFetch(request);
              });
            }

            if (secondResult !== undefined) {
              return normalizeResponse(secondResult);
            }

            return routedFetch(request);
          });
        }

        if (firstResult !== undefined) {
          return normalizeResponse(firstResult);
        }

        const secondResult = second(context);

        if (isPromiseLike(secondResult)) {
          return Promise.resolve(secondResult).then((early) => {
            if (early !== undefined) {
              return normalizeResponse(early);
            }

            return routedFetch(request);
          });
        }

        if (secondResult !== undefined) {
          return normalizeResponse(secondResult);
        }

        return routedFetch(request);
      };
    }

    case 3: {
      const first = hooks[0];

      const second = hooks[1];

      const third = hooks[2];

      if (first === undefined || second === undefined || third === undefined) {
        throw new Error("Invalid Gelis onRequest triple plan");
      }

      /*
       * The synchronous triple path is also
       * deliberately inlined.
       */
      return (request) => {
        const context = {
          request,
        };

        const firstResult = first(context);

        if (isPromiseLike(firstResult)) {
          return Promise.resolve(firstResult).then((early) => {
            if (early !== undefined) {
              return normalizeResponse(early);
            }

            return runRemainingTriple(
              second,
              third,
              context,
              request,
              routedFetch,
            );
          });
        }

        if (firstResult !== undefined) {
          return normalizeResponse(firstResult);
        }

        const secondResult = second(context);

        if (isPromiseLike(secondResult)) {
          return Promise.resolve(secondResult).then((early) => {
            if (early !== undefined) {
              return normalizeResponse(early);
            }

            return runLastHook(third, context, request, routedFetch);
          });
        }

        if (secondResult !== undefined) {
          return normalizeResponse(secondResult);
        }

        const thirdResult = third(context);

        if (isPromiseLike(thirdResult)) {
          return Promise.resolve(thirdResult).then((early) => {
            if (early !== undefined) {
              return normalizeResponse(early);
            }

            return routedFetch(request);
          });
        }

        if (thirdResult !== undefined) {
          return normalizeResponse(thirdResult);
        }

        return routedFetch(request);
      };
    }

    default: {
      /*
       * Configuration-time snapshot.
       *
       * Later registration installs a completely
       * new compiled fetch executor.
       */
      const compiledHooks = [...hooks];

      return (request) => {
        const context = {
          request,
        };

        return runMany(compiledHooks, context, request, routedFetch, 0);
      };
    }
  }
}

function runRemainingTriple(
  second: OnRequest,
  third: OnRequest,
  context: OnRequestContext,
  request: Request,
  routedFetch: RuntimeFetch,
): Response | Promise<Response> {
  const secondResult = second(context);

  if (isPromiseLike(secondResult)) {
    return Promise.resolve(secondResult).then((early) => {
      if (early !== undefined) {
        return normalizeResponse(early);
      }

      return runLastHook(third, context, request, routedFetch);
    });
  }

  if (secondResult !== undefined) {
    return normalizeResponse(secondResult);
  }

  return runLastHook(third, context, request, routedFetch);
}

function runLastHook(
  hook: OnRequest,
  context: OnRequestContext,
  request: Request,
  routedFetch: RuntimeFetch,
): Response | Promise<Response> {
  const result = hook(context);

  if (isPromiseLike(result)) {
    return Promise.resolve(result).then((early) => {
      if (early !== undefined) {
        return normalizeResponse(early);
      }

      return routedFetch(request);
    });
  }

  if (result !== undefined) {
    return normalizeResponse(result);
  }

  return routedFetch(request);
}

function runMany(
  hooks: readonly OnRequest[],
  context: OnRequestContext,
  request: Request,
  routedFetch: RuntimeFetch,
  startIndex: number,
): Response | Promise<Response> {
  for (let index = startIndex; index < hooks.length; index++) {
    const hook = hooks[index];

    if (hook === undefined) {
      continue;
    }

    const result = hook(context);

    if (isPromiseLike(result)) {
      return Promise.resolve(result).then((early) => {
        if (early !== undefined) {
          return normalizeResponse(early);
        }

        return runMany(hooks, context, request, routedFetch, index + 1);
      });
    }

    if (result !== undefined) {
      return normalizeResponse(result);
    }
  }

  return routedFetch(request);
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
