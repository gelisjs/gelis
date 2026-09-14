import { resolveRequestId } from "./policy";

import type { CompiledRequestIdPolicy } from "./policy";

export interface RequestIdState {
  prepare(request: Request): string;
  get(request: Request): string | undefined;
}

export function createRequestIdState(
  policy: CompiledRequestIdPolicy,
): RequestIdState {
  const values = new WeakMap<Request, string>();

  return {
    prepare(request) {
      const value = resolveRequestId(policy, request);
      values.set(request, value);
      return value;
    },

    get(request) {
      return values.get(request);
    },
  };
}
