import { getModuleRuntimeRoutes } from "./module";

import { pathnameFromUrl } from "./runtime/url";

import { RouteBuilder } from "./route-builder";

import { GELIS_CONTRACT_SOURCE } from "./contract-source";

import type {
  ApplicationContractSnapshot,
  ContractRouteSnapshot,
} from "./contract-source";

import {
  cloneOpenAPIRouteMetadata,
  RUNTIME_ROUTE_CONTRACT_METADATA,
} from "./runtime/contract-metadata";

import { Router, type RuntimeRouteMatch } from "./runtime/router";

import { normalizeResponse, runtimeReply } from "./runtime/response";

import { compileAfterHandle, compileBeforeHandle } from "./runtime/lifecycle";

import type { OnRequest } from "./request";

import { compileApplicationFetch } from "./runtime/application";

import type { RuntimeFetch } from "./runtime/fetch";

import type { OnError } from "./error";

import {
  RUNTIME_INPUT_BODY,
  RUNTIME_INPUT_QUERY,
  RUNTIME_INPUT_QUERY_BODY,
  invalidQueryEncodingResponse,
  isJsonContentType,
  malformedJsonResponse,
  parseQueryFromUrl,
  unsupportedMediaTypeResponse,
  validationErrorResponse,
} from "./runtime/input";

import {
  RUNTIME_ROUTE_AFTER_HANDLE,
  RUNTIME_ROUTE_AFTER_HANDLE_RESPONSE,
  RUNTIME_ROUTE_BEFORE_AFTER_HANDLE,
  RUNTIME_ROUTE_BEFORE_AFTER_HANDLE_RESPONSE,
  RUNTIME_ROUTE_BEFORE_HANDLE,
  RUNTIME_ROUTE_BEFORE_HANDLE_RESPONSE,
  RUNTIME_ROUTE_INPUT,
  RUNTIME_ROUTE_INPUT_AFTER_HANDLE,
  RUNTIME_ROUTE_INPUT_AFTER_HANDLE_RESPONSE,
  RUNTIME_ROUTE_INPUT_BEFORE_AFTER_HANDLE,
  RUNTIME_ROUTE_INPUT_BEFORE_AFTER_HANDLE_RESPONSE,
  RUNTIME_ROUTE_INPUT_BEFORE_HANDLE,
  RUNTIME_ROUTE_INPUT_BEFORE_HANDLE_RESPONSE,
  RUNTIME_ROUTE_INPUT_RESPONSE,
  RUNTIME_ROUTE_PLAIN,
  RUNTIME_ROUTE_RESPONSE,
} from "./runtime/types";

import type { ModuleRef, ModuleRoutes } from "./module";

import type { GlobalAfterHandle, GlobalBeforeHandle } from "./route";

import type { RuntimeInputPlan } from "./runtime/input";

import type {
  RuntimeAfterHandle,
  RuntimeBeforeHandle,
  RuntimeRouteContext,
  RuntimeRouteHandler,
  RuntimeRouteRecord,
} from "./runtime/types";

type RuntimeRouteInvoker = (
  route: RuntimeRouteRecord,

  request: Request,

  params: Record<string, string>,

  query: unknown,

  body: unknown,
) => Response | Promise<Response>;

export interface GelisInternalRouter {
  register(route: RuntimeRouteRecord): void;

  match(
    method: string,

    pathname: string,
  ): RuntimeRouteMatch | undefined;
}

interface AppRuntimeState {
  router: GelisInternalRouter;

  /*
   * Plain applications keep only their actual
   * RuntimeRouteRecord objects.
   *
   * Local lifecycle sidecars are allocated lazily
   * only when application-global lifecycle is used.
   */
  routes: RuntimeRouteRecord[];

  localBeforeHooks: (RuntimeBeforeHandle | undefined)[] | undefined;

  localAfterHooks: (RuntimeAfterHandle | undefined)[] | undefined;

  globalBeforeHooks: RuntimeBeforeHandle[];

  globalAfterHooks: RuntimeAfterHandle[];

  onRequestHooks: OnRequest[] | undefined;

  routedFetch: RuntimeFetch | undefined;

  onErrorHooks: OnError[] | undefined;
}

export const GELIS_INTERNAL_RUNTIME = Symbol("gelis.internal.runtime");

export interface GelisInternalRuntimeControl {
  installRouter(router: GelisInternalRouter): void;
}

export class Gelis extends RouteBuilder<""> {
  readonly #state: AppRuntimeState;

  #recompileApplicationFetch(): void {
    const state = this.#state;

    let routedFetch = state.routedFetch;

    /*
     * Capture the original routed fetch exactly
     * once, before any app-level wrapper exists.
     */
    if (routedFetch === undefined) {
      routedFetch = this.fetch.bind(this);

      state.routedFetch = routedFetch;
    }

    const compiledFetch = compileApplicationFetch(
      routedFetch,
      state.onRequestHooks,
      state.onErrorHooks,
    );

    Object.defineProperty(this, "fetch", {
      configurable: true,

      writable: true,

      value: compiledFetch,
    });
  }

  constructor() {
    const router = new Router();

    const state: AppRuntimeState = {
      router,

      routes: [],

      localBeforeHooks: undefined,

      localAfterHooks: undefined,

      globalBeforeHooks: [],

      globalAfterHooks: [],

      onRequestHooks: undefined,

      routedFetch: undefined,

      onErrorHooks: undefined,
    };

    super(
      "",

      (route) => {
        registerAppRuntimeRoute(state, route);
      },
    );

    this.#state = state;
  }

  [GELIS_INTERNAL_RUNTIME](): GelisInternalRuntimeControl {
    const state = this.#state;

    return {
      installRouter(router: GelisInternalRouter): void {
        state.router = router;
      },
    };
  }

  private [GELIS_CONTRACT_SOURCE](): ApplicationContractSnapshot {
    const entries = this.#state.routes;

    const routes = new Array<ContractRouteSnapshot>(entries.length);

    for (let index = 0; index < entries.length; index++) {
      const route = entries[index]!;

      const input = route.input;

      const contractMetadata = route[RUNTIME_ROUTE_CONTRACT_METADATA];

      const openapi = contractMetadata?.openapi;

      routes[index] = {
        method: route.method,

        path: route.path,

        query: input?.query,

        body: input?.body,

        responses: route.responses,

        openapi:
          openapi === undefined || openapi === false
            ? openapi
            : cloneOpenAPIRouteMetadata(openapi),
      };
    }

    return {
      routes,
    };
  }

  onRequest(hook: OnRequest): this {
    const state = this.#state;

    const hooks = state.onRequestHooks;

    if (hooks === undefined) {
      state.onRequestHooks = [hook];
    } else {
      hooks.push(hook);
    }

    this.#recompileApplicationFetch();

    return this;
  }

  onError(hook: OnError): this {
    const state = this.#state;

    const hooks = state.onErrorHooks;

    if (hooks === undefined) {
      state.onErrorHooks = [hook];
    } else {
      hooks.push(hook);
    }

    this.#recompileApplicationFetch();

    return this;
  }

  onBeforeHandle(hook: GlobalBeforeHandle): this {
    const state = this.#state;

    ensureLocalLifecycleSidecar(state);

    state.globalBeforeHooks.push(hook as RuntimeBeforeHandle);

    recompileAppLifecycle(state);

    return this;
  }

  onAfterHandle(hook: GlobalAfterHandle): this {
    const state = this.#state;

    ensureLocalLifecycleSidecar(state);

    state.globalAfterHooks.push(hook as RuntimeAfterHandle);

    recompileAppLifecycle(state);

    return this;
  }

  mount<const Prefix extends string, const Routes extends ModuleRoutes>(
    module: ModuleRef<Prefix, Routes>,
  ): void {
    const routes = getModuleRuntimeRoutes(module);

    for (const template of routes) {
      /*
       * Modules are templates shared between
       * applications.
       *
       * Never compile application-global
       * lifecycle directly into the module's
       * original runtime record.
       */
      const route: RuntimeRouteRecord = {
        ...template,
      };

      registerAppRuntimeRoute(this.#state, route);
    }
  }

  fetch(request: Request): Response | Promise<Response> {
    const pathname = pathnameFromUrl(request.url);

    const matched = this.#state.router.match(request.method, pathname);

    if (!matched) {
      return new Response(
        "Not Found",

        {
          status: 404,
        },
      );
    }

    const { route, params } = matched;

    if (route.flags === RUNTIME_ROUTE_PLAIN) {
      const result = route.handler({
        request,
        params,

        query: undefined,

        body: undefined,

        reply: runtimeReply,
      });

      if (isPromiseLike(result)) {
        return Promise.resolve(result).then(normalizeResponse);
      }

      return normalizeResponse(result);
    }

    /*
     * Response-only routes are the second critical
     * execution shape after completely plain routes.
     *
     * Promote them ahead of the generic route-plan
     * switch so executable response contracts do not
     * pay generic lifecycle dispatch overhead.
     *
     * Plain routes return above, so this comparison
     * adds no cost to the zero-unused fast path.
     */
    if (route.flags === RUNTIME_ROUTE_RESPONSE) {
      const result = route.handler({
        request,
        params,

        query: undefined,

        body: undefined,

        reply: runtimeReply,
      });

      const finalize = route.responsePlan!.finalize;

      if (isPromiseLike(result)) {
        return Promise.resolve(result).then(finalize);
      }

      return finalize(result);
    }

    switch (route.flags) {
      case RUNTIME_ROUTE_INPUT: {
        return runInputPlan(
          route,
          request,
          params,

          invokeHandlerRoute,
        );
      }

      case RUNTIME_ROUTE_BEFORE_HANDLE: {
        return invokeBeforeHandleRoute(
          route,
          request,
          params,
          undefined,
          undefined,
        );
      }

      case RUNTIME_ROUTE_INPUT_BEFORE_HANDLE: {
        return runInputPlan(
          route,
          request,
          params,

          invokeBeforeHandleRoute,
        );
      }

      case RUNTIME_ROUTE_AFTER_HANDLE: {
        return invokeAfterHandleRoute(
          route,
          request,
          params,
          undefined,
          undefined,
        );
      }

      case RUNTIME_ROUTE_INPUT_AFTER_HANDLE: {
        return runInputPlan(
          route,
          request,
          params,

          invokeAfterHandleRoute,
        );
      }

      case RUNTIME_ROUTE_BEFORE_AFTER_HANDLE: {
        return invokeBeforeAfterHandleRoute(
          route,
          request,
          params,
          undefined,
          undefined,
        );
      }

      case RUNTIME_ROUTE_INPUT_BEFORE_AFTER_HANDLE: {
        return runInputPlan(
          route,
          request,
          params,

          invokeBeforeAfterHandleRoute,
        );
      }

      case RUNTIME_ROUTE_INPUT_RESPONSE: {
        return runInputPlan(
          route,
          request,
          params,

          invokeResponseRoute,
        );
      }

      case RUNTIME_ROUTE_BEFORE_HANDLE_RESPONSE: {
        return invokeBeforeHandleResponseRoute(
          route,
          request,
          params,
          undefined,
          undefined,
        );
      }

      case RUNTIME_ROUTE_INPUT_BEFORE_HANDLE_RESPONSE: {
        return runInputPlan(
          route,
          request,
          params,

          invokeBeforeHandleResponseRoute,
        );
      }

      case RUNTIME_ROUTE_AFTER_HANDLE_RESPONSE: {
        return invokeAfterHandleResponseRoute(
          route,
          request,
          params,
          undefined,
          undefined,
        );
      }

      case RUNTIME_ROUTE_INPUT_AFTER_HANDLE_RESPONSE: {
        return runInputPlan(
          route,
          request,
          params,

          invokeAfterHandleResponseRoute,
        );
      }

      case RUNTIME_ROUTE_BEFORE_AFTER_HANDLE_RESPONSE: {
        return invokeBeforeAfterHandleResponseRoute(
          route,
          request,
          params,
          undefined,
          undefined,
        );
      }

      case RUNTIME_ROUTE_INPUT_BEFORE_AFTER_HANDLE_RESPONSE: {
        return runInputPlan(
          route,
          request,
          params,

          invokeBeforeAfterHandleResponseRoute,
        );
      }

      default:
        throw new Error("Invalid Gelis runtime route flags");
    }
  }
}

function registerAppRuntimeRoute(
  state: AppRuntimeState,

  route: RuntimeRouteRecord,
): void {
  /*
   * Router registration happens before mutating
   * application bookkeeping.
   *
   * Duplicate rejection therefore leaves app state
   * unchanged.
   */
  state.router.register(route);

  const localBeforeHooks = state.localBeforeHooks;

  const localAfterHooks = state.localAfterHooks;

  /*
   * No application-global lifecycle has ever been
   * installed.
   *
   * RouteBuilder already compiled the correct
   * route-local flags and hooks, so there is
   * nothing else to do.
   */
  if (localBeforeHooks === undefined || localAfterHooks === undefined) {
    state.routes.push(route);

    return;
  }

  const localBeforeHandle = route.beforeHandle;

  const localAfterHandle = route.afterHandle;

  localBeforeHooks.push(localBeforeHandle);

  localAfterHooks.push(localAfterHandle);

  applyLifecyclePlan(state, route, localBeforeHandle, localAfterHandle);

  state.routes.push(route);
}

function ensureLocalLifecycleSidecar(state: AppRuntimeState): void {
  if (state.localBeforeHooks !== undefined) {
    return;
  }

  const routes = state.routes;

  const localBeforeHooks = new Array<RuntimeBeforeHandle | undefined>(
    routes.length,
  );

  const localAfterHooks = new Array<RuntimeAfterHandle | undefined>(
    routes.length,
  );

  for (let index = 0; index < routes.length; index++) {
    const route = routes[index];

    if (route === undefined) {
      continue;
    }

    /*
     * Before the first global lifecycle hook exists,
     * these fields still contain the original
     * route-local hooks.
     */
    localBeforeHooks[index] = route.beforeHandle;

    localAfterHooks[index] = route.afterHandle;
  }

  state.localBeforeHooks = localBeforeHooks;

  state.localAfterHooks = localAfterHooks;
}

function recompileAppLifecycle(state: AppRuntimeState): void {
  const localBeforeHooks = state.localBeforeHooks;

  const localAfterHooks = state.localAfterHooks;

  if (localBeforeHooks === undefined || localAfterHooks === undefined) {
    throw new Error("Missing Gelis local lifecycle sidecar");
  }

  const routes = state.routes;

  for (let index = 0; index < routes.length; index++) {
    const route = routes[index];

    if (route === undefined) {
      continue;
    }

    applyLifecyclePlan(
      state,
      route,
      localBeforeHooks[index],
      localAfterHooks[index],
    );
  }
}

function applyLifecyclePlan(
  state: AppRuntimeState,

  route: RuntimeRouteRecord,

  localBeforeHandle: RuntimeBeforeHandle | undefined,

  localAfterHandle: RuntimeAfterHandle | undefined,
): void {
  const beforeHandle = compileBeforeHandle(
    state.globalBeforeHooks,
    localBeforeHandle,
  );

  const afterHandle = compileAfterHandle(
    state.globalAfterHooks,
    localAfterHandle,
  );

  route.beforeHandle = beforeHandle;

  route.afterHandle = afterHandle;

  let flags = 0;

  if (route.input !== undefined) {
    flags |= RUNTIME_ROUTE_INPUT;
  }

  if (beforeHandle !== undefined) {
    flags |= RUNTIME_ROUTE_BEFORE_HANDLE;
  }

  if (afterHandle !== undefined) {
    flags |= RUNTIME_ROUTE_AFTER_HANDLE;
  }

  /*
   * Global lifecycle recompilation must never erase
   * executable response behavior compiled at route
   * registration.
   */
  if (route.responsePlan !== undefined) {
    flags |= RUNTIME_ROUTE_RESPONSE;
  }

  route.flags = flags;
}

function runInputPlan(
  route: RuntimeRouteRecord,

  request: Request,

  params: Record<string, string>,

  invoke: RuntimeRouteInvoker,
): Response | Promise<Response> {
  const input = route.input;

  if (input === undefined) {
    throw new Error("Missing Gelis runtime input plan");
  }

  return runInputRoute(route, input, request, params, invoke);
}

function runInputRoute(
  route: RuntimeRouteRecord,

  input: RuntimeInputPlan,

  request: Request,

  params: Record<string, string>,

  invoke: RuntimeRouteInvoker,
): Response | Promise<Response> {
  switch (input.kind) {
    case RUNTIME_INPUT_QUERY:
      return runQueryRoute(route, input, request, params, invoke);

    case RUNTIME_INPUT_BODY:
      return runBodyRoute(route, input, request, params, undefined, invoke);

    case RUNTIME_INPUT_QUERY_BODY:
      return runQueryBodyRoute(route, input, request, params, invoke);

    default:
      throw new Error("Invalid Gelis runtime input plan");
  }
}

function runQueryRoute(
  route: RuntimeRouteRecord,

  input: RuntimeInputPlan,

  request: Request,

  params: Record<string, string>,

  invoke: RuntimeRouteInvoker,
): Response | Promise<Response> {
  let rawQuery: Record<string, string | string[]>;

  try {
    rawQuery = parseQueryFromUrl(request.url);
  } catch {
    return invalidQueryEncodingResponse();
  }

  const schema = input.query;

  if (!schema) {
    throw new Error("Missing query schema");
  }

  const validation = schema["~standard"].validate(rawQuery);

  if (isPromiseLike(validation)) {
    return Promise.resolve(validation).then((result) => {
      if (result.issues !== undefined) {
        return validationErrorResponse("query", result.issues);
      }

      return invoke(route, request, params, result.value, undefined);
    });
  }

  if (validation.issues !== undefined) {
    return validationErrorResponse("query", validation.issues);
  }

  return invoke(route, request, params, validation.value, undefined);
}

function runBodyRoute(
  route: RuntimeRouteRecord,

  input: RuntimeInputPlan,

  request: Request,

  params: Record<string, string>,

  query: unknown,

  invoke: RuntimeRouteInvoker,
): Response | Promise<Response> {
  const schema = input.body;

  if (!schema) {
    throw new Error("Missing body schema");
  }

  if (!isJsonContentType(request)) {
    return unsupportedMediaTypeResponse();
  }

  return request.json().then(
    (rawBody) => {
      const validation = schema["~standard"].validate(rawBody);

      if (isPromiseLike(validation)) {
        return Promise.resolve(validation).then((result) => {
          if (result.issues !== undefined) {
            return validationErrorResponse("body", result.issues);
          }

          return invoke(route, request, params, query, result.value);
        });
      }

      if (validation.issues !== undefined) {
        return validationErrorResponse("body", validation.issues);
      }

      return invoke(route, request, params, query, validation.value);
    },

    () => malformedJsonResponse(),
  );
}

function runQueryBodyRoute(
  route: RuntimeRouteRecord,

  input: RuntimeInputPlan,

  request: Request,

  params: Record<string, string>,

  invoke: RuntimeRouteInvoker,
): Response | Promise<Response> {
  let rawQuery: Record<string, string | string[]>;

  try {
    rawQuery = parseQueryFromUrl(request.url);
  } catch {
    return invalidQueryEncodingResponse();
  }

  const schema = input.query;

  if (!schema) {
    throw new Error("Missing query schema");
  }

  const validation = schema["~standard"].validate(rawQuery);

  if (isPromiseLike(validation)) {
    return Promise.resolve(validation).then((result) => {
      if (result.issues !== undefined) {
        return validationErrorResponse("query", result.issues);
      }

      return runBodyRoute(route, input, request, params, result.value, invoke);
    });
  }

  if (validation.issues !== undefined) {
    return validationErrorResponse("query", validation.issues);
  }

  return runBodyRoute(route, input, request, params, validation.value, invoke);
}

function invokeHandlerRoute(
  route: RuntimeRouteRecord,

  request: Request,

  params: Record<string, string>,

  query: unknown,

  body: unknown,
): Response | Promise<Response> {
  return invokeHandlerWithContext(
    route.handler,

    createRuntimeContext(request, params, query, body),
  );
}

function invokeResponseRoute(
  route: RuntimeRouteRecord,

  request: Request,

  params: Record<string, string>,

  query: unknown,

  body: unknown,
): Response | Promise<Response> {
  return invokeHandlerWithResponsePlan(
    route,

    createRuntimeContext(request, params, query, body),
  );
}

function invokeBeforeHandleRoute(
  route: RuntimeRouteRecord,

  request: Request,

  params: Record<string, string>,

  query: unknown,

  body: unknown,
): Response | Promise<Response> {
  const beforeHandle = route.beforeHandle;

  if (beforeHandle === undefined) {
    throw new Error("Missing Gelis beforeHandle hook");
  }

  const context = createRuntimeContext(request, params, query, body);

  const result = beforeHandle(context);

  if (isPromiseLike(result)) {
    return Promise.resolve(result).then((early) => {
      if (early !== undefined) {
        return normalizeResponse(early);
      }

      return invokeHandlerWithContext(route.handler, context);
    });
  }

  if (result !== undefined) {
    return normalizeResponse(result);
  }

  return invokeHandlerWithContext(route.handler, context);
}

function invokeBeforeHandleResponseRoute(
  route: RuntimeRouteRecord,

  request: Request,

  params: Record<string, string>,

  query: unknown,

  body: unknown,
): Response | Promise<Response> {
  const beforeHandle = route.beforeHandle;

  if (beforeHandle === undefined) {
    throw new Error("Missing Gelis beforeHandle hook");
  }

  const context = createRuntimeContext(request, params, query, body);

  const result = beforeHandle(context);

  if (isPromiseLike(result)) {
    return Promise.resolve(result).then((early) => {
      /*
       * beforeHandle is an infrastructure short
       * circuit and intentionally bypasses the
       * handler response plan.
       */
      if (early !== undefined) {
        return normalizeResponse(early);
      }

      return invokeHandlerWithResponsePlan(route, context);
    });
  }

  if (result !== undefined) {
    return normalizeResponse(result);
  }

  return invokeHandlerWithResponsePlan(route, context);
}

function invokeAfterHandleRoute(
  route: RuntimeRouteRecord,

  request: Request,

  params: Record<string, string>,

  query: unknown,

  body: unknown,
): Response | Promise<Response> {
  const context = createRuntimeContext(request, params, query, body);

  return invokeHandlerThenAfter(route, context);
}

function invokeAfterHandleResponseRoute(
  route: RuntimeRouteRecord,

  request: Request,

  params: Record<string, string>,

  query: unknown,

  body: unknown,
): Response | Promise<Response> {
  const context = createRuntimeContext(request, params, query, body);

  return invokeHandlerThenAfterResponsePlan(route, context);
}

function invokeBeforeAfterHandleRoute(
  route: RuntimeRouteRecord,

  request: Request,

  params: Record<string, string>,

  query: unknown,

  body: unknown,
): Response | Promise<Response> {
  const beforeHandle = route.beforeHandle;

  if (beforeHandle === undefined) {
    throw new Error("Missing Gelis beforeHandle hook");
  }

  const context = createRuntimeContext(request, params, query, body);

  const result = beforeHandle(context);

  if (isPromiseLike(result)) {
    return Promise.resolve(result).then((early) => {
      if (early !== undefined) {
        return normalizeResponse(early);
      }

      return invokeHandlerThenAfter(route, context);
    });
  }

  if (result !== undefined) {
    return normalizeResponse(result);
  }

  return invokeHandlerThenAfter(route, context);
}

function invokeBeforeAfterHandleResponseRoute(
  route: RuntimeRouteRecord,

  request: Request,

  params: Record<string, string>,

  query: unknown,

  body: unknown,
): Response | Promise<Response> {
  const beforeHandle = route.beforeHandle;

  if (beforeHandle === undefined) {
    throw new Error("Missing Gelis beforeHandle hook");
  }

  const context = createRuntimeContext(request, params, query, body);

  const result = beforeHandle(context);

  if (isPromiseLike(result)) {
    return Promise.resolve(result).then((early) => {
      if (early !== undefined) {
        return normalizeResponse(early);
      }

      return invokeHandlerThenAfterResponsePlan(route, context);
    });
  }

  if (result !== undefined) {
    return normalizeResponse(result);
  }

  return invokeHandlerThenAfterResponsePlan(route, context);
}

function invokeHandlerThenAfter(
  route: RuntimeRouteRecord,

  context: RuntimeRouteContext,
): Response | Promise<Response> {
  const result = route.handler(context);

  if (isPromiseLike(result)) {
    return Promise.resolve(result).then((resolved) =>
      invokeAfterHandleWithResult(route, context, resolved),
    );
  }

  return invokeAfterHandleWithResult(route, context, result);
}

function invokeAfterHandleWithResult(
  route: RuntimeRouteRecord,

  context: RuntimeRouteContext,

  result: unknown,
): Response | Promise<Response> {
  const afterHandle = route.afterHandle;

  if (afterHandle === undefined) {
    throw new Error("Missing Gelis afterHandle hook");
  }

  const after = afterHandle(context, result);

  if (isPromiseLike(after)) {
    return Promise.resolve(after).then(() => normalizeResponse(result));
  }

  return normalizeResponse(result);
}

function invokeHandlerThenAfterResponsePlan(
  route: RuntimeRouteRecord,

  context: RuntimeRouteContext,
): Response | Promise<Response> {
  const result = route.handler(context);

  if (isPromiseLike(result)) {
    return Promise.resolve(result).then((resolved) =>
      invokeAfterHandleWithResultResponsePlan(route, context, resolved),
    );
  }

  return invokeAfterHandleWithResultResponsePlan(route, context, result);
}

function invokeAfterHandleWithResultResponsePlan(
  route: RuntimeRouteRecord,

  context: RuntimeRouteContext,

  result: unknown,
): Response | Promise<Response> {
  const afterHandle = route.afterHandle;

  if (afterHandle === undefined) {
    throw new Error("Missing Gelis afterHandle hook");
  }

  /*
   * afterHandle observes the raw handler value,
   * before validation/transformation/serialization.
   */
  const after = afterHandle(context, result);

  const finalize = route.responsePlan!.finalize;

  if (isPromiseLike(after)) {
    return Promise.resolve(after).then(() => finalize(result));
  }

  return finalize(result);
}

function invokeHandlerWithContext(
  handler: RuntimeRouteHandler,

  context: RuntimeRouteContext,
): Response | Promise<Response> {
  const result = handler(context);

  if (isPromiseLike(result)) {
    return Promise.resolve(result).then(normalizeResponse);
  }

  return normalizeResponse(result);
}

function invokeHandlerWithResponsePlan(
  route: RuntimeRouteRecord,

  context: RuntimeRouteContext,
): Response | Promise<Response> {
  const result = route.handler(context);

  const finalize = route.responsePlan!.finalize;

  if (isPromiseLike(result)) {
    return Promise.resolve(result).then(finalize);
  }

  return finalize(result);
}

function createRuntimeContext(
  request: Request,

  params: Record<string, string>,

  query: unknown,

  body: unknown,
): RuntimeRouteContext {
  return {
    request,
    params,
    query,
    body,

    reply: runtimeReply,
  };
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return false;
  }

  return (
    typeof (
      value as {
        then?: unknown;
      }
    ).then === "function"
  );
}
