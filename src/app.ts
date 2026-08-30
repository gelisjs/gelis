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

export class Gelis {
  get<const Path extends string, Result>(
    path: Path & ValidRoutePath<Path>,

    handler: RouteHandler<Path, never, never, Result>,
  ): RouteRef<
    "GET",
    Path,
    RouteRequestContract<InferPathParams<Path>>,
    {
      200: Awaited<Result>;
    }
  >;

  get<const Path extends string, const Options extends RouteOptions, Result>(
    path: Path & ValidRoutePath<Path>,

    options: Options,

    handler: (context: RouteHandlerContextFor<Path, Options>) => Result,
  ): RouteRef<
    "GET",
    Path,
    RouteRequestFor<Path, Options>,
    RouteResponsesFor<Options, Result>
  >;

  get(path: string, _optionsOrHandler: unknown, _handler?: unknown): unknown {
    return {
      method: "GET",
      path,
    };
  }

  post<const Path extends string, Result>(
    path: Path & ValidRoutePath<Path>,

    handler: RouteHandler<Path, never, never, Result>,
  ): RouteRef<
    "POST",
    Path,
    RouteRequestContract<InferPathParams<Path>>,
    {
      200: Awaited<Result>;
    }
  >;

  post<const Path extends string, const Options extends RouteOptions, Result>(
    path: Path & ValidRoutePath<Path>,

    options: Options,

    handler: (context: RouteHandlerContextFor<Path, Options>) => Result,
  ): RouteRef<
    "POST",
    Path,
    RouteRequestFor<Path, Options>,
    RouteResponsesFor<Options, Result>
  >;

  post(path: string, _optionsOrHandler: unknown, _handler?: unknown): unknown {
    return {
      method: "POST",
      path,
    };
  }

  route<const Method extends HttpMethod, const Path extends string, Result>(
    method: Method,

    path: Path & ValidRoutePath<Path>,

    handler: RouteHandler<Path, never, never, Result>,
  ): RouteRef<
    Method,
    Path,
    RouteRequestContract<InferPathParams<Path>>,
    {
      200: Awaited<Result>;
    }
  >;

  route(method: HttpMethod, path: string, _handler: unknown): unknown {
    return {
      method,
      path,
    };
  }
}
