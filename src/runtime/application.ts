import type { OnError } from "../error";

import type { OnRequest } from "../request";

import type { RuntimeFetch } from "./fetch";

import {
  compileApplicationHttpErrorHooks,
  compileApplicationHttpFetch,
  createApplicationHttpRuntime,
  extractApplicationHttpPlan,
} from "./application-http";

import type { RuntimeApplicationHttpMethodResolver } from "./application-http";

import { compileOnErrorFetch } from "./on-error";

import { compileOnRequestFetch } from "./on-request";

export function compileApplicationFetch(
  routedFetch: RuntimeFetch,
  onRequestHooks: readonly OnRequest[] | undefined,
  onErrorHooks: readonly OnError[] | undefined,
  resolveHttpMethods?: RuntimeApplicationHttpMethodResolver,
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
    if (resolveHttpMethods === undefined) {
      throw new Error("Missing Gelis application HTTP method resolver");
    }

    const httpRuntime = createApplicationHttpRuntime(resolveHttpMethods);

    fetch = compileApplicationHttpFetch(httpPlan, fetch, httpRuntime);
  }

  /*
   * Error handling remains the outermost application boundary.
   *
   * Timeout contributes its default fallback after user onError hooks.
   * Active response policies finalize handled error responses exactly once.
   */
  const userErrorHooks = onErrorHooks ?? [];
  const compiledErrorHooks =
    httpPlan === undefined
      ? userErrorHooks
      : compileApplicationHttpErrorHooks(httpPlan, userErrorHooks);

  if (compiledErrorHooks.length > 0) {
    fetch = compileOnErrorFetch(compiledErrorHooks, fetch);
  }

  return fetch;
}
