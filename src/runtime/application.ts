import type { OnError } from "../error";

import type { OnRequest } from "../request";

import type { RuntimeFetch } from "./fetch";

import { compileOnErrorFetch } from "./on-error";

import { compileOnRequestFetch } from "./on-request";

export function compileApplicationFetch(
  routedFetch: RuntimeFetch,
  onRequestHooks: readonly OnRequest[] | undefined,
  onErrorHooks: readonly OnError[] | undefined,
): RuntimeFetch {
  let fetch = routedFetch;

  /*
   * Compile from the inside out.
   *
   * onRequest must execute inside the
   * onError boundary so request hook
   * failures can be intercepted.
   */
  if (onRequestHooks !== undefined && onRequestHooks.length > 0) {
    fetch = compileOnRequestFetch(onRequestHooks, fetch);
  }

  /*
   * Error handling is always the
   * outermost application boundary.
   */
  if (onErrorHooks !== undefined && onErrorHooks.length > 0) {
    fetch = compileOnErrorFetch(onErrorHooks, fetch);
  }

  return fetch;
}
