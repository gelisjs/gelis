import type { HttpMethod, RouteHandler, RouteRef } from "./route";

export class Gelis {
  get<Path extends string>(
    path: Path,
    handler: RouteHandler<Path>,
  ): RouteRef<"GET", Path> {
    void handler;

    return {
      method: "GET",
      path,
    };
  }

  route<Method extends HttpMethod, Path extends string>(
    method: Method,
    path: Path,
    handler: RouteHandler<Path>,
  ): RouteRef<Method, Path> {
    void handler;

    return {
      method,
      path,
    };
  }
}
