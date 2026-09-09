import { createApplicationScopeBuilder } from "./application-scope";

import type { ApplicationScopeBuilder } from "./application-scope";

import { createRequestScopeBuilder } from "./request-scope";

import type { RequestScopeBuilder, RequestScopeDerive } from "./request-scope";

import { installPlugin } from "./plugin";

import type { Plugin, PluginCompositionDeclaration } from "./plugin";

import { mountModuleRuntimeRoutes } from "./module";

import {
  closeApplication,
  enqueueApplicationStartup,
  GELIS_APPLICATION_REQUEST_GATE_CHANGED,
  isApplicationRequestBlocked,
  readyApplication,
} from "./startup";

import type { ApplicationStartupTask } from "./startup";

import { pathnameFromUrl } from "./runtime/url";

import { ALL_ROUTE_METHOD } from "./http-method";

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

import { activateAllFallback } from "./runtime/router-all";

import {
  createAutomaticOptionsResponse,
  createMethodNotAllowedResponse,
} from "./runtime/http-method-semantics";

import {
  normalizeResponse,
  runtimeReply,
  suppressHeadResponse,
} from "./runtime/response";

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
  parseQueryFromUrl,
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
  RUNTIME_ROUTE_MODULE_REQUEST_SCOPE,
  RUNTIME_ROUTE_PLAIN,
  RUNTIME_ROUTE_REQUEST_SCOPE,
  RUNTIME_ROUTE_RESPONSE,
} from "./runtime/types";

import type { ModuleRef, ModuleRoutes } from "./module";

import type { GlobalAfterHandle, GlobalBeforeHandle } from "./route";

import type { RuntimeInputPlan } from "./runtime/input";

import type {
  RuntimeAfterHandle,
  RuntimeBeforeHandle,
  RuntimeRequestScopeHandler,
  RuntimeRouteContext,
  RuntimeRouteHandler,
  RuntimeRouteRecord,
  RuntimeScopedModuleRequestScopeHandler,
  RuntimeScopedModuleRequestScopePlan,
  RuntimeStaticModuleRequestScopeHandler,
  RuntimeStaticModuleRequestScopePlan,
} from "./runtime/types";

type RuntimeRouteInvoker = (
  route: RuntimeRouteRecord,

  request: Request,

  params: Record<string, string>,

  query: unknown,

  body: unknown,
) => Response | Promise<Response>;

const activeHeadDispatches = new WeakMap<Request, Gelis>();

function dispatchHeadRequest(
  application: Gelis,
  request: Request,
): Response | Promise<Response> | undefined {
  const activeApplication = activeHeadDispatches.get(request);

  /*
   * Recursive dispatch for the same application
   * must continue into normal routing so HEAD can
   * resolve exact HEAD / ALL / implicit GET.
   */
  if (activeApplication === application) {
    return undefined;
  }

  activeHeadDispatches.set(request, application);

  try {
    const result = Gelis.prototype.fetch.call(application, request);

    if (isPromiseLike(result)) {
      return Promise.resolve(result).then(suppressHeadResponse);
    }

    return suppressHeadResponse(result);
  } finally {
    if (activeApplication === undefined) {
      activeHeadDispatches.delete(request);
    } else {
      activeHeadDispatches.set(request, activeApplication);
    }
  }
}

function resolveMethodMiss(
  router: GelisInternalRouter,
  method: string,
  pathname: string,
): RuntimeRouteMatch | Response {
  if (method === "HEAD") {
    const getMatch = router.match("GET", pathname);

    if (getMatch !== undefined) {
      return getMatch;
    }
  }

  const matchingMethods = router.matchingMethods(pathname);

  if (method === "OPTIONS") {
    const automaticOptions = createAutomaticOptionsResponse(matchingMethods);

    if (automaticOptions !== undefined) {
      return automaticOptions;
    }
  }

  const methodNotAllowed = createMethodNotAllowedResponse(matchingMethods);

  if (methodNotAllowed !== undefined) {
    return methodNotAllowed;
  }

  return new Response("Not Found", {
    status: 404,
  });
}

const unavailableApplicationFetch: RuntimeFetch = (request) =>
  request.method === "HEAD"
    ? new Response(
        null,

        {
          status: 503,
        },
      )
    : new Response(
        "Service Unavailable",

        {
          status: 503,
        },
      );

export interface GelisInternalRouter {
  register(route: RuntimeRouteRecord): void;

  /*
   * Normal Router supports transactional composition.
   *
   * Specialized collection routers may omit this
   * operation and use the compatibility fallback.
   */
  registerBatchAtomic?(routes: readonly RuntimeRouteRecord[]): void;

  match(
    method: string,

    pathname: string,
  ): RuntimeRouteMatch | undefined;

  matchingMethods(pathname: string): string[];
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

  routeIdentityKeys: Set<string> | undefined;

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
  enqueueStartup(task: ApplicationStartupTask): void;

  installRouter(router: GelisInternalRouter): void;

  installPrebuiltRuntime(
    router: GelisInternalRouter,

    routes: RuntimeRouteRecord[],
  ): void;
}

export class Gelis extends RouteBuilder<""> {
  readonly #state: AppRuntimeState;

  #recompileApplicationFetch(): void {
    const state = this.#state;

    const startupBlocked = isApplicationRequestBlocked(this);

    const hasApplicationLifecycle =
      (state.onRequestHooks !== undefined &&
        state.onRequestHooks.length !== 0) ||
      (state.onErrorHooks !== undefined && state.onErrorHooks.length !== 0);

    /*
     * Restore the prototype hot path whenever neither startup gating
     * nor application-level request/error lifecycle needs a wrapper.
     *
     * This means a startup-enabled application also returns to the
     * normal direct fetch path after successful ready() when possible.
     */
    if (!startupBlocked && !hasApplicationLifecycle) {
      if (Object.prototype.hasOwnProperty.call(this, "fetch")) {
        delete (this as unknown as { fetch?: RuntimeFetch }).fetch;
      }

      return;
    }

    let routedFetch = state.routedFetch;

    /*
     * Capture the original routed fetch exactly once, before any
     * application-level specialization exists.
     */
    if (routedFetch === undefined) {
      routedFetch = this.fetch.bind(this);

      state.routedFetch = routedFetch;
    }

    const compiledFetch = startupBlocked
      ? unavailableApplicationFetch
      : compileApplicationFetch(
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

  #commitPluginComposition(composition: PluginCompositionDeclaration): void {
    const state = this.#state;

    validatePluginCompositionRoutes(state, composition.routes);

    for (const route of composition.routes) {
      registerAppRuntimeRoute(state, route);
    }

    const onRequestHooks = composition.onRequestHooks;

    if (onRequestHooks.length !== 0) {
      const hooks = state.onRequestHooks;

      if (hooks === undefined) {
        state.onRequestHooks = [...onRequestHooks];
      } else {
        hooks.push(...onRequestHooks);
      }
    }

    const onErrorHooks = composition.onErrorHooks;

    if (onErrorHooks.length !== 0) {
      const hooks = state.onErrorHooks;

      if (hooks === undefined) {
        state.onErrorHooks = [...onErrorHooks];
      } else {
        hooks.push(...onErrorHooks);
      }
    }

    if (onRequestHooks.length !== 0 || onErrorHooks.length !== 0) {
      this.#recompileApplicationFetch();
    }

    const beforeHandleHooks = composition.beforeHandleHooks;

    const afterHandleHooks = composition.afterHandleHooks;

    if (beforeHandleHooks.length !== 0 || afterHandleHooks.length !== 0) {
      ensureLocalLifecycleSidecar(state);

      for (const hook of beforeHandleHooks) {
        state.globalBeforeHooks.push(hook as RuntimeBeforeHandle);
      }

      for (const hook of afterHandleHooks) {
        state.globalAfterHooks.push(hook as RuntimeAfterHandle);
      }

      recompileAppLifecycle(state);
    }
  }

  constructor() {
    const router = new Router();

    const state: AppRuntimeState = {
      router,

      routes: [],

      routeIdentityKeys: undefined,

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

  use(plugin: Plugin): this {
    installPlugin(
      this,
      plugin,

      (composition) => {
        this.#commitPluginComposition(composition);
      },
    );

    return this;
  }

  ready(): Promise<void> {
    return readyApplication(this);
  }

  close(): Promise<void> {
    return closeApplication(this);
  }

  [GELIS_APPLICATION_REQUEST_GATE_CHANGED](): void {
    this.#recompileApplicationFetch();
  }

  scope<const Scope extends object>(
    scope: Scope,
  ): ApplicationScopeBuilder<Scope> {
    const state = this.#state;

    return createApplicationScopeBuilder(
      scope,

      (route) => {
        registerAppRuntimeRoute(state, route);
      },
    );
  }

  requestScope<const Scope extends object>(
    derive: RequestScopeDerive<Scope>,
  ): RequestScopeBuilder<Scope> {
    const state = this.#state;

    return createRequestScopeBuilder(
      derive,

      (route) => {
        registerAppRuntimeRoute(state, route);
      },
    );
  }

  [GELIS_INTERNAL_RUNTIME](): GelisInternalRuntimeControl {
    const state = this.#state;

    const application = this;

    return {
      enqueueStartup(task: ApplicationStartupTask): void {
        enqueueApplicationStartup(application, task);
      },

      installRouter(router: GelisInternalRouter): void {
        state.router = router;
      },

      installPrebuiltRuntime(
        router: GelisInternalRouter,

        routes: RuntimeRouteRecord[],
      ): void {
        if (state.routes.length !== 0) {
          throw new Error(
            "Cannot install Gelis prebuilt runtime after route registration",
          );
        }

        if (
          state.localBeforeHooks !== undefined ||
          state.localAfterHooks !== undefined ||
          state.globalBeforeHooks.length !== 0 ||
          state.globalAfterHooks.length !== 0
        ) {
          throw new Error(
            "Cannot install Gelis plain prebuilt runtime after lifecycle registration",
          );
        }

        state.router = router;

        state.routes = routes;

        state.routeIdentityKeys = undefined;
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
    mountModuleRuntimeRoutes(
      this,

      module,

      (routes) => {
        commitModuleRuntimeRoutesAtomic(this.#state, routes);
      },
    );
  }

  fetch(request: Request): Response | Promise<Response> {
    const method = request.method;

    if (method === "HEAD") {
      const headResult = dispatchHeadRequest(this, request);

      if (headResult !== undefined) {
        return headResult;
      }
    }

    const pathname = pathnameFromUrl(request.url);

    let matched = this.#state.router.match(method, pathname);

    if (matched === undefined) {
      const fallback = resolveMethodMiss(this.#state.router, method, pathname);

      if (fallback instanceof Response) {
        return fallback;
      }

      matched = fallback;
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

      default: {
        /*
         * Module request scope gets a dedicated compiled execution path.
         *
         * Ordinary app.requestScope() keeps its existing runtime path
         * completely unchanged.
         */
        if (route.flags === RUNTIME_ROUTE_MODULE_REQUEST_SCOPE) {
          return invokePlainModuleRequestScopeRoute(route, request, params);
        }

        /*
         * Fully local module request-scope lifecycle.
         *
         * No application-global lifecycle is present when both ordinary
         * route lifecycle fields remain undefined, so this path stays
         * linear just like the existing request-scope specialization.
         */
        if (
          route.flags ===
            (RUNTIME_ROUTE_MODULE_REQUEST_SCOPE |
              RUNTIME_ROUTE_BEFORE_HANDLE |
              RUNTIME_ROUTE_AFTER_HANDLE) &&
          route.beforeHandle === undefined &&
          route.afterHandle === undefined
        ) {
          return invokeLocalModuleRequestScopeBeforeAfterRoute(
            route,
            request,
            params,
          );
        }

        if ((route.flags & RUNTIME_ROUTE_MODULE_REQUEST_SCOPE) !== 0) {
          if ((route.flags & RUNTIME_ROUTE_INPUT) !== 0) {
            return runInputPlan(
              route,
              request,
              params,

              invokeModuleRequestScopeValidatedRoute,
            );
          }

          return invokeModuleRequestScopeValidatedRoute(
            route,
            request,
            params,
            undefined,
            undefined,
          );
        }

        /*
         * Request-scoped route without input, lifecycle,
         * or response contract.
         *
         * Keep this execution shape close to the ordinary
         * plain-route fast path. The scope is derived once
         * and passed directly as the handler's second
         * argument.
         */
        if (route.flags === RUNTIME_ROUTE_REQUEST_SCOPE) {
          return invokePlainRequestScopeRoute(route, request, params);
        }

        /*
         * Request scope with local beforeHandle + afterHandle,
         * but without application-global lifecycle.
         *
         * Global lifecycle compilation stores its effective
         * hooks on route.beforeHandle / route.afterHandle, so
         * both fields being undefined proves this route can use
         * the fully local specialized executor.
         */
        if (
          route.flags ===
            (RUNTIME_ROUTE_REQUEST_SCOPE |
              RUNTIME_ROUTE_BEFORE_HANDLE |
              RUNTIME_ROUTE_AFTER_HANDLE) &&
          route.beforeHandle === undefined &&
          route.afterHandle === undefined
        ) {
          return invokeLocalRequestScopeBeforeAfterRoute(
            route,
            request,
            params,
          );
        }

        if ((route.flags & RUNTIME_ROUTE_REQUEST_SCOPE) !== 0) {
          /*
           * Input validation remains owned by the canonical
           * Gelis input pipeline.
           *
           * Request-scope derivation therefore receives
           * validated/transformed query and body values.
           */
          if ((route.flags & RUNTIME_ROUTE_INPUT) !== 0) {
            return runInputPlan(
              route,
              request,
              params,

              invokeRequestScopeValidatedRoute,
            );
          }

          return invokeRequestScopeValidatedRoute(
            route,
            request,
            params,
            undefined,
            undefined,
          );
        }

        throw new Error("Invalid Gelis runtime route flags");
      }
    }
  }
}

function commitModuleRuntimeRoutesAtomic(
  state: AppRuntimeState,

  routes: readonly RuntimeRouteRecord[],
): void {
  if (routes.length === 0) {
    return;
  }

  const registerBatchAtomic = state.router.registerBatchAtomic;

  /*
   * The normal Router owns the optimized atomic
   * composition path.
   *
   * Collection/specialized internal routers keep
   * compatibility with the existing prevalidation
   * path. This path is not the production request
   * router fast path.
   */
  if (registerBatchAtomic === undefined) {
    validatePluginCompositionRoutes(state, routes);

    for (const route of routes) {
      registerAppRuntimeRoute(state, route);
    }

    return;
  }

  const localBeforeHooks = state.localBeforeHooks;

  const localAfterHooks = state.localAfterHooks;

  /*
   * No application-global lifecycle exists.
   *
   * RouteBuilder already compiled every route-local
   * execution plan, so the router batch can be
   * committed directly.
   */
  if (localBeforeHooks === undefined || localAfterHooks === undefined) {
    registerBatchAtomic.call(state.router, routes);

    activateAllFallbackForRoutes(state, routes);

    const routeIdentityKeys = state.routeIdentityKeys;

    if (routeIdentityKeys !== undefined) {
      for (const route of routes) {
        routeIdentityKeys.add(runtimeRouteIdentityKey(route));
      }
    }

    state.routes.push(...routes);

    return;
  }

  /*
   * Global lifecycle is already active.
   *
   * Prepare the effective route objects first, but
   * do not mutate application bookkeeping until the
   * router transaction succeeds.
   */
  const pendingBeforeHooks = new Array<RuntimeBeforeHandle | undefined>(
    routes.length,
  );

  const pendingAfterHooks = new Array<RuntimeAfterHandle | undefined>(
    routes.length,
  );

  for (let index = 0; index < routes.length; index++) {
    const route = routes[index]!;

    const localBeforeHandle = route.beforeHandle;

    const localAfterHandle = route.afterHandle;

    pendingBeforeHooks[index] = localBeforeHandle;

    pendingAfterHooks[index] = localAfterHandle;

    applyLifecyclePlan(state, route, localBeforeHandle, localAfterHandle);
  }

  registerBatchAtomic.call(state.router, routes);

  activateAllFallbackForRoutes(state, routes);

  const routeIdentityKeys = state.routeIdentityKeys;

  if (routeIdentityKeys !== undefined) {
    for (const route of routes) {
      routeIdentityKeys.add(runtimeRouteIdentityKey(route));
    }
  }

  localBeforeHooks.push(...pendingBeforeHooks);

  localAfterHooks.push(...pendingAfterHooks);

  state.routes.push(...routes);
}

function activateAllFallbackForRoutes(
  state: AppRuntimeState,

  routes: readonly RuntimeRouteRecord[],
): void {
  const router = state.router;

  if (!(router instanceof Router)) {
    return;
  }

  for (let index = 0; index < routes.length; index++) {
    if (routes[index]?.method === ALL_ROUTE_METHOD) {
      activateAllFallback(router);

      return;
    }
  }
}

function validatePluginCompositionRoutes(
  state: AppRuntimeState,

  routes: readonly RuntimeRouteRecord[],
): void {
  if (routes.length === 0) {
    return;
  }

  const installed = ensureRouteIdentityKeys(state);

  const pending = new Set<string>();

  for (const route of routes) {
    const key = runtimeRouteIdentityKey(route);

    if (installed.has(key) || pending.has(key)) {
      throw new Error(`Duplicate route: ${route.method} ${route.path}`);
    }

    pending.add(key);
  }
}

function ensureRouteIdentityKeys(state: AppRuntimeState): Set<string> {
  const existing = state.routeIdentityKeys;

  if (existing !== undefined) {
    return existing;
  }

  const created = new Set<string>();

  for (const route of state.routes) {
    created.add(runtimeRouteIdentityKey(route));
  }

  state.routeIdentityKeys = created;

  return created;
}

function runtimeRouteIdentityKey(route: RuntimeRouteRecord): string {
  return `${route.method}\u0000` + runtimeRouteShape(route.path);
}

function runtimeRouteShape(path: string): string {
  if (!path.includes(":")) {
    return path;
  }

  const segments = path.split("/");

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];

    if (segment !== undefined && segment.startsWith(":")) {
      segments[index] = ":";
    }
  }

  return segments.join("/");
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

  if (route.method === ALL_ROUTE_METHOD && state.router instanceof Router) {
    activateAllFallback(state.router);
  }

  const routeIdentityKeys = state.routeIdentityKeys;

  if (routeIdentityKeys !== undefined) {
    routeIdentityKeys.add(runtimeRouteIdentityKey(route));
  }

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

  const requestScope = route.requestScope;

  if (requestScope !== undefined) {
    flags |= RUNTIME_ROUTE_REQUEST_SCOPE;

    if (requestScope.beforeHandle !== undefined) {
      flags |= RUNTIME_ROUTE_BEFORE_HANDLE;
    }

    if (requestScope.afterHandle !== undefined) {
      flags |= RUNTIME_ROUTE_AFTER_HANDLE;
    }
  }

  const moduleRequestScope = route.moduleRequestScope;

  if (moduleRequestScope !== undefined) {
    flags |= RUNTIME_ROUTE_MODULE_REQUEST_SCOPE;

    if (
      moduleRequestScope.moduleBeforeHandle !== undefined ||
      moduleRequestScope.beforeHandle !== undefined
    ) {
      flags |= RUNTIME_ROUTE_BEFORE_HANDLE;
    }

    if (
      moduleRequestScope.moduleAfterHandle !== undefined ||
      moduleRequestScope.afterHandle !== undefined
    ) {
      flags |= RUNTIME_ROUTE_AFTER_HANDLE;
    }
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

function invokePlainModuleRequestScopeRoute(
  route: RuntimeRouteRecord,

  request: Request,

  params: Record<string, string>,
): Response | Promise<Response> {
  const plan = route.moduleRequestScope;

  if (plan === undefined) {
    throw new Error("Missing Gelis module request scope plan");
  }

  const context: RuntimeRouteContext = {
    request,
    params,

    query: undefined,

    body: undefined,

    reply: runtimeReply,
  };

  if (plan.kind === "static") {
    const requestScope = plan.derive(context);

    const handler =
      route.handler as unknown as RuntimeStaticModuleRequestScopeHandler;

    if (isPromiseLike(requestScope)) {
      return Promise.resolve(requestScope).then((resolvedRequestScope) => {
        const result = handler(context, resolvedRequestScope);

        if (isPromiseLike(result)) {
          return Promise.resolve(result).then(normalizeResponse);
        }

        return normalizeResponse(result);
      });
    }

    const result = handler(context, requestScope);

    if (isPromiseLike(result)) {
      return Promise.resolve(result).then(normalizeResponse);
    }

    return normalizeResponse(result);
  }

  const moduleScope = route.moduleScope;

  if (moduleScope === undefined) {
    throw new Error("Missing Gelis module scope binding");
  }

  const requestScope = plan.derive(context, moduleScope);

  const handler =
    route.handler as unknown as RuntimeScopedModuleRequestScopeHandler;

  if (isPromiseLike(requestScope)) {
    return Promise.resolve(requestScope).then((resolvedRequestScope) => {
      const result = handler(context, moduleScope, resolvedRequestScope);

      if (isPromiseLike(result)) {
        return Promise.resolve(result).then(normalizeResponse);
      }

      return normalizeResponse(result);
    });
  }

  const result = handler(context, moduleScope, requestScope);

  if (isPromiseLike(result)) {
    return Promise.resolve(result).then(normalizeResponse);
  }

  return normalizeResponse(result);
}

function invokeLocalModuleRequestScopeBeforeAfterRoute(
  route: RuntimeRouteRecord,

  request: Request,

  params: Record<string, string>,
): Response | Promise<Response> {
  const plan = route.moduleRequestScope;

  if (plan === undefined) {
    throw new Error("Missing Gelis module request scope plan");
  }

  const context: RuntimeRouteContext = {
    request,
    params,

    query: undefined,

    body: undefined,

    reply: runtimeReply,
  };

  if (plan.kind === "static") {
    const requestScope = plan.derive(context);

    if (isPromiseLike(requestScope)) {
      return Promise.resolve(requestScope).then((resolvedRequestScope) =>
        invokeResolvedStaticModuleRequestScope(
          route,
          plan,
          context,
          resolvedRequestScope,
        ),
      );
    }

    const moduleBeforeHandle = plan.moduleBeforeHandle;

    if (moduleBeforeHandle !== undefined) {
      const early = moduleBeforeHandle(context);

      if (isPromiseLike(early)) {
        return Promise.resolve(early).then((resolvedEarly) => {
          if (resolvedEarly !== undefined) {
            return normalizeResponse(resolvedEarly);
          }

          return invokeStaticModuleRequestScopeAfterModuleBefore(
            route,
            plan,
            context,
            requestScope,
          );
        });
      }

      if (early !== undefined) {
        return normalizeResponse(early);
      }
    }

    const beforeHandle = plan.beforeHandle;

    if (beforeHandle !== undefined) {
      const early = beforeHandle(context, requestScope);

      if (isPromiseLike(early)) {
        return Promise.resolve(early).then((resolvedEarly) => {
          if (resolvedEarly !== undefined) {
            return normalizeResponse(resolvedEarly);
          }

          return invokeStaticModuleRequestScopeHandler(
            route,
            plan,
            context,
            requestScope,
          );
        });
      }

      if (early !== undefined) {
        return normalizeResponse(early);
      }
    }

    const handler =
      route.handler as unknown as RuntimeStaticModuleRequestScopeHandler;

    const result = handler(context, requestScope);

    if (isPromiseLike(result)) {
      return Promise.resolve(result).then((resolvedResult) =>
        invokeStaticModuleRequestScopeAfter(
          route,
          plan,
          context,
          resolvedResult,
          requestScope,
        ),
      );
    }

    const afterHandle = plan.afterHandle;

    if (afterHandle !== undefined) {
      const after = afterHandle(context, result, requestScope);

      if (isPromiseLike(after)) {
        return Promise.resolve(after).then(() =>
          invokeStaticModuleAfterAndGlobal(route, plan, context, result),
        );
      }
    }

    const moduleAfterHandle = plan.moduleAfterHandle;

    if (moduleAfterHandle !== undefined) {
      const after = moduleAfterHandle(context, result);

      if (isPromiseLike(after)) {
        return Promise.resolve(after).then(() => normalizeResponse(result));
      }
    }

    return normalizeResponse(result);
  }

  const moduleScope = route.moduleScope;

  if (moduleScope === undefined) {
    throw new Error("Missing Gelis module scope binding");
  }

  const requestScope = plan.derive(context, moduleScope);

  if (isPromiseLike(requestScope)) {
    return Promise.resolve(requestScope).then((resolvedRequestScope) =>
      invokeResolvedScopedModuleRequestScope(
        route,
        plan,
        context,
        moduleScope,
        resolvedRequestScope,
      ),
    );
  }

  const moduleBeforeHandle = plan.moduleBeforeHandle;

  if (moduleBeforeHandle !== undefined) {
    const early = moduleBeforeHandle(context, moduleScope);

    if (isPromiseLike(early)) {
      return Promise.resolve(early).then((resolvedEarly) => {
        if (resolvedEarly !== undefined) {
          return normalizeResponse(resolvedEarly);
        }

        return invokeScopedModuleRequestScopeAfterModuleBefore(
          route,
          plan,
          context,
          moduleScope,
          requestScope,
        );
      });
    }

    if (early !== undefined) {
      return normalizeResponse(early);
    }
  }

  const beforeHandle = plan.beforeHandle;

  if (beforeHandle !== undefined) {
    const early = beforeHandle(context, moduleScope, requestScope);

    if (isPromiseLike(early)) {
      return Promise.resolve(early).then((resolvedEarly) => {
        if (resolvedEarly !== undefined) {
          return normalizeResponse(resolvedEarly);
        }

        return invokeScopedModuleRequestScopeHandler(
          route,
          plan,
          context,
          moduleScope,
          requestScope,
        );
      });
    }

    if (early !== undefined) {
      return normalizeResponse(early);
    }
  }

  const handler =
    route.handler as unknown as RuntimeScopedModuleRequestScopeHandler;

  const result = handler(context, moduleScope, requestScope);

  if (isPromiseLike(result)) {
    return Promise.resolve(result).then((resolvedResult) =>
      invokeScopedModuleRequestScopeAfter(
        route,
        plan,
        context,
        moduleScope,
        resolvedResult,
        requestScope,
      ),
    );
  }

  const afterHandle = plan.afterHandle;

  if (afterHandle !== undefined) {
    const after = afterHandle(context, result, moduleScope, requestScope);

    if (isPromiseLike(after)) {
      return Promise.resolve(after).then(() =>
        invokeScopedModuleAfterAndGlobal(
          route,
          plan,
          context,
          moduleScope,
          result,
        ),
      );
    }
  }

  const moduleAfterHandle = plan.moduleAfterHandle;

  if (moduleAfterHandle !== undefined) {
    const after = moduleAfterHandle(context, result, moduleScope);

    if (isPromiseLike(after)) {
      return Promise.resolve(after).then(() => normalizeResponse(result));
    }
  }

  return normalizeResponse(result);
}

function invokeModuleRequestScopeValidatedRoute(
  route: RuntimeRouteRecord,

  request: Request,

  params: Record<string, string>,

  query: unknown,

  body: unknown,
): Response | Promise<Response> {
  const context = createRuntimeContext(request, params, query, body);

  const globalBeforeHandle = route.beforeHandle;

  if (globalBeforeHandle === undefined) {
    return deriveModuleRequestScopeAfterGlobalBefore(route, context);
  }

  const early = globalBeforeHandle(context);

  if (isPromiseLike(early)) {
    return Promise.resolve(early).then((resolvedEarly) => {
      if (resolvedEarly !== undefined) {
        return normalizeResponse(resolvedEarly);
      }

      return deriveModuleRequestScopeAfterGlobalBefore(route, context);
    });
  }

  if (early !== undefined) {
    return normalizeResponse(early);
  }

  return deriveModuleRequestScopeAfterGlobalBefore(route, context);
}

function deriveModuleRequestScopeAfterGlobalBefore(
  route: RuntimeRouteRecord,

  context: RuntimeRouteContext,
): Response | Promise<Response> {
  const plan = route.moduleRequestScope;

  if (plan === undefined) {
    throw new Error("Missing Gelis module request scope plan");
  }

  if (plan.kind === "static") {
    const requestScope = plan.derive(context);

    if (isPromiseLike(requestScope)) {
      return Promise.resolve(requestScope).then((resolvedRequestScope) =>
        invokeResolvedStaticModuleRequestScope(
          route,
          plan,
          context,
          resolvedRequestScope,
        ),
      );
    }

    return invokeResolvedStaticModuleRequestScope(
      route,
      plan,
      context,
      requestScope,
    );
  }

  const moduleScope = route.moduleScope;

  if (moduleScope === undefined) {
    throw new Error("Missing Gelis module scope binding");
  }

  const requestScope = plan.derive(context, moduleScope);

  if (isPromiseLike(requestScope)) {
    return Promise.resolve(requestScope).then((resolvedRequestScope) =>
      invokeResolvedScopedModuleRequestScope(
        route,
        plan,
        context,
        moduleScope,
        resolvedRequestScope,
      ),
    );
  }

  return invokeResolvedScopedModuleRequestScope(
    route,
    plan,
    context,
    moduleScope,
    requestScope,
  );
}

function invokeResolvedStaticModuleRequestScope(
  route: RuntimeRouteRecord,

  plan: RuntimeStaticModuleRequestScopePlan,

  context: RuntimeRouteContext,

  requestScope: unknown,
): Response | Promise<Response> {
  const moduleBeforeHandle = plan.moduleBeforeHandle;

  if (moduleBeforeHandle !== undefined) {
    const early = moduleBeforeHandle(context);

    if (isPromiseLike(early)) {
      return Promise.resolve(early).then((resolvedEarly) => {
        if (resolvedEarly !== undefined) {
          return normalizeResponse(resolvedEarly);
        }

        return invokeStaticModuleRequestScopeAfterModuleBefore(
          route,
          plan,
          context,
          requestScope,
        );
      });
    }

    if (early !== undefined) {
      return normalizeResponse(early);
    }
  }

  return invokeStaticModuleRequestScopeAfterModuleBefore(
    route,
    plan,
    context,
    requestScope,
  );
}

function invokeStaticModuleRequestScopeAfterModuleBefore(
  route: RuntimeRouteRecord,

  plan: RuntimeStaticModuleRequestScopePlan,

  context: RuntimeRouteContext,

  requestScope: unknown,
): Response | Promise<Response> {
  const beforeHandle = plan.beforeHandle;

  if (beforeHandle !== undefined) {
    const early = beforeHandle(context, requestScope);

    if (isPromiseLike(early)) {
      return Promise.resolve(early).then((resolvedEarly) => {
        if (resolvedEarly !== undefined) {
          return normalizeResponse(resolvedEarly);
        }

        return invokeStaticModuleRequestScopeHandler(
          route,
          plan,
          context,
          requestScope,
        );
      });
    }

    if (early !== undefined) {
      return normalizeResponse(early);
    }
  }

  return invokeStaticModuleRequestScopeHandler(
    route,
    plan,
    context,
    requestScope,
  );
}

function invokeStaticModuleRequestScopeHandler(
  route: RuntimeRouteRecord,

  plan: RuntimeStaticModuleRequestScopePlan,

  context: RuntimeRouteContext,

  requestScope: unknown,
): Response | Promise<Response> {
  const handler =
    route.handler as unknown as RuntimeStaticModuleRequestScopeHandler;

  const result = handler(context, requestScope);

  if (isPromiseLike(result)) {
    return Promise.resolve(result).then((resolvedResult) =>
      invokeStaticModuleRequestScopeAfter(
        route,
        plan,
        context,
        resolvedResult,
        requestScope,
      ),
    );
  }

  return invokeStaticModuleRequestScopeAfter(
    route,
    plan,
    context,
    result,
    requestScope,
  );
}

function invokeStaticModuleRequestScopeAfter(
  route: RuntimeRouteRecord,

  plan: RuntimeStaticModuleRequestScopePlan,

  context: RuntimeRouteContext,

  result: unknown,

  requestScope: unknown,
): Response | Promise<Response> {
  const afterHandle = plan.afterHandle;

  if (afterHandle !== undefined) {
    const after = afterHandle(context, result, requestScope);

    if (isPromiseLike(after)) {
      return Promise.resolve(after).then(() =>
        invokeStaticModuleAfterAndGlobal(route, plan, context, result),
      );
    }
  }

  return invokeStaticModuleAfterAndGlobal(route, plan, context, result);
}

function invokeStaticModuleAfterAndGlobal(
  route: RuntimeRouteRecord,

  plan: RuntimeStaticModuleRequestScopePlan,

  context: RuntimeRouteContext,

  result: unknown,
): Response | Promise<Response> {
  const moduleAfterHandle = plan.moduleAfterHandle;

  if (moduleAfterHandle !== undefined) {
    const after = moduleAfterHandle(context, result);

    if (isPromiseLike(after)) {
      return Promise.resolve(after).then(() =>
        invokeGlobalRequestScopeAfter(route, context, result),
      );
    }
  }

  return invokeGlobalRequestScopeAfter(route, context, result);
}

function invokeResolvedScopedModuleRequestScope(
  route: RuntimeRouteRecord,

  plan: RuntimeScopedModuleRequestScopePlan,

  context: RuntimeRouteContext,

  moduleScope: object,

  requestScope: unknown,
): Response | Promise<Response> {
  const moduleBeforeHandle = plan.moduleBeforeHandle;

  if (moduleBeforeHandle !== undefined) {
    const early = moduleBeforeHandle(context, moduleScope);

    if (isPromiseLike(early)) {
      return Promise.resolve(early).then((resolvedEarly) => {
        if (resolvedEarly !== undefined) {
          return normalizeResponse(resolvedEarly);
        }

        return invokeScopedModuleRequestScopeAfterModuleBefore(
          route,
          plan,
          context,
          moduleScope,
          requestScope,
        );
      });
    }

    if (early !== undefined) {
      return normalizeResponse(early);
    }
  }

  return invokeScopedModuleRequestScopeAfterModuleBefore(
    route,
    plan,
    context,
    moduleScope,
    requestScope,
  );
}

function invokeScopedModuleRequestScopeAfterModuleBefore(
  route: RuntimeRouteRecord,

  plan: RuntimeScopedModuleRequestScopePlan,

  context: RuntimeRouteContext,

  moduleScope: object,

  requestScope: unknown,
): Response | Promise<Response> {
  const beforeHandle = plan.beforeHandle;

  if (beforeHandle !== undefined) {
    const early = beforeHandle(context, moduleScope, requestScope);

    if (isPromiseLike(early)) {
      return Promise.resolve(early).then((resolvedEarly) => {
        if (resolvedEarly !== undefined) {
          return normalizeResponse(resolvedEarly);
        }

        return invokeScopedModuleRequestScopeHandler(
          route,
          plan,
          context,
          moduleScope,
          requestScope,
        );
      });
    }

    if (early !== undefined) {
      return normalizeResponse(early);
    }
  }

  return invokeScopedModuleRequestScopeHandler(
    route,
    plan,
    context,
    moduleScope,
    requestScope,
  );
}

function invokeScopedModuleRequestScopeHandler(
  route: RuntimeRouteRecord,

  plan: RuntimeScopedModuleRequestScopePlan,

  context: RuntimeRouteContext,

  moduleScope: object,

  requestScope: unknown,
): Response | Promise<Response> {
  const handler =
    route.handler as unknown as RuntimeScopedModuleRequestScopeHandler;

  const result = handler(context, moduleScope, requestScope);

  if (isPromiseLike(result)) {
    return Promise.resolve(result).then((resolvedResult) =>
      invokeScopedModuleRequestScopeAfter(
        route,
        plan,
        context,
        moduleScope,
        resolvedResult,
        requestScope,
      ),
    );
  }

  return invokeScopedModuleRequestScopeAfter(
    route,
    plan,
    context,
    moduleScope,
    result,
    requestScope,
  );
}

function invokeScopedModuleRequestScopeAfter(
  route: RuntimeRouteRecord,

  plan: RuntimeScopedModuleRequestScopePlan,

  context: RuntimeRouteContext,

  moduleScope: object,

  result: unknown,

  requestScope: unknown,
): Response | Promise<Response> {
  const afterHandle = plan.afterHandle;

  if (afterHandle !== undefined) {
    const after = afterHandle(context, result, moduleScope, requestScope);

    if (isPromiseLike(after)) {
      return Promise.resolve(after).then(() =>
        invokeScopedModuleAfterAndGlobal(
          route,
          plan,
          context,
          moduleScope,
          result,
        ),
      );
    }
  }

  return invokeScopedModuleAfterAndGlobal(
    route,
    plan,
    context,
    moduleScope,
    result,
  );
}

function invokeScopedModuleAfterAndGlobal(
  route: RuntimeRouteRecord,

  plan: RuntimeScopedModuleRequestScopePlan,

  context: RuntimeRouteContext,

  moduleScope: object,

  result: unknown,
): Response | Promise<Response> {
  const moduleAfterHandle = plan.moduleAfterHandle;

  if (moduleAfterHandle !== undefined) {
    const after = moduleAfterHandle(context, result, moduleScope);

    if (isPromiseLike(after)) {
      return Promise.resolve(after).then(() =>
        invokeGlobalRequestScopeAfter(route, context, result),
      );
    }
  }

  return invokeGlobalRequestScopeAfter(route, context, result);
}

function invokePlainRequestScopeRoute(
  route: RuntimeRouteRecord,

  request: Request,

  params: Record<string, string>,
): Response | Promise<Response> {
  const requestScope = route.requestScope;

  if (requestScope === undefined) {
    throw new Error("Missing Gelis request scope plan");
  }

  const context: RuntimeRouteContext = {
    request,
    params,

    query: undefined,

    body: undefined,

    reply: runtimeReply,
  };

  const scope = requestScope.derive(context);

  const handler = route.handler as unknown as RuntimeRequestScopeHandler;

  if (isPromiseLike(scope)) {
    return Promise.resolve(scope).then((resolvedScope) => {
      const result = handler(context, resolvedScope);

      if (isPromiseLike(result)) {
        return Promise.resolve(result).then(normalizeResponse);
      }

      return normalizeResponse(result);
    });
  }

  const result = handler(context, scope);

  if (isPromiseLike(result)) {
    return Promise.resolve(result).then(normalizeResponse);
  }

  return normalizeResponse(result);
}

function invokeLocalRequestScopeBeforeAfterRoute(
  route: RuntimeRouteRecord,

  request: Request,

  params: Record<string, string>,
): Response | Promise<Response> {
  const requestScope = route.requestScope;

  if (requestScope === undefined) {
    throw new Error("Missing Gelis request scope plan");
  }

  const beforeHandle = requestScope.beforeHandle;

  const afterHandle = requestScope.afterHandle;

  if (beforeHandle === undefined || afterHandle === undefined) {
    throw new Error("Missing Gelis request scope lifecycle");
  }

  const context: RuntimeRouteContext = {
    request,
    params,

    query: undefined,

    body: undefined,

    reply: runtimeReply,
  };

  const handler = route.handler as unknown as RuntimeRequestScopeHandler;

  const scope = requestScope.derive(context);

  /*
   * Async derivation is not the synchronous hot path,
   * so it can enter the generic resolved helper.
   */
  if (isPromiseLike(scope)) {
    return Promise.resolve(scope).then((resolvedScope) =>
      invokeResolvedLocalRequestScopeBeforeAfter(
        context,
        resolvedScope,
        handler,
        beforeHandle,
        afterHandle,
      ),
    );
  }

  /*
   * Keep the synchronous path completely linear.
   */
  const early = beforeHandle(context, scope);

  if (isPromiseLike(early)) {
    return Promise.resolve(early).then((resolvedEarly) => {
      if (resolvedEarly !== undefined) {
        return normalizeResponse(resolvedEarly);
      }

      return invokeResolvedRequestScopeHandlerAfter(
        context,
        scope,
        handler,
        afterHandle,
      );
    });
  }

  if (early !== undefined) {
    return normalizeResponse(early);
  }

  const result = handler(context, scope);

  if (isPromiseLike(result)) {
    return Promise.resolve(result).then((resolvedResult) => {
      const after = afterHandle(context, resolvedResult, scope);

      if (isPromiseLike(after)) {
        return Promise.resolve(after).then(() =>
          normalizeResponse(resolvedResult),
        );
      }

      return normalizeResponse(resolvedResult);
    });
  }

  const after = afterHandle(context, result, scope);

  if (isPromiseLike(after)) {
    return Promise.resolve(after).then(() => normalizeResponse(result));
  }

  return normalizeResponse(result);
}

function invokeResolvedLocalRequestScopeBeforeAfter(
  context: RuntimeRouteContext,

  scope: unknown,

  handler: RuntimeRequestScopeHandler,

  beforeHandle: NonNullable<
    NonNullable<RuntimeRouteRecord["requestScope"]>["beforeHandle"]
  >,

  afterHandle: NonNullable<
    NonNullable<RuntimeRouteRecord["requestScope"]>["afterHandle"]
  >,
): Response | Promise<Response> {
  const early = beforeHandle(context, scope);

  if (isPromiseLike(early)) {
    return Promise.resolve(early).then((resolvedEarly) => {
      if (resolvedEarly !== undefined) {
        return normalizeResponse(resolvedEarly);
      }

      return invokeResolvedRequestScopeHandlerAfter(
        context,
        scope,
        handler,
        afterHandle,
      );
    });
  }

  if (early !== undefined) {
    return normalizeResponse(early);
  }

  return invokeResolvedRequestScopeHandlerAfter(
    context,
    scope,
    handler,
    afterHandle,
  );
}

function invokeResolvedRequestScopeHandlerAfter(
  context: RuntimeRouteContext,

  scope: unknown,

  handler: RuntimeRequestScopeHandler,

  afterHandle: NonNullable<
    NonNullable<RuntimeRouteRecord["requestScope"]>["afterHandle"]
  >,
): Response | Promise<Response> {
  const result = handler(context, scope);

  if (isPromiseLike(result)) {
    return Promise.resolve(result).then((resolvedResult) => {
      const after = afterHandle(context, resolvedResult, scope);

      if (isPromiseLike(after)) {
        return Promise.resolve(after).then(() =>
          normalizeResponse(resolvedResult),
        );
      }

      return normalizeResponse(resolvedResult);
    });
  }

  const after = afterHandle(context, result, scope);

  if (isPromiseLike(after)) {
    return Promise.resolve(after).then(() => normalizeResponse(result));
  }

  return normalizeResponse(result);
}

function invokeRequestScopeValidatedRoute(
  route: RuntimeRouteRecord,

  request: Request,

  params: Record<string, string>,

  query: unknown,

  body: unknown,
): Response | Promise<Response> {
  /*
   * Input validation has already completed before
   * this executor is entered.
   *
   * Application-global policy runs before any
   * route-local request-scope derivation. A global
   * short circuit therefore avoids unnecessary
   * per-request capability work.
   */
  const context = createRuntimeContext(request, params, query, body);

  const globalBeforeHandle = route.beforeHandle;

  if (globalBeforeHandle === undefined) {
    return deriveRequestScopeAfterGlobalBefore(route, context);
  }

  const early = globalBeforeHandle(context);

  if (isPromiseLike(early)) {
    return Promise.resolve(early).then((resolvedEarly) => {
      if (resolvedEarly !== undefined) {
        return normalizeResponse(resolvedEarly);
      }

      return deriveRequestScopeAfterGlobalBefore(route, context);
    });
  }

  if (early !== undefined) {
    return normalizeResponse(early);
  }

  return deriveRequestScopeAfterGlobalBefore(route, context);
}

function deriveRequestScopeAfterGlobalBefore(
  route: RuntimeRouteRecord,

  context: RuntimeRouteContext,
): Response | Promise<Response> {
  const requestScope = route.requestScope;

  if (requestScope === undefined) {
    throw new Error("Missing Gelis request scope plan");
  }

  const scope = requestScope.derive(context);

  if (isPromiseLike(scope)) {
    return Promise.resolve(scope).then((resolvedScope) =>
      invokeLocalRequestScopeBefore(route, context, resolvedScope),
    );
  }

  return invokeLocalRequestScopeBefore(route, context, scope);
}

function invokeLocalRequestScopeBefore(
  route: RuntimeRouteRecord,

  context: RuntimeRouteContext,

  scope: unknown,
): Response | Promise<Response> {
  const requestScope = route.requestScope;

  if (requestScope === undefined) {
    throw new Error("Missing Gelis request scope plan");
  }

  const localBeforeHandle = requestScope.beforeHandle;

  if (localBeforeHandle === undefined) {
    return invokeRequestScopeHandler(route, context, scope);
  }

  const early = localBeforeHandle(context, scope);

  if (isPromiseLike(early)) {
    return Promise.resolve(early).then((resolvedEarly) => {
      if (resolvedEarly !== undefined) {
        return normalizeResponse(resolvedEarly);
      }

      return invokeRequestScopeHandler(route, context, scope);
    });
  }

  if (early !== undefined) {
    return normalizeResponse(early);
  }

  return invokeRequestScopeHandler(route, context, scope);
}

function invokeRequestScopeHandler(
  route: RuntimeRouteRecord,

  context: RuntimeRouteContext,

  scope: unknown,
): Response | Promise<Response> {
  const handler = route.handler as unknown as RuntimeRequestScopeHandler;

  const result = handler(context, scope);

  if (isPromiseLike(result)) {
    return Promise.resolve(result).then((resolved) =>
      invokeRequestScopeAfter(route, context, resolved, scope),
    );
  }

  return invokeRequestScopeAfter(route, context, result, scope);
}

function invokeRequestScopeAfter(
  route: RuntimeRouteRecord,

  context: RuntimeRouteContext,

  result: unknown,

  scope: unknown,
): Response | Promise<Response> {
  const requestScope = route.requestScope;

  if (requestScope === undefined) {
    throw new Error("Missing Gelis request scope plan");
  }

  const localAfterHandle = requestScope.afterHandle;

  if (localAfterHandle === undefined) {
    return invokeGlobalRequestScopeAfter(route, context, result);
  }

  const after = localAfterHandle(context, result, scope);

  if (isPromiseLike(after)) {
    return Promise.resolve(after).then(() =>
      invokeGlobalRequestScopeAfter(route, context, result),
    );
  }

  return invokeGlobalRequestScopeAfter(route, context, result);
}

function invokeGlobalRequestScopeAfter(
  route: RuntimeRouteRecord,

  context: RuntimeRouteContext,

  result: unknown,
): Response | Promise<Response> {
  const globalAfterHandle = route.afterHandle;

  if (globalAfterHandle === undefined) {
    return finalizeRequestScopeResult(route, result);
  }

  const after = globalAfterHandle(context, result);

  if (isPromiseLike(after)) {
    return Promise.resolve(after).then(() =>
      finalizeRequestScopeResult(route, result),
    );
  }

  return finalizeRequestScopeResult(route, result);
}

function finalizeRequestScopeResult(
  route: RuntimeRouteRecord,

  result: unknown,
): Response | Promise<Response> {
  const responsePlan = route.responsePlan;

  if (responsePlan !== undefined) {
    return responsePlan.finalize(result);
  }

  return normalizeResponse(result);
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

  const readBody = input.readBody;

  if (readBody === undefined) {
    throw new Error("Missing Gelis runtime body reader");
  }

  const readBodyError = input.readBodyError;

  if (readBodyError === undefined) {
    throw new Error("Missing Gelis runtime body read error handler");
  }

  const rawBody = readBody(request);

  if (rawBody instanceof Response) {
    return rawBody;
  }

  return rawBody.then(
    (resolvedBody) => {
      const validation = schema["~standard"].validate(resolvedBody);

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

    readBodyError,
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
