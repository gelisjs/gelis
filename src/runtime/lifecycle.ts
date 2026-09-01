import type {
  RuntimeAfterHandle,
  RuntimeBeforeHandle,
  RuntimeRouteContext,
} from "./types";

export function compileBeforeHandle(
  globalHooks: readonly RuntimeBeforeHandle[],

  localHook: RuntimeBeforeHandle | undefined,
): RuntimeBeforeHandle | undefined {
  const hooks =
    localHook === undefined ? [...globalHooks] : [...globalHooks, localHook];

  switch (hooks.length) {
    case 0:
      return undefined;

    case 1:
      return hooks[0];

    case 2: {
      const first = hooks[0];
      const second = hooks[1];

      if (first === undefined || second === undefined) {
        throw new Error("Invalid Gelis beforeHandle plan");
      }

      return (context) => runBeforePair(first, second, context);
    }

    default:
      return (context) => runBeforeMany(hooks, context);
  }
}

export function compileAfterHandle(
  globalHooks: readonly RuntimeAfterHandle[],

  localHook: RuntimeAfterHandle | undefined,
): RuntimeAfterHandle | undefined {
  const hooks =
    localHook === undefined ? [...globalHooks] : [localHook, ...globalHooks];

  switch (hooks.length) {
    case 0:
      return undefined;

    case 1:
      return hooks[0];

    case 2: {
      const first = hooks[0];
      const second = hooks[1];

      if (first === undefined || second === undefined) {
        throw new Error("Invalid Gelis afterHandle plan");
      }

      return (context, result) => runAfterPair(first, second, context, result);
    }

    default:
      return (context, result) => runAfterMany(hooks, context, result);
  }
}

function runBeforePair(
  first: RuntimeBeforeHandle,

  second: RuntimeBeforeHandle,

  context: RuntimeRouteContext,
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

function runBeforeMany(
  hooks: readonly RuntimeBeforeHandle[],

  context: RuntimeRouteContext,

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

        return runBeforeMany(hooks, context, index + 1);
      });
    }

    if (result !== undefined) {
      return result;
    }
  }

  return undefined;
}

function runAfterPair(
  first: RuntimeAfterHandle,

  second: RuntimeAfterHandle,

  context: RuntimeRouteContext,

  result: unknown,
): void | PromiseLike<void> {
  const firstResult = first(context, result);

  if (isPromiseLike(firstResult)) {
    return Promise.resolve(firstResult).then(() => second(context, result));
  }

  return second(context, result);
}

function runAfterMany(
  hooks: readonly RuntimeAfterHandle[],

  context: RuntimeRouteContext,

  result: unknown,

  startIndex = 0,
): void | PromiseLike<void> {
  for (let index = startIndex; index < hooks.length; index++) {
    const hook = hooks[index];

    if (hook === undefined) {
      continue;
    }

    const hookResult = hook(context, result);

    if (isPromiseLike(hookResult)) {
      return Promise.resolve(hookResult).then(() =>
        runAfterMany(hooks, context, result, index + 1),
      );
    }
  }
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
