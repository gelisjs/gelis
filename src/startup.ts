export type ApplicationStartupTask = () => void | PromiseLike<void>;

type ApplicationStartupPhase = "pending" | "running" | "ready" | "failed";

interface ApplicationStartupState {
  phase: ApplicationStartupPhase;

  readonly tasks: ApplicationStartupTask[];

  readyPromise: Promise<void> | undefined;
}

const applicationStartupStates = new WeakMap<object, ApplicationStartupState>();

const resolvedReadyPromise = Promise.resolve();

export function enqueueApplicationStartup(
  application: object,

  task: ApplicationStartupTask,
): void {
  let state = applicationStartupStates.get(application);

  if (state === undefined) {
    state = {
      phase: "pending",

      tasks: [task],

      readyPromise: undefined,
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

export function readyApplication(application: object): Promise<void> {
  let state = applicationStartupStates.get(application);

  if (state === undefined) {
    state = {
      phase: "ready",

      tasks: [],

      readyPromise: resolvedReadyPromise,
    };

    applicationStartupStates.set(application, state);

    return resolvedReadyPromise;
  }

  const existing = state.readyPromise;

  if (existing !== undefined) {
    return existing;
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

      throw error;
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
