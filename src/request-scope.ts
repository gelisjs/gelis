import { RouteBuilder } from "./route-builder";

import { RUNTIME_ROUTE_REQUEST_SCOPE } from "./runtime/types";

import type {
  HttpMethod,
  InferImplicitResponses,
  ResponseContractMap,
  RouteContext,
  RouteHandlerContextFor,
  RouteHandlerResultFor,
  RouteLifecycleFor,
  RouteOptionsFor,
  RouteRef,
  RouteRequestContract,
  RouteRequestFor,
  RouteResponsesFor,
} from "./route";

import type { StandardSchemaV1 } from "./schema";

import type { InferPathParams, ValidRoutePath } from "./types/path";

import type {
  RuntimeRequestScopeAfterHandle,
  RuntimeRequestScopeBeforeHandle,
  RuntimeRequestScopeDerive,
  RuntimeRequestScopePlan,
  RuntimeRouteRecord,
  RuntimeRouteRegister,
} from "./runtime/types";

type LifecycleBefore<
  Path extends string,
  Query extends StandardSchemaV1 | undefined,
  Body extends StandardSchemaV1 | undefined,
  Responses extends ResponseContractMap | undefined,
  Result,
> = NonNullable<
  RouteLifecycleFor<Path, Query, Body, Responses, Result>["beforeHandle"]
>;

type LifecycleAfter<
  Path extends string,
  Query extends StandardSchemaV1 | undefined,
  Body extends StandardSchemaV1 | undefined,
  Responses extends ResponseContractMap | undefined,
  Result,
> = NonNullable<
  RouteLifecycleFor<Path, Query, Body, Responses, Result>["afterHandle"]
>;

export interface RequestScopeDeriveContext {
  readonly request: Request;

  readonly params: Record<string, string>;

  /*
   * Request-scope derivation is shared by every route
   * registered through one builder, so query/body cannot
   * have one route-specific schema type here.
   *
   * Runtime execution still receives validated values
   * before derivation on routes with input schemas.
   */
  readonly query: unknown;

  readonly body: unknown;
}

export type RequestScopeDerive<Scope extends object> = (
  context: RequestScopeDeriveContext,
) => Scope | PromiseLike<Scope>;

export type RequestScopeHandler<Path extends string, Scope, Result> = (
  context: RouteContext<Path>,

  scope: Scope,
) => Result;

export type RequestScopeLifecycleFor<
  Path extends string,
  Scope,
  Query extends StandardSchemaV1 | undefined = undefined,
  Body extends StandardSchemaV1 | undefined = undefined,
  Responses extends ResponseContractMap | undefined = undefined,
  Result = unknown,
> = {
  readonly beforeHandle?: (
    context: Parameters<
      LifecycleBefore<Path, Query, Body, Responses, Result>
    >[0],

    scope: Scope,
  ) => ReturnType<LifecycleBefore<Path, Query, Body, Responses, Result>>;

  readonly afterHandle?: (
    context: Parameters<
      LifecycleAfter<Path, Query, Body, Responses, Result>
    >[0],

    result: Parameters<LifecycleAfter<Path, Query, Body, Responses, Result>>[1],

    scope: Scope,
  ) => ReturnType<LifecycleAfter<Path, Query, Body, Responses, Result>>;
};

interface RequestScopeRouteMethod<
  Method extends HttpMethod,
  Scope extends object,
> {
  <const Path extends string, Result>(
    path: Path & ValidRoutePath<Path>,

    handler: RequestScopeHandler<Path, Scope, Result>,

    lifecycle?: RequestScopeLifecycleFor<
      Path,
      Scope,
      undefined,
      undefined,
      undefined,
      Result
    >,
  ): RouteRef<
    Method,
    Path,
    RouteRequestContract<InferPathParams<Path>>,
    InferImplicitResponses<Result>
  >;

  <
    const Path extends string,
    const Query extends StandardSchemaV1 | undefined = undefined,
    const Body extends StandardSchemaV1 | undefined = undefined,
    Result = unknown,
  >(
    path: Path & ValidRoutePath<Path>,

    options: RouteOptionsFor<Query, Body, undefined>,

    handler: (
      context: RouteHandlerContextFor<
        Path,
        RouteOptionsFor<Query, Body, undefined>
      >,

      scope: Scope,
    ) => Result,

    lifecycle?: RequestScopeLifecycleFor<
      Path,
      Scope,
      Query,
      Body,
      undefined,
      Result
    >,
  ): RouteRef<
    Method,
    Path,
    RouteRequestFor<Path, RouteOptionsFor<Query, Body, undefined>>,
    RouteResponsesFor<RouteOptionsFor<Query, Body, undefined>, Result>
  >;

  <
    const Path extends string,
    const Responses extends ResponseContractMap,
    const Query extends StandardSchemaV1 | undefined = undefined,
    const Body extends StandardSchemaV1 | undefined = undefined,
  >(
    path: Path & ValidRoutePath<Path>,

    options: RouteOptionsFor<Query, Body, Responses> & {
      readonly responses: Responses;
    },

    handler: (
      context: RouteHandlerContextFor<
        Path,
        RouteOptionsFor<Query, Body, Responses>
      >,

      scope: Scope,
    ) => RouteHandlerResultFor<Responses>,

    lifecycle?: RequestScopeLifecycleFor<
      Path,
      Scope,
      Query,
      Body,
      Responses,
      RouteHandlerResultFor<Responses>
    >,
  ): RouteRef<
    Method,
    Path,
    RouteRequestFor<Path, RouteOptionsFor<Query, Body, Responses>>,
    RouteResponsesFor<
      RouteOptionsFor<Query, Body, Responses>,
      RouteHandlerResultFor<Responses>
    >
  >;
}

interface RequestScopeGenericRouteMethod<Scope extends object> {
  <const Method extends HttpMethod, const Path extends string, Result>(
    method: Method,

    path: Path & ValidRoutePath<Path>,

    handler: RequestScopeHandler<Path, Scope, Result>,

    lifecycle?: RequestScopeLifecycleFor<
      Path,
      Scope,
      undefined,
      undefined,
      undefined,
      Result
    >,
  ): RouteRef<
    Method,
    Path,
    RouteRequestContract<InferPathParams<Path>>,
    InferImplicitResponses<Result>
  >;

  <
    const Method extends HttpMethod,
    const Path extends string,
    const Query extends StandardSchemaV1 | undefined = undefined,
    const Body extends StandardSchemaV1 | undefined = undefined,
    Result = unknown,
  >(
    method: Method,

    path: Path & ValidRoutePath<Path>,

    options: RouteOptionsFor<Query, Body, undefined>,

    handler: (
      context: RouteHandlerContextFor<
        Path,
        RouteOptionsFor<Query, Body, undefined>
      >,

      scope: Scope,
    ) => Result,

    lifecycle?: RequestScopeLifecycleFor<
      Path,
      Scope,
      Query,
      Body,
      undefined,
      Result
    >,
  ): RouteRef<
    Method,
    Path,
    RouteRequestFor<Path, RouteOptionsFor<Query, Body, undefined>>,
    RouteResponsesFor<RouteOptionsFor<Query, Body, undefined>, Result>
  >;

  <
    const Method extends HttpMethod,
    const Path extends string,
    const Responses extends ResponseContractMap,
    const Query extends StandardSchemaV1 | undefined = undefined,
    const Body extends StandardSchemaV1 | undefined = undefined,
  >(
    method: Method,

    path: Path & ValidRoutePath<Path>,

    options: RouteOptionsFor<Query, Body, Responses> & {
      readonly responses: Responses;
    },

    handler: (
      context: RouteHandlerContextFor<
        Path,
        RouteOptionsFor<Query, Body, Responses>
      >,

      scope: Scope,
    ) => RouteHandlerResultFor<Responses>,

    lifecycle?: RequestScopeLifecycleFor<
      Path,
      Scope,
      Query,
      Body,
      Responses,
      RouteHandlerResultFor<Responses>
    >,
  ): RouteRef<
    Method,
    Path,
    RouteRequestFor<Path, RouteOptionsFor<Query, Body, Responses>>,
    RouteResponsesFor<
      RouteOptionsFor<Query, Body, Responses>,
      RouteHandlerResultFor<Responses>
    >
  >;
}

export interface RequestScopeBuilder<Scope extends object> {
  readonly get: RequestScopeRouteMethod<"GET", Scope>;

  readonly post: RequestScopeRouteMethod<"POST", Scope>;

  readonly put: RequestScopeRouteMethod<"PUT", Scope>;

  readonly patch: RequestScopeRouteMethod<"PATCH", Scope>;

  readonly delete: RequestScopeRouteMethod<"DELETE", Scope>;

  readonly options: RequestScopeRouteMethod<"OPTIONS", Scope>;

  readonly head: RequestScopeRouteMethod<"HEAD", Scope>;

  readonly route: RequestScopeGenericRouteMethod<Scope>;
}

/**
 * Creates a route builder bound to one request-scope derivation.
 *
 * RouteBuilder remains the single source of truth for route
 * options, input plans, response plans, lifecycle flags,
 * metadata, and RouteRef construction.
 *
 * This adapter only marks the compiled runtime record as
 * request-scoped and keeps local scoped lifecycle callbacks
 * in the request-scope execution plan.
 *
 * The public name and surface remain experimental until
 * the P8-A composition API freeze.
 */
export function createRequestScopeBuilder<const Scope extends object>(
  derive: RequestScopeDerive<Scope>,

  register: RuntimeRouteRegister,
): RequestScopeBuilder<Scope> {
  const builder = new RouteBuilder(
    "",

    (route) => {
      register(bindRequestScopeRoute(route, derive));
    },
  );

  return builder as unknown as RequestScopeBuilder<Scope>;
}

function bindRequestScopeRoute<Scope extends object>(
  route: RuntimeRouteRecord,

  derive: RequestScopeDerive<Scope>,
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
     * requestScope. These fields remain available for
     * application-global lifecycle compilation so global
     * hooks never invoke scoped callbacks without the
     * derived scope argument.
     */
    beforeHandle: undefined,

    afterHandle: undefined,

    requestScope,
  };
}
