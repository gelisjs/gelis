import type {
  RuntimeAfterHandle,
  RuntimeBeforeHandle,
  RuntimeRouteContext,
} from "./types";

export function compileBeforeHandle(
  globalHooks: readonly RuntimeBeforeHandle[],
  localHook: RuntimeBeforeHandle | undefined,
): RuntimeBeforeHandle | undefined {
  /*
   * Zero-global fast path.
   *
   * There is nothing to compile or snapshot when
   * the application has no global beforeHandle hooks.
   *
   * Returning the local hook directly preserves
   * the exact existing semantics while avoiding
   * a temporary array allocation for every route.
   */
  if (globalHooks.length === 0) {
    return localHook;
  }

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
        throw new Error("Invalid Gelis beforeHandle pair plan");
      }

      return (context) => runBeforePair(first, second, context);
    }

    case 3: {
      const first = hooks[0];
      const second = hooks[1];
      const third = hooks[2];

      if (first === undefined || second === undefined || third === undefined) {
        throw new Error("Invalid Gelis beforeHandle triple plan");
      }

      return (context) => runBeforeTriple(first, second, third, context);
    }

    default:
      return (context) => runBeforeMany(hooks, context);
  }
}

export function compileAfterHandle(
  globalHooks: readonly RuntimeAfterHandle[],
  localHook: RuntimeAfterHandle | undefined,
): RuntimeAfterHandle | undefined {
  /*
   * Same zero-global specialization as beforeHandle.
   *
   * A route-local afterHandle is already the complete
   * effective plan when no global hooks exist.
   */
  if (globalHooks.length === 0) {
    return localHook;
  }

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
        throw new Error("Invalid Gelis afterHandle pair plan");
      }

      return (context, result) => runAfterPair(first, second, context, result);
    }

    case 3: {
      const first = hooks[0];
      const second = hooks[1];
      const third = hooks[2];

      if (first === undefined || second === undefined || third === undefined) {
        throw new Error("Invalid Gelis afterHandle triple plan");
      }

      return (context, result) =>
        runAfterTriple(first, second, third, context, result);
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

function runBeforeTriple(
  first: RuntimeBeforeHandle,
  second: RuntimeBeforeHandle,
  third: RuntimeBeforeHandle,
  context: RuntimeRouteContext,
): unknown | PromiseLike<unknown> {
  const firstResult = first(context);

  if (isPromiseLike(firstResult)) {
    return Promise.resolve(firstResult).then((early) => {
      if (early !== undefined) {
        return early;
      }

      return runBeforePair(second, third, context);
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

function runAfterTriple(
  first: RuntimeAfterHandle,
  second: RuntimeAfterHandle,
  third: RuntimeAfterHandle,
  context: RuntimeRouteContext,
  result: unknown,
): void | PromiseLike<void> {
  const firstResult = first(context, result);

  if (isPromiseLike(firstResult)) {
    return Promise.resolve(firstResult).then(() =>
      runAfterPair(second, third, context, result),
    );
  }

  const secondResult = second(context, result);

  if (isPromiseLike(secondResult)) {
    return Promise.resolve(secondResult).then(() => third(context, result));
  }

  return third(context, result);
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
