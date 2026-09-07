export type ApplicationStartupTask = () => void | PromiseLike<void>;

export type ApplicationCleanup = () => void | PromiseLike<void>;

type ApplicationStartupPhase =
  | "pending"
  | "running"
  | "ready"
  | "failed"
  | "closed";

interface ApplicationStartupState {
  phase: ApplicationStartupPhase;

  readonly tasks: ApplicationStartupTask[];

  readonly cleanups: ApplicationCleanup[];

  readyPromise: Promise<void> | undefined;

  closePromise: Promise<void> | undefined;
}

const applicationStartupStates = new WeakMap<object, ApplicationStartupState>();

const resolvedReadyPromise = Promise.resolve();

const resolvedClosePromise = Promise.resolve();

export function enqueueApplicationStartup(
  application: object,

  task: ApplicationStartupTask,
): void {
  let state = applicationStartupStates.get(application);

  if (state === undefined) {
    state = {
      phase: "pending",

      tasks: [task],

      cleanups: [],

      readyPromise: undefined,

      closePromise: undefined,
    };

    applicationStartupStates.set(application, state);

    return;
  }

  if (state.phase !== "pending") {
    throw new Error(
      "Cannot register Gelis startup work after application readiness has begun",
    );
  }

  state.tasks.push(task);
}

export function registerApplicationCleanup(
  application: object,

  cleanup: ApplicationCleanup,
): void {
  const state = applicationStartupStates.get(application);

  if (state === undefined || state.phase !== "running") {
    throw new Error(
      "Cannot register Gelis cleanup outside application startup",
    );
  }

  state.cleanups.push(cleanup);
}

export function hasPendingApplicationStartup(application: object): boolean {
  const state = applicationStartupStates.get(application);

  return state !== undefined && state.phase !== "ready";
}

export function readyApplication(application: object): Promise<void> {
  let state = applicationStartupStates.get(application);

  if (state === undefined) {
    state = {
      phase: "ready",

      tasks: [],

      cleanups: [],

      readyPromise: resolvedReadyPromise,

      closePromise: undefined,
    };

    applicationStartupStates.set(application, state);

    return resolvedReadyPromise;
  }

  const existing = state.readyPromise;

  if (existing !== undefined) {
    return existing;
  }

  if (state.phase === "closed") {
    const closedPromise = Promise.reject(applicationClosedError());

    state.readyPromise = closedPromise;

    return closedPromise;
  }

  if (state.phase !== "pending") {
    throw new Error(`Invalid Gelis application startup phase "${state.phase}"`);
  }

  state.phase = "running";

  const current = state;

  /*
   * Defer execution to a microtask so readyPromise is installed
   * before the first startup task can run.
   *
   * This makes a re-entrant ready() call deterministic and prevents
   * the queue from being executed twice.
   */
  const readyPromise = Promise.resolve().then(async () => {
    try {
      for (let index = 0; index < current.tasks.length; index++) {
        const task = current.tasks[index]!;

        await task();
      }

      current.phase = "ready";
    } catch (error) {
      current.phase = "failed";

      const cleanupErrors = await drainCleanupStack(current.cleanups);

      if (cleanupErrors.length === 0) {
        throw error;
      }

      throw startupRollbackError(error, cleanupErrors);
    } finally {
      /*
       * Startup work is single-shot.
       *
       * Release task closures after completion/failure instead of
       * retaining application startup resources unnecessarily.
       */
      current.tasks.length = 0;
    }
  });

  current.readyPromise = readyPromise;

  return readyPromise;
}

export function closeApplication(application: object): Promise<void> {
  let state = applicationStartupStates.get(application);

  if (state === undefined) {
    state = {
      phase: "closed",

      tasks: [],

      cleanups: [],

      readyPromise: undefined,

      closePromise: resolvedClosePromise,
    };

    applicationStartupStates.set(application, state);

    return resolvedClosePromise;
  }

  const existing = state.closePromise;

  if (existing !== undefined) {
    return existing;
  }

  /*
   * Closing an application that has never started must not trigger
   * resource acquisition merely so those resources can be closed.
   */
  if (state.phase === "pending") {
    state.tasks.length = 0;

    state.phase = "closed";

    state.closePromise = resolvedClosePromise;

    return resolvedClosePromise;
  }

  const current = state;

  const closePromise = (async () => {
    try {
      /*
       * If startup is already running, it cannot be synchronously cancelled.
       * Wait for it to settle. A failed startup performs its own rollback.
       */
      if (current.phase === "running") {
        try {
          await current.readyPromise;
        } catch {
          return;
        }
      }

      if (current.phase === "ready") {
        const cleanupErrors = await drainCleanupStack(current.cleanups);

        if (cleanupErrors.length !== 0) {
          throw cleanupFailureError(cleanupErrors);
        }
      }

      /*
       * A failed startup has already drained the cleanup stack as rollback.
       * No second cleanup pass is needed here.
       */
    } finally {
      current.tasks.length = 0;

      current.phase = "closed";
    }
  })();

  current.closePromise = closePromise;

  return closePromise;
}

async function drainCleanupStack(
  cleanups: ApplicationCleanup[],
): Promise<unknown[]> {
  const errors: unknown[] = [];

  while (cleanups.length !== 0) {
    const cleanup = cleanups.pop()!;

    try {
      await cleanup();
    } catch (error) {
      errors.push(error);
    }
  }

  return errors;
}

function cleanupFailureError(errors: readonly unknown[]): unknown {
  if (errors.length === 1) {
    return errors[0];
  }

  return new AggregateError(
    errors,

    "Multiple Gelis application cleanup handlers failed",
  );
}

function startupRollbackError(
  startupError: unknown,

  cleanupErrors: readonly unknown[],
): AggregateError {
  return new AggregateError(
    [startupError, ...cleanupErrors],

    "Gelis application startup failed and rollback cleanup also failed",
  );
}

function applicationClosedError(): Error {
  return new Error("Cannot start a closed Gelis application");
}
