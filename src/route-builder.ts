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
  RUNTIME_ROUTE_RESPONSE,
} from "./runtime/types";

import type { InferPathParams, ValidRoutePath } from "./types/path";

import type {
  RuntimeAfterHandle,
  RuntimeBeforeHandle,
  RuntimeRouteHandler,
  RuntimeRouteRecord,
  RuntimeRouteRegister,
} from "./runtime/types";

import { createRuntimeResponsePlan } from "./runtime/response-plan";

import {
  createRuntimeRouteContractMetadata,
  RUNTIME_ROUTE_CONTRACT_METADATA,
} from "./runtime/contract-metadata";

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

  /*
   * GET without options.
   *
   * Handler result is inferred naturally and
   * becomes the implicit public response contract.
   */
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

  /*
   * GET with options but without an explicit
   * response contract.
   *
   * Result inference remains implementation-driven.
   */
  get<
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
    ) => Result,

    lifecycle?: RouteLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      Query,
      Body,
      undefined,
      Result
    >,
  ): RouteRef<
    "GET",
    JoinRoutePath<Prefix, Path>,
    RouteRequestFor<
      JoinRoutePath<Prefix, Path>,
      RouteOptionsFor<Query, Body, undefined>
    >,
    RouteResponsesFor<RouteOptionsFor<Query, Body, undefined>, Result>
  >;

  /*
   * GET with an explicit response contract.
   *
   * The response contract directly contextually
   * types the handler result. We intentionally do
   * not infer an implementation-specific Result
   * generic here.
   *
   * Handler output is checked directly against the
   * declared producer-result algebra without adding
   * implementation-specific result inference here.
   *
   * afterHandle receives the conservative producer
   * result algebra represented by the response
   * contract.
   */
  get<
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
    ) => RouteHandlerResultFor<Responses>,

    lifecycle?: RouteLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      Query,
      Body,
      Responses,
      RouteHandlerResultFor<Responses>
    >,
  ): RouteRef<
    "GET",
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

  /*
   * POST without options.
   */
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

  /*
   * POST with options but without an explicit
   * response contract.
   */
  post<
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
    ) => Result,

    lifecycle?: RouteLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      Query,
      Body,
      undefined,
      Result
    >,
  ): RouteRef<
    "POST",
    JoinRoutePath<Prefix, Path>,
    RouteRequestFor<
      JoinRoutePath<Prefix, Path>,
      RouteOptionsFor<Query, Body, undefined>
    >,
    RouteResponsesFor<RouteOptionsFor<Query, Body, undefined>, Result>
  >;

  /*
   * POST with an explicit response contract.
   */
  post<
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
    ) => RouteHandlerResultFor<Responses>,

    lifecycle?: RouteLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      Query,
      Body,
      Responses,
      RouteHandlerResultFor<Responses>
    >,
  ): RouteRef<
    "POST",
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

  /*
   * PUT without options.
   */
  put<const Path extends string, Result>(
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
    "PUT",
    JoinRoutePath<Prefix, Path>,
    RouteRequestContract<InferPathParams<JoinRoutePath<Prefix, Path>>>,
    InferImplicitResponses<Result>
  >;

  /*
   * PUT with options but without an explicit
   * response contract.
   */
  put<
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
    ) => Result,

    lifecycle?: RouteLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      Query,
      Body,
      undefined,
      Result
    >,
  ): RouteRef<
    "PUT",
    JoinRoutePath<Prefix, Path>,
    RouteRequestFor<
      JoinRoutePath<Prefix, Path>,
      RouteOptionsFor<Query, Body, undefined>
    >,
    RouteResponsesFor<RouteOptionsFor<Query, Body, undefined>, Result>
  >;

  /*
   * PUT with an explicit response contract.
   */
  put<
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
    ) => RouteHandlerResultFor<Responses>,

    lifecycle?: RouteLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      Query,
      Body,
      Responses,
      RouteHandlerResultFor<Responses>
    >,
  ): RouteRef<
    "PUT",
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

  put(
    path: string,

    optionsOrHandler: unknown,

    handlerOrLifecycle?: unknown,

    lifecycle?: unknown,
  ): unknown {
    return this.registerRoute(
      "PUT",
      path,
      optionsOrHandler,
      handlerOrLifecycle,
      lifecycle,
    );
  }

  /*
   * PATCH without options.
   */
  patch<const Path extends string, Result>(
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
    "PATCH",
    JoinRoutePath<Prefix, Path>,
    RouteRequestContract<InferPathParams<JoinRoutePath<Prefix, Path>>>,
    InferImplicitResponses<Result>
  >;

  /*
   * PATCH with options but without an explicit
   * response contract.
   */
  patch<
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
    ) => Result,

    lifecycle?: RouteLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      Query,
      Body,
      undefined,
      Result
    >,
  ): RouteRef<
    "PATCH",
    JoinRoutePath<Prefix, Path>,
    RouteRequestFor<
      JoinRoutePath<Prefix, Path>,
      RouteOptionsFor<Query, Body, undefined>
    >,
    RouteResponsesFor<RouteOptionsFor<Query, Body, undefined>, Result>
  >;

  /*
   * PATCH with an explicit response contract.
   */
  patch<
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
    ) => RouteHandlerResultFor<Responses>,

    lifecycle?: RouteLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      Query,
      Body,
      Responses,
      RouteHandlerResultFor<Responses>
    >,
  ): RouteRef<
    "PATCH",
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

  patch(
    path: string,

    optionsOrHandler: unknown,

    handlerOrLifecycle?: unknown,

    lifecycle?: unknown,
  ): unknown {
    return this.registerRoute(
      "PATCH",
      path,
      optionsOrHandler,
      handlerOrLifecycle,
      lifecycle,
    );
  }

  /*
   * DELETE without options.
   */
  delete<const Path extends string, Result>(
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
    "DELETE",
    JoinRoutePath<Prefix, Path>,
    RouteRequestContract<InferPathParams<JoinRoutePath<Prefix, Path>>>,
    InferImplicitResponses<Result>
  >;

  /*
   * DELETE with options but without an explicit
   * response contract.
   */
  delete<
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
    ) => Result,

    lifecycle?: RouteLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      Query,
      Body,
      undefined,
      Result
    >,
  ): RouteRef<
    "DELETE",
    JoinRoutePath<Prefix, Path>,
    RouteRequestFor<
      JoinRoutePath<Prefix, Path>,
      RouteOptionsFor<Query, Body, undefined>
    >,
    RouteResponsesFor<RouteOptionsFor<Query, Body, undefined>, Result>
  >;

  /*
   * DELETE with an explicit response contract.
   */
  delete<
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
    ) => RouteHandlerResultFor<Responses>,

    lifecycle?: RouteLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      Query,
      Body,
      Responses,
      RouteHandlerResultFor<Responses>
    >,
  ): RouteRef<
    "DELETE",
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

  delete(
    path: string,

    optionsOrHandler: unknown,

    handlerOrLifecycle?: unknown,

    lifecycle?: unknown,
  ): unknown {
    return this.registerRoute(
      "DELETE",
      path,
      optionsOrHandler,
      handlerOrLifecycle,
      lifecycle,
    );
  }

  /*
   * OPTIONS without options.
   */
  options<const Path extends string, Result>(
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
    "OPTIONS",
    JoinRoutePath<Prefix, Path>,
    RouteRequestContract<InferPathParams<JoinRoutePath<Prefix, Path>>>,
    InferImplicitResponses<Result>
  >;

  /*
   * OPTIONS with options but without an explicit
   * response contract.
   */
  options<
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
    ) => Result,

    lifecycle?: RouteLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      Query,
      Body,
      undefined,
      Result
    >,
  ): RouteRef<
    "OPTIONS",
    JoinRoutePath<Prefix, Path>,
    RouteRequestFor<
      JoinRoutePath<Prefix, Path>,
      RouteOptionsFor<Query, Body, undefined>
    >,
    RouteResponsesFor<RouteOptionsFor<Query, Body, undefined>, Result>
  >;

  /*
   * OPTIONS with an explicit response contract.
   */
  options<
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
    ) => RouteHandlerResultFor<Responses>,

    lifecycle?: RouteLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      Query,
      Body,
      Responses,
      RouteHandlerResultFor<Responses>
    >,
  ): RouteRef<
    "OPTIONS",
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

  options(
    path: string,

    optionsOrHandler: unknown,

    handlerOrLifecycle?: unknown,

    lifecycle?: unknown,
  ): unknown {
    return this.registerRoute(
      "OPTIONS",
      path,
      optionsOrHandler,
      handlerOrLifecycle,
      lifecycle,
    );
  }

  /*
   * HEAD without options.
   */
  head<const Path extends string, Result>(
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
    "HEAD",
    JoinRoutePath<Prefix, Path>,
    RouteRequestContract<InferPathParams<JoinRoutePath<Prefix, Path>>>,
    InferImplicitResponses<Result>
  >;

  /*
   * HEAD with options but without an explicit
   * response contract.
   */
  head<
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
    ) => Result,

    lifecycle?: RouteLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      Query,
      Body,
      undefined,
      Result
    >,
  ): RouteRef<
    "HEAD",
    JoinRoutePath<Prefix, Path>,
    RouteRequestFor<
      JoinRoutePath<Prefix, Path>,
      RouteOptionsFor<Query, Body, undefined>
    >,
    RouteResponsesFor<RouteOptionsFor<Query, Body, undefined>, Result>
  >;

  /*
   * HEAD with an explicit response contract.
   */
  head<
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
    ) => RouteHandlerResultFor<Responses>,

    lifecycle?: RouteLifecycleFor<
      JoinRoutePath<Prefix, Path>,
      Query,
      Body,
      Responses,
      RouteHandlerResultFor<Responses>
    >,
  ): RouteRef<
    "HEAD",
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

  head(
    path: string,

    optionsOrHandler: unknown,

    handlerOrLifecycle?: unknown,

    lifecycle?: unknown,
  ): unknown {
    return this.registerRoute(
      "HEAD",
      path,
      optionsOrHandler,
      handlerOrLifecycle,
      lifecycle,
    );
  }

  /*
   * Generic method route without options.
   */
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

  /*
   * Generic method route with options but without
   * an explicit response contract.
   */
  route<
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

  /*
   * Generic method route with an explicit
   * response contract.
   */
  route<
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

  route(
    method: HttpMethod,

    path: string,

    optionsOrHandler: unknown,

    handlerOrLifecycle?: unknown,

    lifecycle?: unknown,
  ): unknown {
    return this.registerRoute(
      method,
      path,
      optionsOrHandler,
      handlerOrLifecycle,
      lifecycle,
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

    const responses = options?.responses;

    const contractMetadata = createRuntimeRouteContractMetadata(
      options?.openapi,
    );

    const responsePlan =
      responses === undefined
        ? undefined
        : createRuntimeResponsePlan(responses);

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

    if (responsePlan !== undefined) {
      flags |= RUNTIME_ROUTE_RESPONSE;
    }

    const runtimeRoute: RuntimeRouteRecord = {
      method,
      path: fullPath,

      handler,

      flags,

      input,

      beforeHandle,

      afterHandle,

      responses,
    };

    if (contractMetadata !== undefined) {
      Object.defineProperty(runtimeRoute, RUNTIME_ROUTE_CONTRACT_METADATA, {
        enumerable: true,

        value: contractMetadata,
      });
    }

    if (responsePlan === undefined) {
      this.#register(runtimeRoute);
    } else {
      this.#register({
        ...runtimeRoute,

        responsePlan,
      });
    }

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
