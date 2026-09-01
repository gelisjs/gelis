import { normalizeResponse } from "./response";

import type { OnRequest, OnRequestContext } from "../request";

export type RuntimeFetch = (request: Request) => Response | Promise<Response>;

export function compileOnRequest(
  hooks: readonly OnRequest[],
): OnRequest | undefined {
  switch (hooks.length) {
    case 0:
      return undefined;

    case 1:
      return hooks[0];

    case 2: {
      const first = hooks[0];
      const second = hooks[1];

      if (first === undefined || second === undefined) {
        throw new Error("Invalid Gelis onRequest pair plan");
      }

      return (context) => runRequestPair(first, second, context);
    }

    case 3: {
      const first = hooks[0];
      const second = hooks[1];
      const third = hooks[2];

      if (first === undefined || second === undefined || third === undefined) {
        throw new Error("Invalid Gelis onRequest triple plan");
      }

      return (context) => runRequestTriple(first, second, third, context);
    }

    default: {
      /*
       * Snapshot the plan.
       *
       * Later registrations compile and install
       * a new executor rather than mutating the
       * executor already in use.
       */
      const compiledHooks = [...hooks];

      return (context) => runRequestMany(compiledHooks, context);
    }
  }
}

export function createOnRequestFetch(
  plan: OnRequest,
  routedFetch: RuntimeFetch,
): RuntimeFetch {
  return (request) => {
    const result = plan({
      request,
    });

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

function runRequestPair(
  first: OnRequest,
  second: OnRequest,
  context: OnRequestContext,
): unknown | PromiseLike<unknown> {
  const firstResult = first(context);

  if (isPromiseLike(firstResult)) {
    return Promise.resolve(firstResult).then((early) => {
      if (early !== undefined) {
        return early;
      }

      return second(context);
    });
  }

  if (firstResult !== undefined) {
    return firstResult;
  }

  return second(context);
}

function runRequestTriple(
  first: OnRequest,
  second: OnRequest,
  third: OnRequest,
  context: OnRequestContext,
): unknown | PromiseLike<unknown> {
  const firstResult = first(context);

  if (isPromiseLike(firstResult)) {
    return Promise.resolve(firstResult).then((early) => {
      if (early !== undefined) {
        return early;
      }

      return runRequestPair(second, third, context);
    });
  }

  if (firstResult !== undefined) {
    return firstResult;
  }

  const secondResult = second(context);

  if (isPromiseLike(secondResult)) {
    return Promise.resolve(secondResult).then((early) => {
      if (early !== undefined) {
        return early;
      }

      return third(context);
    });
  }

  if (secondResult !== undefined) {
    return secondResult;
  }

  return third(context);
}

function runRequestMany(
  hooks: readonly OnRequest[],
  context: OnRequestContext,
  startIndex = 0,
): unknown | PromiseLike<unknown> {
  for (let index = startIndex; index < hooks.length; index++) {
    const hook = hooks[index];

    if (hook === undefined) {
      continue;
    }

    const result = hook(context);

    if (isPromiseLike(result)) {
      return Promise.resolve(result).then((early) => {
        if (early !== undefined) {
          return early;
        }

        return runRequestMany(hooks, context, index + 1);
      });
    }

    if (result !== undefined) {
      return result;
    }
  }

  return undefined;
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
