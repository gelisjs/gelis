import type { OnError } from "../error";

import type { OnRequest } from "../request";

import type { RuntimeFetch } from "./fetch";

import {
  compileApplicationHttpErrorHooks,
  compileApplicationHttpFetch,
  extractApplicationHttpPlan,
} from "./application-http";

import type { RuntimeApplicationHttpRuntime } from "./application-http";

import { compileOnErrorFetch } from "./on-error";

import { compileOnRequestFetch } from "./on-request";

export function compileApplicationFetch(
  routedFetch: RuntimeFetch,
  onRequestHooks: readonly OnRequest[] | undefined,
  onErrorHooks: readonly OnError[] | undefined,
  httpRuntime: RuntimeApplicationHttpRuntime,
): RuntimeFetch {
  const extracted = extractApplicationHttpPlan(onRequestHooks);

  let fetch = routedFetch;

  /*
   * Compile from the inside out.
   *
   * Ordinary onRequest hooks remain directly around routing.
   * Official protocol preparation then executes before those hooks.
   */
  const ordinaryOnRequestHooks = extracted.onRequestHooks;
  if (
    ordinaryOnRequestHooks !== undefined &&
    ordinaryOnRequestHooks.length > 0
  ) {
    fetch = compileOnRequestFetch(ordinaryOnRequestHooks, fetch);
  }

  const httpPlan = extracted.plan;
  if (httpPlan !== undefined) {
    fetch = compileApplicationHttpFetch(httpPlan, fetch, httpRuntime);
  }

  /*
   * Error handling remains the outermost application boundary.
   *
   * When an official response policy is active, handled onError values
   * are finalized by that policy before they leave the boundary.
   */
  if (onErrorHooks !== undefined && onErrorHooks.length > 0) {
    const compiledErrorHooks =
      httpPlan === undefined
        ? onErrorHooks
        : compileApplicationHttpErrorHooks(httpPlan, onErrorHooks);

    fetch = compileOnErrorFetch(compiledErrorHooks, fetch);
  }

  return fetch;
}
