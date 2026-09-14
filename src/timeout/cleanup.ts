export interface TimeoutExecutionCleanup {
  add(task: () => void): void;
  run(): void;
  readonly closed: boolean;
}

export function createTimeoutExecutionCleanup(): TimeoutExecutionCleanup {
  let tasks: (() => void)[] | undefined = [];

  return {
    add(task) {
      const current = tasks;

      if (current === undefined) {
        task();
        return;
      }

      current.push(task);
    },

    run() {
      const current = tasks;

      if (current === undefined) {
        return;
      }

      tasks = undefined;

      for (let index = current.length - 1; index >= 0; index--) {
        current[index]!();
      }
    },

    get closed() {
      return tasks === undefined;
    },
  };
}
