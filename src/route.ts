import type { InferPathParams } from "./types/path";

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD";

export interface RouteContext<Path extends string> {
  params: InferPathParams<Path>;
}

export interface RouteRef<Method extends HttpMethod, Path extends string> {
  readonly method: Method;
  readonly path: Path;
}

export type RouteHandler<Path extends string> = (
  context: RouteContext<Path>,
) => unknown;
