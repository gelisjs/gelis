export type TimeoutSource = "application" | "route";

export class GelisTimeoutError extends Error {
  override readonly name = "GelisTimeoutError";

  constructor(
    readonly duration: number,
    readonly source: TimeoutSource,
  ) {
    super(`Gelis ${source} timeout after ${duration}ms`);
  }
}

export function assertTimeoutDuration(duration: number): void {
  if (!Number.isSafeInteger(duration) || duration <= 0) {
    throw new RangeError(
      "Timeout duration must be a positive safe integer in milliseconds",
    );
  }
}
