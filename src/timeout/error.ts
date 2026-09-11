export type TimeoutScope = "application" | "route";

export class TimeoutError extends Error {
  readonly code = "REQUEST_TIMEOUT" as const;
  readonly duration: number;
  readonly scope: TimeoutScope;

  constructor(duration: number, scope: TimeoutScope) {
    super("Request exceeded the configured timeout");
    this.name = "TimeoutError";
    this.duration = duration;
    this.scope = scope;
  }
}
