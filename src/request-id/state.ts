import type { CompiledRequestIdPolicy } from "./policy";

export interface RequestIdState {
  prepare(request: Request): string;
  get(request: Request): string | undefined;
}

export function createRequestIdState(
  policy: CompiledRequestIdPolicy,
): RequestIdState {
  const requestIds = new WeakMap<Request, string>();

  return {
    prepare(request) {
      const requestId = policy.resolve(request);
      requestIds.set(request, requestId);
      return requestId;
    },

    get(request) {
      return requestIds.get(request);
    },
  };
}
