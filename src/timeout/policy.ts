export interface TimeoutOptions {
  readonly duration?: number;
}

export interface CompiledTimeoutPolicy {
  readonly duration: number | undefined;
}

const MAX_TIMEOUT_DURATION = 2_147_483_647;

export function compileTimeoutPolicy(
  options?: TimeoutOptions,
): CompiledTimeoutPolicy {
  assertOptionsObject(options);

  const duration =
    options?.duration === undefined ? undefined : options.duration;

  if (duration !== undefined) {
    assertTimeoutDuration(duration);
  }

  return { duration };
}

export function assertTimeoutDuration(value: unknown): asserts value is number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) > MAX_TIMEOUT_DURATION
  ) {
    throw new TypeError(
      "Gelis timeout duration must be an integer between 1 and 2147483647 milliseconds",
    );
  }
}

function assertOptionsObject(options: TimeoutOptions | undefined): void {
  if (
    options !== undefined &&
    (typeof options !== "object" || options === null || Array.isArray(options))
  ) {
    throw new TypeError("Gelis timeout options must be an object");
  }
}
