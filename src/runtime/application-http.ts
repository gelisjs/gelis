import type { OnError } from "../error";
import type { OnRequest } from "../request";
import { ALL_ROUTE_METHOD } from "../http-method";
import type { RuntimeFetch } from "./fetch";
import { normalizeResponseForRequest } from "./response";
import { pathnameFromUrl } from "./url";

export type RuntimeApplicationHttpMethodResolver = (
  pathname: string,
) => readonly string[];

export interface RuntimeApplicationHttpRuntime {
  matchingMethods(request: Request): readonly string[];
}

export interface RuntimeApplicationHttpPolicy {
  prepare(
    request: Request,
    runtime: RuntimeApplicationHttpRuntime,
  ): void | Response | PromiseLike<void | Response>;

  finalize(
    request: Request,
    response: Response,
  ): Response | PromiseLike<Response>;
}

export interface RuntimeApplicationHttpPlan {
  readonly cors?: RuntimeApplicationHttpPolicy;
  readonly secureHeaders?: RuntimeApplicationHttpPolicy;
}

interface RuntimeApplicationHttpMarker {
  readonly kind: "cors" | "secure-headers";
  readonly policy: RuntimeApplicationHttpPolicy;
}

const GELIS_APPLICATION_HTTP_MARKER = Symbol(
  "gelis.internal.application-http.marker",
);

type MarkedOnRequest = OnRequest & {
  readonly [GELIS_APPLICATION_HTTP_MARKER]: RuntimeApplicationHttpMarker;
};

export interface RuntimeApplicationHttpExtraction {
  readonly onRequestHooks: readonly OnRequest[] | undefined;
  readonly plan: RuntimeApplicationHttpPlan | undefined;
}

/**
 * Private official-subpath bridge.
 *
 * The returned function is configuration metadata, not a runtime hook.
 * compileApplicationFetch() removes it from the ordinary onRequest plan.
 */
export function createOfficialApplicationHttpMarker(
  marker: RuntimeApplicationHttpMarker,
): OnRequest {
  const hook = (() => {
    throw new Error(
      "Gelis official application HTTP marker escaped compile-time extraction",
    );
  }) as unknown as MarkedOnRequest;

  Object.defineProperty(hook, GELIS_APPLICATION_HTTP_MARKER, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: marker,
  });

  return hook;
}

export function extractApplicationHttpPlan(
  hooks: readonly OnRequest[] | undefined,
): RuntimeApplicationHttpExtraction {
  if (hooks === undefined || hooks.length === 0) {
    return {
      onRequestHooks: hooks,
      plan: undefined,
    };
  }

  let cors: RuntimeApplicationHttpPolicy | undefined;
  let secureHeaders: RuntimeApplicationHttpPolicy | undefined;
  let ordinaryCount = 0;

  for (let index = 0; index < hooks.length; index++) {
    const hook = hooks[index]!;
    const marker = readMarker(hook);

    if (marker === undefined) {
      ordinaryCount++;
      continue;
    }

    if (marker.kind === "cors") {
      if (cors !== undefined) {
        throw new Error(
          "Multiple Gelis CORS application policies were compiled",
        );
      }

      cors = marker.policy;
      continue;
    }

    if (secureHeaders !== undefined) {
      throw new Error(
        "Multiple Gelis secure-header application policies were compiled",
      );
    }

    secureHeaders = marker.policy;
  }

  if (cors === undefined && secureHeaders === undefined) {
    return {
      onRequestHooks: hooks,
      plan: undefined,
    };
  }

  let ordinaryHooks: readonly OnRequest[] | undefined;

  if (ordinaryCount === 0) {
    ordinaryHooks = undefined;
  } else {
    const filtered = new Array<OnRequest>(ordinaryCount);
    let target = 0;

    for (let index = 0; index < hooks.length; index++) {
      const hook = hooks[index]!;

      if (readMarker(hook) === undefined) {
        filtered[target++] = hook;
      }
    }

    ordinaryHooks = filtered;
  }

  return {
    onRequestHooks: ordinaryHooks,
    plan: createApplicationHttpPlan(cors, secureHeaders),
  };
}

function createApplicationHttpPlan(
  cors: RuntimeApplicationHttpPolicy | undefined,
  secureHeaders: RuntimeApplicationHttpPolicy | undefined,
): RuntimeApplicationHttpPlan {
  if (cors === undefined) {
    return { secureHeaders: secureHeaders! };
  }

  if (secureHeaders === undefined) {
    return { cors };
  }

  return {
    cors,
    secureHeaders,
  };
}

export function createApplicationHttpRuntime(
  resolveMethods: RuntimeApplicationHttpMethodResolver,
): RuntimeApplicationHttpRuntime {
  return {
    matchingMethods(request) {
      return resolveAdvertisedMethods(
        resolveMethods(pathnameFromUrl(request.url)),
      );
    },
  };
}

export function compileApplicationHttpFetch(
  plan: RuntimeApplicationHttpPlan,
  innerFetch: RuntimeFetch,
  runtime: RuntimeApplicationHttpRuntime,
): RuntimeFetch {
  let fetch = innerFetch;

  const cors = plan.cors;
  if (cors !== undefined) {
    fetch = compilePolicyFetch(cors, fetch, runtime);
  }

  const secureHeaders = plan.secureHeaders;
  if (secureHeaders !== undefined) {
    fetch = compilePolicyFetch(secureHeaders, fetch, runtime);
  }

  return fetch;
}

export function compileApplicationHttpErrorHooks(
  plan: RuntimeApplicationHttpPlan,
  hooks: readonly OnError[],
): readonly OnError[] {
  const cors = plan.cors;
  const secureHeaders = plan.secureHeaders;

  if (
    (cors === undefined && secureHeaders === undefined) ||
    hooks.length === 0
  ) {
    return hooks;
  }

  const compiled = new Array<OnError>(hooks.length);

  for (let index = 0; index < hooks.length; index++) {
    let hook = hooks[index]!;

    if (cors !== undefined) {
      hook = compilePolicyErrorHook(cors, hook);
    }

    if (secureHeaders !== undefined) {
      hook = compilePolicyErrorHook(secureHeaders, hook);
    }

    compiled[index] = hook;
  }

  return compiled;
}

function resolveAdvertisedMethods(
  methods: readonly string[],
): readonly string[] {
  let hasHead = false;
  let hasOptions = false;
  let hasAll = false;
  let advertisedMethods = 0;

  for (let index = 0; index < methods.length; index++) {
    const method = methods[index]!;

    if (method === ALL_ROUTE_METHOD) {
      hasAll = true;
      continue;
    }

    advertisedMethods++;

    if (method === "HEAD") {
      hasHead = true;
    } else if (method === "OPTIONS") {
      hasOptions = true;
    }
  }

  if (advertisedMethods === 0) {
    return hasAll ? [ALL_ROUTE_METHOD] : [];
  }

  const resolved: string[] = [];

  for (let index = 0; index < methods.length; index++) {
    const method = methods[index]!;

    if (method === ALL_ROUTE_METHOD) {
      continue;
    }

    resolved.push(method);

    if (method === "GET" && !hasHead) {
      resolved.push("HEAD");
    }
  }

  if (!hasOptions) {
    resolved.push("OPTIONS");
  }

  if (hasAll) {
    resolved.push(ALL_ROUTE_METHOD);
  }

  return resolved;
}

function compilePolicyFetch(
  policy: RuntimeApplicationHttpPolicy,
  innerFetch: RuntimeFetch,
  runtime: RuntimeApplicationHttpRuntime,
): RuntimeFetch {
  return (request) => {
    const prepared = policy.prepare(request, runtime);

    if (isPromiseLike(prepared)) {
      return Promise.resolve(prepared).then((early) => {
        if (early !== undefined) {
          return early;
        }

        return finalizeFetchResult(policy, request, innerFetch(request));
      });
    }

    if (prepared !== undefined) {
      return prepared;
    }

    return finalizeFetchResult(policy, request, innerFetch(request));
  };
}

function finalizeFetchResult(
  policy: RuntimeApplicationHttpPolicy,
  request: Request,
  result: Response | Promise<Response>,
): Response | Promise<Response> {
  if (result instanceof Promise) {
    return result.then((response) =>
      resolveFinalized(policy, request, response),
    );
  }

  return resolveFinalized(policy, request, result);
}

function compilePolicyErrorHook(
  policy: RuntimeApplicationHttpPolicy,
  hook: OnError,
): OnError {
  return (context) => {
    const handled = hook(context);

    if (isPromiseLike(handled)) {
      return Promise.resolve(handled).then((value) => {
        if (value === undefined) {
          return undefined;
        }

        return resolveFinalized(
          policy,
          context.request,
          normalizeResponseForRequest(context.request, value),
        );
      });
    }

    if (handled === undefined) {
      return undefined;
    }

    return resolveFinalized(
      policy,
      context.request,
      normalizeResponseForRequest(context.request, handled),
    );
  };
}

function resolveFinalized(
  policy: RuntimeApplicationHttpPolicy,
  request: Request,
  response: Response,
): Response | Promise<Response> {
  const finalized = policy.finalize(request, response);

  return isPromiseLike(finalized) ? Promise.resolve(finalized) : finalized;
}

function readMarker(hook: OnRequest): RuntimeApplicationHttpMarker | undefined {
  return (hook as Partial<MarkedOnRequest>)[GELIS_APPLICATION_HTTP_MARKER];
}

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return false;
  }

  return typeof (value as { then?: unknown }).then === "function";
}
