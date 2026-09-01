export interface OnErrorContext {
  readonly request: Request;
  readonly error: unknown;
}

export type OnError = (
  context: OnErrorContext,
) => unknown | PromiseLike<unknown>;
