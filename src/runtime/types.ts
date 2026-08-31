import type { HttpMethod, ResponseSchemaMap } from "../route";

import type { RuntimeInputPlan } from "./input";

export const RUNTIME_ROUTE_PLAIN = 0;
export const RUNTIME_ROUTE_INPUT = 1;
export const RUNTIME_ROUTE_BEFORE_HANDLE = 2;
export const RUNTIME_ROUTE_INPUT_BEFORE_HANDLE =
  RUNTIME_ROUTE_INPUT | RUNTIME_ROUTE_BEFORE_HANDLE;

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

export type RuntimeBeforeHandle = (
  context: RuntimeRouteContext,
) => unknown | PromiseLike<unknown>;

export interface RuntimeRouteRecord {
  readonly method: HttpMethod;

  readonly path: string;

  readonly handler: RuntimeRouteHandler;

  readonly flags: number;

  readonly input: RuntimeInputPlan | undefined;

  readonly beforeHandle: RuntimeBeforeHandle | undefined;

  readonly responses: ResponseSchemaMap | undefined;
}

export type RuntimeRouteRegister = (route: RuntimeRouteRecord) => void;
