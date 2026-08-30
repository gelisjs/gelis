import type { HttpMethod, RouteOptions } from "../route";

export interface RuntimeReply {
  status(status: number, body: unknown): unknown;
}

export interface RuntimeRouteContext {
  request: Request;

  params: Record<string, string>;

  query: unknown;
  body: unknown;

  reply: RuntimeReply;
}

export type RuntimeRouteHandler = (
  context: RuntimeRouteContext,
) => unknown | Promise<unknown>;

export interface RuntimeRouteRecord {
  readonly method: HttpMethod;
  readonly path: string;

  readonly handler: RuntimeRouteHandler;

  readonly options: RouteOptions | undefined;
}

export type RuntimeRouteRegister = (route: RuntimeRouteRecord) => void;
