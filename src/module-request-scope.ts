import { bindApplicationScopeRoute } from "./application-scope";

import type { ValidHttpMethodLiteral } from "./http-method";

import { RouteBuilder } from "./route-builder";

import type { JoinRoutePath } from "./route-builder";

import {
  RUNTIME_ROUTE_AFTER_HANDLE,
  RUNTIME_ROUTE_BEFORE_HANDLE,
  RUNTIME_ROUTE_MODULE_REQUEST_SCOPE,
} from "./runtime/types";

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
  RuntimeAfterHandle,
  RuntimeBeforeHandle,
  RuntimeModuleRequestScopePlan,
  RuntimeRouteRecord,
  RuntimeRouteRegister,
  RuntimeScopedModuleAfterHandle,
  RuntimeScopedModuleBeforeHandle,
  RuntimeScopedModuleRequestScopeAfterHandle,
  RuntimeScopedModuleRequestScopeBeforeHandle,
  RuntimeScopedModuleRequestScopeDerive,
  RuntimeStaticModuleRequestScopeAfterHandle,
  RuntimeStaticModuleRequestScopeBeforeHandle,
  RuntimeStaticModuleRequestScopeDerive,
} from "./runtime/types";

import type { RequestScopeDeriveContext } from "./request-scope";

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

export type ModuleRequestScopeDerive<
  ModuleScope extends object,
  RequestScope extends object,
> = [ModuleScope] extends [never]
  ? (
      context: RequestScopeDeriveContext,
    ) => RequestScope | PromiseLike<RequestScope>
  : (
      context: RequestScopeDeriveContext,

      moduleScope: ModuleScope,
    ) => RequestScope | PromiseLike<RequestScope>;

export type ModuleRequestScopeHandler<
  Path extends string,
  ModuleScope extends object,
  RequestScope extends object,
  Result,
> = [ModuleScope] extends [never]
  ? (
      context: RouteContext<Path>,

      requestScope: RequestScope,
    ) => Result
  : (
      context: RouteContext<Path>,

      moduleScope: ModuleScope,

      requestScope: RequestScope,
    ) => Result;

type ModuleRequestScopeBeforeHandle<
  Path extends string,
  ModuleScope extends object,
  RequestScope extends object,
  Query extends StandardSchemaV1 | undefined,
  Body extends StandardSchemaV1 | undefined,
  Responses extends ResponseContractMap | undefined,
  Result,
> = [ModuleScope] extends [never]
  ? (
      context: Parameters<
        LifecycleBefore<Path, Query, Body, Responses, Result>
      >[0],

      requestScope: RequestScope,
    ) => ReturnType<LifecycleBefore<Path, Query, Body, Responses, Result>>
  : (
      context: Parameters<
        LifecycleBefore<Path, Query, Body, Responses, Result>
      >[0],

      moduleScope: ModuleScope,

      requestScope: RequestScope,
    ) => ReturnType<LifecycleBefore<Path, Query, Body, Responses, Result>>;

type ModuleRequestScopeAfterHandle<
  Path extends string,
  ModuleScope extends object,
  RequestScope extends object,
  Query extends StandardSchemaV1 | undefined,
  Body extends StandardSchemaV1 | undefined,
  Responses extends ResponseContractMap | undefined,
  Result,
> = [ModuleScope] extends [never]
  ? (
      context: Parameters<
        LifecycleAfter<Path, Query, Body, Responses, Result>
      >[0],

      result: Parameters<
        LifecycleAfter<Path, Query, Body, Responses, Result>
      >[1],

      requestScope: RequestScope,
    ) => ReturnType<LifecycleAfter<Path, Query, Body, Responses, Result>>
  : (
      context: Parameters<
        LifecycleAfter<Path, Query, Body, Responses, Result>
      >[0],

      result: Parameters<
        LifecycleAfter<Path, Query, Body, Responses, Result>
      >[1],

      moduleScope: ModuleScope,

      requestScope: RequestScope,
    ) => ReturnType<LifecycleAfter<Path, Query, Body, Responses, Result>>;

export type ModuleRequestScopeLifecycleFor<
  Path extends string,
  ModuleScope extends object,
  RequestScope extends object,
  Query extends StandardSchemaV1 | undefined = undefined,
  Body extends StandardSchemaV1 | undefined = undefined,
  Responses extends ResponseContractMap | undefined = undefined,
  Result = unknown,
> = {
  readonly beforeHandle?: ModuleRequestScopeBeforeHandle<
    Path,
    ModuleScope,
    RequestScope,
    Query,
    Body,
    Responses,
    Result
  >;

  readonly afterHandle?: ModuleRequestScopeAfterHandle<
    Path,
    ModuleScope,
    RequestScope,
    Query,
    Body,
    Responses,
    Result
  >;
};

declare const moduleRequestScopeBuilderStateBrand: unique symbol;

interface ModuleRequestScopeBuilderState<
  ModuleScope extends object,
  RequestScope extends object,
  Prefix extends string,
> {
  readonly [moduleRequestScopeBuilderStateBrand]: {
    readonly moduleScope: ModuleScope;

    readonly requestScope: RequestScope;

    readonly prefix: Prefix;
  };
}

interface SharedModuleRequestScopeRouteMethod<Method extends HttpMethod | "*"> {
  <
    const ModuleScope extends object,
    const RequestScope extends object,
    const Prefix extends string,
    const Path extends string,
    Result,
  >(
    this: ModuleRequestScopeBuilderState<ModuleScope, RequestScope, Prefix>,

    path: Path & ValidRoutePath<Path>,

    handler: ModuleRequestScopeHandler<
      JoinRoutePath<Prefix, Path>,
      ModuleScope,
      RequestScope,
      Result
    >,

    lifecycle?: ModuleRequestScopeLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      ModuleScope,
      RequestScope,
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
    const ModuleScope extends object,
    const RequestScope extends object,
    const Prefix extends string,
    const Path extends string,
    const Query extends StandardSchemaV1 | undefined = undefined,
    const Body extends StandardSchemaV1 | undefined = undefined,
    Result = unknown,
  >(
    this: ModuleRequestScopeBuilderState<ModuleScope, RequestScope, Prefix>,

    path: Path & ValidRoutePath<Path>,

    options: RouteOptionsFor<Query, Body, undefined>,

    handler: [ModuleScope] extends [never]
      ? (
          context: RouteHandlerContextFor<
            JoinRoutePath<Prefix, Path>,
            RouteOptionsFor<Query, Body, undefined>
          >,

          requestScope: RequestScope,
        ) => Result
      : (
          context: RouteHandlerContextFor<
            JoinRoutePath<Prefix, Path>,
            RouteOptionsFor<Query, Body, undefined>
          >,

          moduleScope: ModuleScope,

          requestScope: RequestScope,
        ) => Result,

    lifecycle?: ModuleRequestScopeLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      ModuleScope,
      RequestScope,
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
    const ModuleScope extends object,
    const RequestScope extends object,
    const Prefix extends string,
    const Path extends string,
    const Responses extends ResponseContractMap,
    const Query extends StandardSchemaV1 | undefined = undefined,
    const Body extends StandardSchemaV1 | undefined = undefined,
  >(
    this: ModuleRequestScopeBuilderState<ModuleScope, RequestScope, Prefix>,

    path: Path & ValidRoutePath<Path>,

    options: RouteOptionsFor<Query, Body, Responses> & {
      readonly responses: Responses;
    },

    handler: [ModuleScope] extends [never]
      ? (
          context: RouteHandlerContextFor<
            JoinRoutePath<Prefix, Path>,
            RouteOptionsFor<Query, Body, Responses>
          >,

          requestScope: RequestScope,
        ) => RouteHandlerResultFor<Responses>
      : (
          context: RouteHandlerContextFor<
            JoinRoutePath<Prefix, Path>,
            RouteOptionsFor<Query, Body, Responses>
          >,

          moduleScope: ModuleScope,

          requestScope: RequestScope,
        ) => RouteHandlerResultFor<Responses>,

    lifecycle?: ModuleRequestScopeLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      ModuleScope,
      RequestScope,
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

interface SharedModuleRequestScopeGenericRouteMethod {
  <
    const ModuleScope extends object,
    const RequestScope extends object,
    const Prefix extends string,
    const Method extends string,
    const Path extends string,
    Result,
  >(
    this: ModuleRequestScopeBuilderState<ModuleScope, RequestScope, Prefix>,

    method: Method & ValidHttpMethodLiteral<Method>,

    path: Path & ValidRoutePath<Path>,

    handler: ModuleRequestScopeHandler<
      JoinRoutePath<Prefix, Path>,
      ModuleScope,
      RequestScope,
      Result
    >,

    lifecycle?: ModuleRequestScopeLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      ModuleScope,
      RequestScope,
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
    const ModuleScope extends object,
    const RequestScope extends object,
    const Prefix extends string,
    const Method extends string,
    const Path extends string,
    const Query extends StandardSchemaV1 | undefined = undefined,
    const Body extends StandardSchemaV1 | undefined = undefined,
    Result = unknown,
  >(
    this: ModuleRequestScopeBuilderState<ModuleScope, RequestScope, Prefix>,

    method: Method & ValidHttpMethodLiteral<Method>,

    path: Path & ValidRoutePath<Path>,

    options: RouteOptionsFor<Query, Body, undefined>,

    handler: [ModuleScope] extends [never]
      ? (
          context: RouteHandlerContextFor<
            JoinRoutePath<Prefix, Path>,
            RouteOptionsFor<Query, Body, undefined>
          >,

          requestScope: RequestScope,
        ) => Result
      : (
          context: RouteHandlerContextFor<
            JoinRoutePath<Prefix, Path>,
            RouteOptionsFor<Query, Body, undefined>
          >,

          moduleScope: ModuleScope,

          requestScope: RequestScope,
        ) => Result,

    lifecycle?: ModuleRequestScopeLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      ModuleScope,
      RequestScope,
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
    const ModuleScope extends object,
    const RequestScope extends object,
    const Prefix extends string,
    const Method extends string,
    const Path extends string,
    const Responses extends ResponseContractMap,
    const Query extends StandardSchemaV1 | undefined = undefined,
    const Body extends StandardSchemaV1 | undefined = undefined,
  >(
    this: ModuleRequestScopeBuilderState<ModuleScope, RequestScope, Prefix>,

    method: Method & ValidHttpMethodLiteral<Method>,

    path: Path & ValidRoutePath<Path>,

    options: RouteOptionsFor<Query, Body, Responses> & {
      readonly responses: Responses;
    },

    handler: [ModuleScope] extends [never]
      ? (
          context: RouteHandlerContextFor<
            JoinRoutePath<Prefix, Path>,
            RouteOptionsFor<Query, Body, Responses>
          >,

          requestScope: RequestScope,
        ) => RouteHandlerResultFor<Responses>
      : (
          context: RouteHandlerContextFor<
            JoinRoutePath<Prefix, Path>,
            RouteOptionsFor<Query, Body, Responses>
          >,

          moduleScope: ModuleScope,

          requestScope: RequestScope,
        ) => RouteHandlerResultFor<Responses>,

    lifecycle?: ModuleRequestScopeLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      ModuleScope,
      RequestScope,
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

interface SharedModuleRequestScopeRouteSurface {
  readonly get: SharedModuleRequestScopeRouteMethod<"GET">;

  readonly post: SharedModuleRequestScopeRouteMethod<"POST">;

  readonly put: SharedModuleRequestScopeRouteMethod<"PUT">;

  readonly patch: SharedModuleRequestScopeRouteMethod<"PATCH">;

  readonly delete: SharedModuleRequestScopeRouteMethod<"DELETE">;

  readonly options: SharedModuleRequestScopeRouteMethod<"OPTIONS">;

  readonly head: SharedModuleRequestScopeRouteMethod<"HEAD">;

  readonly query: SharedModuleRequestScopeRouteMethod<"QUERY">;

  readonly all: SharedModuleRequestScopeRouteMethod<"*">;

  readonly route: SharedModuleRequestScopeGenericRouteMethod;
}

export type ModuleRequestScopeBuilder<
  ModuleScope extends object,
  RequestScope extends object,
  Prefix extends string = "",
> = SharedModuleRequestScopeRouteSurface &
  ModuleRequestScopeBuilderState<ModuleScope, RequestScope, Prefix>;

export function createModuleRequestScopeBuilder<
  ModuleScope extends object,
  RequestScope extends object,
  Prefix extends string,
>(
  prefix: Prefix,

  derive: ModuleRequestScopeDerive<ModuleScope, RequestScope>,

  register: RuntimeRouteRegister,

  usesModuleScope: boolean,

  moduleBeforeHandle:
    | RuntimeBeforeHandle
    | RuntimeScopedModuleBeforeHandle
    | undefined,

  moduleAfterHandle:
    | RuntimeAfterHandle
    | RuntimeScopedModuleAfterHandle
    | undefined,
): ModuleRequestScopeBuilder<ModuleScope, RequestScope, Prefix> {
  const builder = new RouteBuilder(
    prefix,

    (route) => {
      register(
        bindModuleRequestScopeRoute(
          route,
          derive,
          usesModuleScope,
          moduleBeforeHandle,
          moduleAfterHandle,
        ),
      );
    },
  );

  return builder as unknown as ModuleRequestScopeBuilder<
    ModuleScope,
    RequestScope,
    Prefix
  >;
}

export function bindModuleApplicationScopeRoute(
  route: RuntimeRouteRecord,

  moduleScope: object,
): RuntimeRouteRecord {
  if (route.moduleRequestScope === undefined) {
    return bindApplicationScopeRoute(route, moduleScope);
  }

  return {
    ...route,

    moduleScope,
  };
}

function bindModuleRequestScopeRoute<
  ModuleScope extends object,
  RequestScope extends object,
>(
  route: RuntimeRouteRecord,

  derive: ModuleRequestScopeDerive<ModuleScope, RequestScope>,

  usesModuleScope: boolean,

  moduleBeforeHandle:
    | RuntimeBeforeHandle
    | RuntimeScopedModuleBeforeHandle
    | undefined,

  moduleAfterHandle:
    | RuntimeAfterHandle
    | RuntimeScopedModuleAfterHandle
    | undefined,
): RuntimeRouteRecord {
  const plan: RuntimeModuleRequestScopePlan = usesModuleScope
    ? {
        kind: "scoped",

        derive: derive as unknown as RuntimeScopedModuleRequestScopeDerive,

        beforeHandle: route.beforeHandle as unknown as
          | RuntimeScopedModuleRequestScopeBeforeHandle
          | undefined,

        afterHandle: route.afterHandle as unknown as
          | RuntimeScopedModuleRequestScopeAfterHandle
          | undefined,

        moduleBeforeHandle: moduleBeforeHandle as
          | RuntimeScopedModuleBeforeHandle
          | undefined,

        moduleAfterHandle: moduleAfterHandle as
          | RuntimeScopedModuleAfterHandle
          | undefined,
      }
    : {
        kind: "static",

        derive: derive as unknown as RuntimeStaticModuleRequestScopeDerive,

        beforeHandle: route.beforeHandle as unknown as
          | RuntimeStaticModuleRequestScopeBeforeHandle
          | undefined,

        afterHandle: route.afterHandle as unknown as
          | RuntimeStaticModuleRequestScopeAfterHandle
          | undefined,

        moduleBeforeHandle: moduleBeforeHandle as
          | RuntimeBeforeHandle
          | undefined,

        moduleAfterHandle: moduleAfterHandle as RuntimeAfterHandle | undefined,
      };

  let flags = route.flags | RUNTIME_ROUTE_MODULE_REQUEST_SCOPE;

  if (plan.moduleBeforeHandle !== undefined) {
    flags |= RUNTIME_ROUTE_BEFORE_HANDLE;
  }

  if (plan.moduleAfterHandle !== undefined) {
    flags |= RUNTIME_ROUTE_AFTER_HANDLE;
  }

  return {
    ...route,

    flags,

    beforeHandle: undefined,

    afterHandle: undefined,

    moduleRequestScope: plan,
  };
}
