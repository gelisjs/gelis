import type {
  HttpMethod,
  ResponseSchemaMap,
  RouteHandler,
  RouteHandlerContextFor,
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
  RUNTIME_ROUTE_BEFORE_HANDLE,
  RUNTIME_ROUTE_INPUT,
} from "./runtime/types";

import type { InferPathParams, ValidRoutePath } from "./types/path";

import type {
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

type RuntimeRouteOptions = RouteOptions & {
  readonly beforeHandle?: RuntimeBeforeHandle;
};

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
  ): RouteRef<
    "GET",
    JoinRoutePath<Prefix, Path>,
    RouteRequestContract<InferPathParams<JoinRoutePath<Prefix, Path>>>,
    {
      200: Awaited<Result>;
    }
  >;

  get<
    const Path extends string,
    const Query extends StandardSchemaV1 | undefined = undefined,
    const Body extends StandardSchemaV1 | undefined = undefined,
    const Responses extends ResponseSchemaMap | undefined = undefined,
    Result = unknown,
  >(
    path: Path & ValidRoutePath<Path>,

    options: RouteOptionsFor<
      JoinRoutePath<Prefix, Path>,
      Query,
      Body,
      Responses
    >,

    handler: (
      context: RouteHandlerContextFor<
        JoinRoutePath<Prefix, Path>,
        RouteOptionsFor<JoinRoutePath<Prefix, Path>, Query, Body, Responses>
      >,
    ) => Result,
  ): RouteRef<
    "GET",
    JoinRoutePath<Prefix, Path>,
    RouteRequestFor<
      JoinRoutePath<Prefix, Path>,
      RouteOptionsFor<JoinRoutePath<Prefix, Path>, Query, Body, Responses>
    >,
    RouteResponsesFor<
      RouteOptionsFor<JoinRoutePath<Prefix, Path>, Query, Body, Responses>,
      Result
    >
  >;

  get(
    path: string,

    optionsOrHandler: unknown,

    handler?: unknown,
  ): unknown {
    return this.registerRoute("GET", path, optionsOrHandler, handler);
  }

  post<const Path extends string, Result>(
    path: Path & ValidRoutePath<Path>,

    handler: RouteHandler<JoinRoutePath<Prefix, Path>, never, never, Result>,
  ): RouteRef<
    "POST",
    JoinRoutePath<Prefix, Path>,
    RouteRequestContract<InferPathParams<JoinRoutePath<Prefix, Path>>>,
    {
      200: Awaited<Result>;
    }
  >;

  post<
    const Path extends string,
    const Query extends StandardSchemaV1 | undefined = undefined,
    const Body extends StandardSchemaV1 | undefined = undefined,
    const Responses extends ResponseSchemaMap | undefined = undefined,
    Result = unknown,
  >(
    path: Path & ValidRoutePath<Path>,

    options: RouteOptionsFor<
      JoinRoutePath<Prefix, Path>,
      Query,
      Body,
      Responses
    >,

    handler: (
      context: RouteHandlerContextFor<
        JoinRoutePath<Prefix, Path>,
        RouteOptionsFor<JoinRoutePath<Prefix, Path>, Query, Body, Responses>
      >,
    ) => Result,
  ): RouteRef<
    "POST",
    JoinRoutePath<Prefix, Path>,
    RouteRequestFor<
      JoinRoutePath<Prefix, Path>,
      RouteOptionsFor<JoinRoutePath<Prefix, Path>, Query, Body, Responses>
    >,
    RouteResponsesFor<
      RouteOptionsFor<JoinRoutePath<Prefix, Path>, Query, Body, Responses>,
      Result
    >
  >;

  post(
    path: string,

    optionsOrHandler: unknown,

    handler?: unknown,
  ): unknown {
    return this.registerRoute("POST", path, optionsOrHandler, handler);
  }

  route<const Method extends HttpMethod, const Path extends string, Result>(
    method: Method,

    path: Path & ValidRoutePath<Path>,

    handler: RouteHandler<JoinRoutePath<Prefix, Path>, never, never, Result>,
  ): RouteRef<
    Method,
    JoinRoutePath<Prefix, Path>,
    RouteRequestContract<InferPathParams<JoinRoutePath<Prefix, Path>>>,
    {
      200: Awaited<Result>;
    }
  >;

  route(
    method: HttpMethod,

    path: string,

    handler: unknown,
  ): unknown {
    return this.registerRuntimeRoute(
      method,
      path,

      handler as RuntimeRouteHandler,

      undefined,
    );
  }

  private registerRoute(
    method: HttpMethod,

    path: string,

    optionsOrHandler: unknown,

    handler: unknown,
  ): unknown {
    if (handler === undefined) {
      return this.registerRuntimeRoute(
        method,
        path,

        optionsOrHandler as RuntimeRouteHandler,

        undefined,
      );
    }

    return this.registerRuntimeRoute(
      method,
      path,

      handler as RuntimeRouteHandler,

      optionsOrHandler as RuntimeRouteOptions,
    );
  }

  private registerRuntimeRoute(
    method: HttpMethod,

    path: string,

    handler: RuntimeRouteHandler,

    options: RuntimeRouteOptions | undefined,
  ): unknown {
    const fullPath = this.resolve(path);

    const input = createRuntimeInputPlan(options);

    const beforeHandle = options?.beforeHandle;

    let flags = 0;

    if (input !== undefined) {
      flags |= RUNTIME_ROUTE_INPUT;
    }

    if (beforeHandle !== undefined) {
      flags |= RUNTIME_ROUTE_BEFORE_HANDLE;
    }

    this.#register({
      method,
      path: fullPath,

      handler,

      flags,

      input,

      beforeHandle,

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
