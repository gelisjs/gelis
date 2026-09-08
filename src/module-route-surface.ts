import type {
  ApplicationScopeHandler,
  ApplicationScopeLifecycleFor,
} from "./application-scope";

import type {
  HttpMethod,
  InferImplicitResponses,
  ResponseContractMap,
  RouteHandler,
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

import type { JoinRoutePath } from "./route-builder";

/*
 * Module route surfaces intentionally avoid exposing RouteBuilder<Prefix>
 * directly.
 *
 * Prefix/scope state is carried in tiny phantom receiver types. Each called
 * method infers only those state generics from `this`, rather than capturing
 * the entire builder intersection as one generic type argument.
 *
 * Runtime still uses RouteBuilder exactly as before.
 */

declare const moduleRouteBuilderPrefixBrand: unique symbol;

declare const moduleScopedRouteBuilderScopeBrand: unique symbol;

export interface ModuleRouteBuilderState<Prefix extends string> {
  readonly [moduleRouteBuilderPrefixBrand]: Prefix;
}

export interface ModuleScopedRouteBuilderState<
  Scope extends object,
  Prefix extends string,
> extends ModuleRouteBuilderState<Prefix> {
  readonly [moduleScopedRouteBuilderScopeBrand]: Scope;
}

interface ModulePlainRouteMethod<Method extends HttpMethod> {
  <const Prefix extends string, const Path extends string, Result>(
    this: ModuleRouteBuilderState<Prefix>,

    path: Path & ValidRoutePath<Path>,

    handler: RouteHandler<JoinRoutePath<Prefix, Path>, never, never, Result>,

    lifecycle?: RouteLifecycleFor<
      JoinRoutePath<Prefix, Path>,
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
    const Prefix extends string,
    const Path extends string,
    const Query extends StandardSchemaV1 | undefined = undefined,
    const Body extends StandardSchemaV1 | undefined = undefined,
    Result = unknown,
  >(
    this: ModuleRouteBuilderState<Prefix>,

    path: Path & ValidRoutePath<Path>,

    options: RouteOptionsFor<Query, Body, undefined>,

    handler: (
      context: RouteHandlerContextFor<
        JoinRoutePath<Prefix, Path>,
        RouteOptionsFor<Query, Body, undefined>
      >,
    ) => Result,

    lifecycle?: RouteLifecycleFor<
      JoinRoutePath<Prefix, Path>,
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
    const Prefix extends string,
    const Path extends string,
    const Responses extends ResponseContractMap,
    const Query extends StandardSchemaV1 | undefined = undefined,
    const Body extends StandardSchemaV1 | undefined = undefined,
  >(
    this: ModuleRouteBuilderState<Prefix>,

    path: Path & ValidRoutePath<Path>,

    options: RouteOptionsFor<Query, Body, Responses> & {
      readonly responses: Responses;
    },

    handler: (
      context: RouteHandlerContextFor<
        JoinRoutePath<Prefix, Path>,
        RouteOptionsFor<Query, Body, Responses>
      >,
    ) => RouteHandlerResultFor<Responses>,

    lifecycle?: RouteLifecycleFor<
      JoinRoutePath<Prefix, Path>,
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

interface ModulePlainGenericRouteMethod {
  <
    const Prefix extends string,
    const Method extends HttpMethod,
    const Path extends string,
    Result,
  >(
    this: ModuleRouteBuilderState<Prefix>,

    method: Method,

    path: Path & ValidRoutePath<Path>,

    handler: RouteHandler<JoinRoutePath<Prefix, Path>, never, never, Result>,

    lifecycle?: RouteLifecycleFor<
      JoinRoutePath<Prefix, Path>,
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
    const Prefix extends string,
    const Method extends HttpMethod,
    const Path extends string,
    const Query extends StandardSchemaV1 | undefined = undefined,
    const Body extends StandardSchemaV1 | undefined = undefined,
    Result = unknown,
  >(
    this: ModuleRouteBuilderState<Prefix>,

    method: Method,

    path: Path & ValidRoutePath<Path>,

    options: RouteOptionsFor<Query, Body, undefined>,

    handler: (
      context: RouteHandlerContextFor<
        JoinRoutePath<Prefix, Path>,
        RouteOptionsFor<Query, Body, undefined>
      >,
    ) => Result,

    lifecycle?: RouteLifecycleFor<
      JoinRoutePath<Prefix, Path>,
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
    const Prefix extends string,
    const Method extends HttpMethod,
    const Path extends string,
    const Responses extends ResponseContractMap,
    const Query extends StandardSchemaV1 | undefined = undefined,
    const Body extends StandardSchemaV1 | undefined = undefined,
  >(
    this: ModuleRouteBuilderState<Prefix>,

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
    ) => RouteHandlerResultFor<Responses>,

    lifecycle?: RouteLifecycleFor<
      JoinRoutePath<Prefix, Path>,
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

interface SharedModulePlainRouteSurface {
  readonly get: ModulePlainRouteMethod<"GET">;

  readonly post: ModulePlainRouteMethod<"POST">;

  readonly put: ModulePlainRouteMethod<"PUT">;

  readonly patch: ModulePlainRouteMethod<"PATCH">;

  readonly delete: ModulePlainRouteMethod<"DELETE">;

  readonly options: ModulePlainRouteMethod<"OPTIONS">;

  readonly head: ModulePlainRouteMethod<"HEAD">;

  readonly query: ModulePlainRouteMethod<"QUERY">;

  readonly route: ModulePlainGenericRouteMethod;
}

interface ModuleScopedRouteMethod<Method extends HttpMethod> {
  <
    const Scope extends object,
    const Prefix extends string,
    const Path extends string,
    Result,
  >(
    this: ModuleScopedRouteBuilderState<Scope, Prefix>,

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
    const Scope extends object,
    const Prefix extends string,
    const Path extends string,
    const Query extends StandardSchemaV1 | undefined = undefined,
    const Body extends StandardSchemaV1 | undefined = undefined,
    Result = unknown,
  >(
    this: ModuleScopedRouteBuilderState<Scope, Prefix>,

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
    const Scope extends object,
    const Prefix extends string,
    const Path extends string,
    const Responses extends ResponseContractMap,
    const Query extends StandardSchemaV1 | undefined = undefined,
    const Body extends StandardSchemaV1 | undefined = undefined,
  >(
    this: ModuleScopedRouteBuilderState<Scope, Prefix>,

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

interface ModuleScopedGenericRouteMethod {
  <
    const Scope extends object,
    const Prefix extends string,
    const Method extends HttpMethod,
    const Path extends string,
    Result,
  >(
    this: ModuleScopedRouteBuilderState<Scope, Prefix>,

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
    const Scope extends object,
    const Prefix extends string,
    const Method extends HttpMethod,
    const Path extends string,
    const Query extends StandardSchemaV1 | undefined = undefined,
    const Body extends StandardSchemaV1 | undefined = undefined,
    Result = unknown,
  >(
    this: ModuleScopedRouteBuilderState<Scope, Prefix>,

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
    const Scope extends object,
    const Prefix extends string,
    const Method extends HttpMethod,
    const Path extends string,
    const Responses extends ResponseContractMap,
    const Query extends StandardSchemaV1 | undefined = undefined,
    const Body extends StandardSchemaV1 | undefined = undefined,
  >(
    this: ModuleScopedRouteBuilderState<Scope, Prefix>,

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

interface SharedModuleScopedRouteSurface {
  readonly get: ModuleScopedRouteMethod<"GET">;

  readonly post: ModuleScopedRouteMethod<"POST">;

  readonly put: ModuleScopedRouteMethod<"PUT">;

  readonly patch: ModuleScopedRouteMethod<"PATCH">;

  readonly delete: ModuleScopedRouteMethod<"DELETE">;

  readonly options: ModuleScopedRouteMethod<"OPTIONS">;

  readonly head: ModuleScopedRouteMethod<"HEAD">;

  readonly query: ModuleScopedRouteMethod<"QUERY">;

  readonly route: ModuleScopedGenericRouteMethod;
}

export type ModulePlainRouteBuilder<Prefix extends string> =
  SharedModulePlainRouteSurface & ModuleRouteBuilderState<Prefix>;

export type ModuleScopedRouteBuilder<
  Scope extends object,
  Prefix extends string,
> = SharedModuleScopedRouteSurface &
  ModuleScopedRouteBuilderState<Scope, Prefix>;
