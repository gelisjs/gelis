import { RouteBuilder } from "./route-builder";

import { RUNTIME_ROUTE_REQUEST_SCOPE } from "./runtime/types";

import type {
  InferImplicitResponses,
  RouteContext,
  RouteRef,
  RouteRequestContract,
} from "./route";

import type { InferPathParams, ValidRoutePath } from "./types/path";

import type {
  RuntimeRequestScopeAfterHandle,
  RuntimeRequestScopeBeforeHandle,
  RuntimeRequestScopeDerive,
  RuntimeRequestScopePlan,
  RuntimeRouteRecord,
  RuntimeRouteRegister,
} from "./runtime/types";

export interface RequestContextDeriveContext {
  readonly request: Request;

  readonly params: Record<string, string>;

  readonly query: unknown;

  readonly body: unknown;
}

export type RequestContextDerive<Scope extends object> = (
  context: RequestContextDeriveContext,
) => Scope | PromiseLike<Scope>;

export type RequestContextHandler<Path extends string, Scope, Result> = (
  context: RouteContext<Path>,
  scope: Scope,
) => Result;

export type RequestContextLifecycleFor<Path extends string, Scope, Result> = {
  readonly beforeHandle?: (
    context: RouteContext<Path>,
    scope: Scope,
  ) => unknown | PromiseLike<unknown>;

  readonly afterHandle?: (
    context: RouteContext<Path>,
    result: Awaited<Result>,
    scope: Scope,
  ) => void | PromiseLike<void>;
};

export interface RequestContextBuilder<Scope extends object> {
  get<const Path extends string, Result>(
    path: Path & ValidRoutePath<Path>,

    handler: RequestContextHandler<Path, Scope, Result>,

    lifecycle?: RequestContextLifecycleFor<Path, Scope, Result>,
  ): RouteRef<
    "GET",
    Path,
    RouteRequestContract<InferPathParams<Path>>,
    InferImplicitResponses<Result>
  >;
}

/**
 * Creates a minimal request-scoped route builder.
 *
 * P8-A6.1 deliberately supports only plain GET routes
 * plus local lifecycle. The public name and surface are
 * still experimental.
 *
 * The derive function is stored on the route at
 * registration time. Runtime execution derives exactly
 * one request scope and passes the same reference through
 * beforeHandle, handler, and afterHandle without placing
 * the scope on RouteContext.
 */
export function createRequestContextBuilder<const Scope extends object>(
  derive: RequestContextDerive<Scope>,

  register: RuntimeRouteRegister,
): RequestContextBuilder<Scope> {
  const builder = new RouteBuilder(
    "",

    (route) => {
      register(bindRequestContextRoute(route, derive));
    },
  );

  return builder as unknown as RequestContextBuilder<Scope>;
}

function bindRequestContextRoute<Scope extends object>(
  route: RuntimeRouteRecord,

  derive: RequestContextDerive<Scope>,
): RuntimeRouteRecord {
  const requestScope: RuntimeRequestScopePlan = {
    derive: derive as RuntimeRequestScopeDerive,

    beforeHandle: route.beforeHandle as unknown as
      | RuntimeRequestScopeBeforeHandle
      | undefined,

    afterHandle: route.afterHandle as unknown as
      | RuntimeRequestScopeAfterHandle
      | undefined,
  };

  return {
    ...route,

    flags: route.flags | RUNTIME_ROUTE_REQUEST_SCOPE,

    /*
     * Local request-scoped lifecycle is kept in
     * requestScope. These fields are reserved for
     * ordinary/global lifecycle compilation so global
     * hooks never invoke scoped callbacks without the
     * derived scope argument.
     */
    beforeHandle: undefined,

    afterHandle: undefined,

    requestScope,
  };
}
