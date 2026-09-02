import type {
  HttpMethod,
  InferImplicitResponses,
  ResponseContractMap,
  RouteHandler,
  RouteHandlerContextFor,
  RouteHandlerResultFor,
  RouteLifecycleFor,
  RouteOptions,
  RouteOptionsFor,
  RouteRef,
  RouteRequestContract,
  RouteRequestFor,
  RouteResponsesFor,
} from "./route";

import type { StandardSchemaV1 } from "./schema";

import { createRuntimeInputPlan } from "./runtime/input";

import {
  RUNTIME_ROUTE_AFTER_HANDLE,
  RUNTIME_ROUTE_BEFORE_HANDLE,
  RUNTIME_ROUTE_INPUT,
} from "./runtime/types";

import type { InferPathParams, ValidRoutePath } from "./types/path";

import type {
  RuntimeAfterHandle,
  RuntimeBeforeHandle,
  RuntimeRouteHandler,
  RuntimeRouteRegister,
} from "./runtime/types";

export type JoinRoutePath<
  Prefix extends string,
  Path extends string,
> = Prefix extends ""
  ? Path
  : Prefix extends "/"
    ? Path
    : Path extends "/"
      ? Prefix
      : `${Prefix}${Path}`;

const noopRegister: RuntimeRouteRegister = () => {};

interface RuntimeRouteLifecycle {
  readonly beforeHandle?: RuntimeBeforeHandle;

  readonly afterHandle?: RuntimeAfterHandle;
}

type TypedRouteHandler<
  Path extends string,
  Query extends StandardSchemaV1 | undefined,
  Body extends StandardSchemaV1 | undefined,
  Responses extends ResponseContractMap | undefined,
  Result,
> = (
  context: RouteHandlerContextFor<
    Path,
    RouteOptionsFor<Query, Body, Responses>
  >,
) => Result & RouteHandlerResultFor<Responses>;

export class RouteBuilder<Prefix extends string = ""> {
  readonly #prefix: Prefix;

  readonly #register: RuntimeRouteRegister;

  constructor(
    prefix: Prefix,

    register: RuntimeRouteRegister = noopRegister,
  ) {
    this.#prefix = prefix;

    this.#register = register;
  }

  get<const Path extends string, Result>(
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
    "GET",
    JoinRoutePath<Prefix, Path>,
    RouteRequestContract<InferPathParams<JoinRoutePath<Prefix, Path>>>,
    InferImplicitResponses<Result>
  >;

  get<
    const Path extends string,
    const Query extends StandardSchemaV1 | undefined = undefined,
    const Body extends StandardSchemaV1 | undefined = undefined,
    const Responses extends ResponseContractMap | undefined = undefined,
    Result = unknown,
  >(
    path: Path & ValidRoutePath<Path>,

    options: RouteOptionsFor<Query, Body, Responses>,

    handler: TypedRouteHandler<
      JoinRoutePath<Prefix, Path>,
      Query,
      Body,
      Responses,
      Result
    >,

    lifecycle?: RouteLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      Query,
      Body,
      Responses,
      Result
    >,
  ): RouteRef<
    "GET",
    JoinRoutePath<Prefix, Path>,
    RouteRequestFor<
      JoinRoutePath<Prefix, Path>,
      RouteOptionsFor<Query, Body, Responses>
    >,
    RouteResponsesFor<RouteOptionsFor<Query, Body, Responses>, Result>
  >;

  get(
    path: string,

    optionsOrHandler: unknown,

    handlerOrLifecycle?: unknown,

    lifecycle?: unknown,
  ): unknown {
    return this.registerRoute(
      "GET",
      path,
      optionsOrHandler,
      handlerOrLifecycle,
      lifecycle,
    );
  }

  post<const Path extends string, Result>(
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
    "POST",
    JoinRoutePath<Prefix, Path>,
    RouteRequestContract<InferPathParams<JoinRoutePath<Prefix, Path>>>,
    InferImplicitResponses<Result>
  >;

  post<
    const Path extends string,
    const Query extends StandardSchemaV1 | undefined = undefined,
    const Body extends StandardSchemaV1 | undefined = undefined,
    const Responses extends ResponseContractMap | undefined = undefined,
    Result = unknown,
  >(
    path: Path & ValidRoutePath<Path>,

    options: RouteOptionsFor<Query, Body, Responses>,

    handler: TypedRouteHandler<
      JoinRoutePath<Prefix, Path>,
      Query,
      Body,
      Responses,
      Result
    >,

    lifecycle?: RouteLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      Query,
      Body,
      Responses,
      Result
    >,
  ): RouteRef<
    "POST",
    JoinRoutePath<Prefix, Path>,
    RouteRequestFor<
      JoinRoutePath<Prefix, Path>,
      RouteOptionsFor<Query, Body, Responses>
    >,
    RouteResponsesFor<RouteOptionsFor<Query, Body, Responses>, Result>
  >;

  post(
    path: string,

    optionsOrHandler: unknown,

    handlerOrLifecycle?: unknown,

    lifecycle?: unknown,
  ): unknown {
    return this.registerRoute(
      "POST",
      path,
      optionsOrHandler,
      handlerOrLifecycle,
      lifecycle,
    );
  }

  route<const Method extends HttpMethod, const Path extends string, Result>(
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

  route(
    method: HttpMethod,

    path: string,

    handler: unknown,

    lifecycle?: unknown,
  ): unknown {
    return this.registerRuntimeRoute(
      method,
      path,

      handler as RuntimeRouteHandler,

      undefined,

      lifecycle as RuntimeRouteLifecycle | undefined,
    );
  }

  private registerRoute(
    method: HttpMethod,

    path: string,

    optionsOrHandler: unknown,

    handlerOrLifecycle: unknown,

    lifecycle: unknown,
  ): unknown {
    if (typeof optionsOrHandler === "function") {
      return this.registerRuntimeRoute(
        method,
        path,

        optionsOrHandler as RuntimeRouteHandler,

        undefined,

        handlerOrLifecycle as RuntimeRouteLifecycle | undefined,
      );
    }

    return this.registerRuntimeRoute(
      method,
      path,

      handlerOrLifecycle as RuntimeRouteHandler,

      optionsOrHandler as RouteOptions,

      lifecycle as RuntimeRouteLifecycle | undefined,
    );
  }

  private registerRuntimeRoute(
    method: HttpMethod,

    path: string,

    handler: RuntimeRouteHandler,

    options: RouteOptions | undefined,

    lifecycle: RuntimeRouteLifecycle | undefined,
  ): unknown {
    const fullPath = this.resolve(path);

    const input = createRuntimeInputPlan(options);

    const beforeHandle = lifecycle?.beforeHandle;

    const afterHandle = lifecycle?.afterHandle;

    let flags = 0;

    if (input !== undefined) {
      flags |= RUNTIME_ROUTE_INPUT;
    }

    if (beforeHandle !== undefined) {
      flags |= RUNTIME_ROUTE_BEFORE_HANDLE;
    }

    if (afterHandle !== undefined) {
      flags |= RUNTIME_ROUTE_AFTER_HANDLE;
    }

    this.#register({
      method,
      path: fullPath,

      handler,

      flags,

      input,

      beforeHandle,

      afterHandle,

      responses: options?.responses,
    });

    return {
      method,
      path: fullPath,
    };
  }

  private resolve(path: string): string {
    if (this.#prefix === "" || this.#prefix === "/") {
      return path;
    }

    if (path === "/") {
      return this.#prefix;
    }

    return `${this.#prefix}${path}`;
  }
}
