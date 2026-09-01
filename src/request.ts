export interface OnRequestContext {
  readonly request: Request;
}

export type OnRequest = (
  context: OnRequestContext,
) => unknown | PromiseLike<unknown>;
