import { RouteBuilder } from "./route-builder";

import type { JoinRoutePath } from "./route-builder";

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
  RuntimeRouteContext,
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

export type ApplicationScopeHandler<Path extends string, Scope, Result> = (
  context: RouteContext<Path>,

  scope: Scope,
) => Result;

export type ApplicationScopeLifecycleFor<
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

interface ApplicationScopeRouteMethod<
  Method extends HttpMethod,
  Scope extends object,
  Prefix extends string,
> {
  <const Path extends string, Result>(
    path: Path & ValidRoutePath<Path>,

    handler: ApplicationScopeHandler<
      JoinRoutePath<Prefix, Path>,
      Scope,
      Result
    >,

    lifecycle?: ApplicationScopeLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      Scope,
      undefined,
      undefined,
      undefined,
      Result
    >,
  ): RouteRef<
    Method,
    JoinRoutePath<Prefix, Path>,
    RouteRequestContract<InferPathParams<JoinRoutePath<Prefix, Path>>>,
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
        JoinRoutePath<Prefix, Path>,
        RouteOptionsFor<Query, Body, undefined>
      >,

      scope: Scope,
    ) => Result,

    lifecycle?: ApplicationScopeLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      Scope,
      Query,
      Body,
      undefined,
      Result
    >,
  ): RouteRef<
    Method,
    JoinRoutePath<Prefix, Path>,
    RouteRequestFor<
      JoinRoutePath<Prefix, Path>,
      RouteOptionsFor<Query, Body, undefined>
    >,
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
        JoinRoutePath<Prefix, Path>,
        RouteOptionsFor<Query, Body, Responses>
      >,

      scope: Scope,
    ) => RouteHandlerResultFor<Responses>,

    lifecycle?: ApplicationScopeLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      Scope,
      Query,
      Body,
      Responses,
      RouteHandlerResultFor<Responses>
    >,
  ): RouteRef<
    Method,
    JoinRoutePath<Prefix, Path>,
    RouteRequestFor<
      JoinRoutePath<Prefix, Path>,
      RouteOptionsFor<Query, Body, Responses>
    >,
    RouteResponsesFor<
      RouteOptionsFor<Query, Body, Responses>,
      RouteHandlerResultFor<Responses>
    >
  >;
}

interface ApplicationScopeGenericRouteMethod<
  Scope extends object,
  Prefix extends string,
> {
  <const Method extends HttpMethod, const Path extends string, Result>(
    method: Method,

    path: Path & ValidRoutePath<Path>,

    handler: ApplicationScopeHandler<
      JoinRoutePath<Prefix, Path>,
      Scope,
      Result
    >,

    lifecycle?: ApplicationScopeLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      Scope,
      undefined,
      undefined,
      undefined,
      Result
    >,
  ): RouteRef<
    Method,
    JoinRoutePath<Prefix, Path>,
    RouteRequestContract<InferPathParams<JoinRoutePath<Prefix, Path>>>,
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
        JoinRoutePath<Prefix, Path>,
        RouteOptionsFor<Query, Body, undefined>
      >,

      scope: Scope,
    ) => Result,

    lifecycle?: ApplicationScopeLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      Scope,
      Query,
      Body,
      undefined,
      Result
    >,
  ): RouteRef<
    Method,
    JoinRoutePath<Prefix, Path>,
    RouteRequestFor<
      JoinRoutePath<Prefix, Path>,
      RouteOptionsFor<Query, Body, undefined>
    >,
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
        JoinRoutePath<Prefix, Path>,
        RouteOptionsFor<Query, Body, Responses>
      >,

      scope: Scope,
    ) => RouteHandlerResultFor<Responses>,

    lifecycle?: ApplicationScopeLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      Scope,
      Query,
      Body,
      Responses,
      RouteHandlerResultFor<Responses>
    >,
  ): RouteRef<
    Method,
    JoinRoutePath<Prefix, Path>,
    RouteRequestFor<
      JoinRoutePath<Prefix, Path>,
      RouteOptionsFor<Query, Body, Responses>
    >,
    RouteResponsesFor<
      RouteOptionsFor<Query, Body, Responses>,
      RouteHandlerResultFor<Responses>
    >
  >;
}

export interface ApplicationScopeBuilder<
  Scope extends object,
  Prefix extends string = "",
> {
  readonly get: ApplicationScopeRouteMethod<"GET", Scope, Prefix>;

  readonly post: ApplicationScopeRouteMethod<"POST", Scope, Prefix>;

  readonly put: ApplicationScopeRouteMethod<"PUT", Scope, Prefix>;

  readonly patch: ApplicationScopeRouteMethod<"PATCH", Scope, Prefix>;

  readonly delete: ApplicationScopeRouteMethod<"DELETE", Scope, Prefix>;

  readonly options: ApplicationScopeRouteMethod<"OPTIONS", Scope, Prefix>;

  readonly head: ApplicationScopeRouteMethod<"HEAD", Scope, Prefix>;

  readonly query: ApplicationScopeRouteMethod<"QUERY", Scope, Prefix>;

  readonly route: ApplicationScopeGenericRouteMethod<Scope, Prefix>;
}

type ScopedRuntimeHandler<Scope> = (
  context: RuntimeRouteContext,

  scope: Scope,
) => unknown;

type ScopedRuntimeBeforeHandle<Scope> = (
  context: RuntimeRouteContext,

  scope: Scope,
) => unknown | PromiseLike<unknown>;

type ScopedRuntimeAfterHandle<Scope> = (
  context: RuntimeRouteContext,

  result: unknown,

  scope: Scope,
) => void | PromiseLike<void>;

/**
 * Creates a route builder bound to one application-level scope.
 *
 * The ordinary RouteBuilder remains the single source of truth for route
 * options, input plans, response plans, lifecycle flags, metadata, and route
 * references. Application context only adapts scoped callbacks once during
 * registration before the runtime route enters the application.
 */
export function createApplicationScopeBuilder<
  const Scope extends object,
  const Prefix extends string = "",
>(
  scope: Scope,

  register: RuntimeRouteRegister,

  prefix: Prefix = "" as Prefix,
): ApplicationScopeBuilder<Scope, Prefix> {
  const builder = new RouteBuilder(
    prefix,

    (route) => {
      register(bindApplicationScopeRoute(route, scope));
    },
  );

  return builder as unknown as ApplicationScopeBuilder<Scope, Prefix>;
}

export function bindApplicationScopeRoute<Scope extends object>(
  route: RuntimeRouteRecord,

  scope: Scope,
): RuntimeRouteRecord {
  const scopedHandler = route.handler as unknown as ScopedRuntimeHandler<Scope>;

  const scopedBeforeHandle = route.beforeHandle as unknown as
    | ScopedRuntimeBeforeHandle<Scope>
    | undefined;

  const scopedAfterHandle = route.afterHandle as unknown as
    | ScopedRuntimeAfterHandle<Scope>
    | undefined;

  return {
    ...route,

    handler: (context) => scopedHandler(context, scope),

    beforeHandle:
      scopedBeforeHandle === undefined
        ? undefined
        : (context) => scopedBeforeHandle(context, scope),

    afterHandle:
      scopedAfterHandle === undefined
        ? undefined
        : (context, result) => scopedAfterHandle(context, result, scope),
  };
}
