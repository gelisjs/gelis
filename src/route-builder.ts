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

export class RouteBuilder<Prefix extends string = ""> {
  readonly #prefix: Prefix;

  constructor(prefix: Prefix) {
    this.#prefix = prefix;
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

  get(path: string, _optionsOrHandler: unknown, _handler?: unknown): unknown {
    return {
      method: "GET",
      path: this.resolve(path),
    };
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

  post(path: string, _optionsOrHandler: unknown, _handler?: unknown): unknown {
    return {
      method: "POST",
      path: this.resolve(path),
    };
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

  route(method: HttpMethod, path: string, _handler: unknown): unknown {
    return {
      method,
      path: this.resolve(path),
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
