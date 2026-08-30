import type {
  HttpMethod,
  RouteHandler,
  RouteHandlerContextFor,
  RouteOptions,
  RouteRef,
  RouteRequestContract,
  RouteRequestFor,
  RouteResponsesFor,
} from "./route";

import type { InferPathParams, ValidRoutePath } from "./types/path";

import type {
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

  get<const Path extends string, const Options extends RouteOptions, Result>(
    path: Path & ValidRoutePath<Path>,

    options: Options,

    handler: (
      context: RouteHandlerContextFor<JoinRoutePath<Prefix, Path>, Options>,
    ) => Result,
  ): RouteRef<
    "GET",
    JoinRoutePath<Prefix, Path>,
    RouteRequestFor<JoinRoutePath<Prefix, Path>, Options>,
    RouteResponsesFor<Options, Result>
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

  post<const Path extends string, const Options extends RouteOptions, Result>(
    path: Path & ValidRoutePath<Path>,

    options: Options,

    handler: (
      context: RouteHandlerContextFor<JoinRoutePath<Prefix, Path>, Options>,
    ) => Result,
  ): RouteRef<
    "POST",
    JoinRoutePath<Prefix, Path>,
    RouteRequestFor<JoinRoutePath<Prefix, Path>, Options>,
    RouteResponsesFor<Options, Result>
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

      optionsOrHandler as RouteOptions,
    );
  }

  private registerRuntimeRoute(
    method: HttpMethod,

    path: string,

    handler: RuntimeRouteHandler,

    options: RouteOptions | undefined,
  ): unknown {
    const fullPath = this.resolve(path);

    this.#register({
      method,
      path: fullPath,
      handler,
      options,
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
