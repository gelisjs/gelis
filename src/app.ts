import type { HttpMethod, RouteHandler, RouteRef } from "./route";

import type { ValidRoutePath } from "./types/path";

export class Gelis {
  get<const Path extends string>(
    path: Path & ValidRoutePath<Path>,
    handler: RouteHandler<Path>,
  ): RouteRef<"GET", Path> {
    void handler;

    return {
      method: "GET",
      path,
    };
  }

  route<const Method extends HttpMethod, const Path extends string>(
    method: Method,
    path: Path & ValidRoutePath<Path>,
    handler: RouteHandler<Path>,
  ): RouteRef<Method, Path> {
    void handler;

    return {
      method,
      path,
    };
  }
}
