import type { HttpMethod, ResponseSchemaMap } from "../route";

import type { RuntimeInputPlan } from "./input";

export const RUNTIME_ROUTE_PLAIN = 0;
export const RUNTIME_ROUTE_INPUT = 1;
export const RUNTIME_ROUTE_BEFORE_HANDLE = 2;
export const RUNTIME_ROUTE_AFTER_HANDLE = 4;

export const RUNTIME_ROUTE_INPUT_BEFORE_HANDLE =
  RUNTIME_ROUTE_INPUT | RUNTIME_ROUTE_BEFORE_HANDLE;

export const RUNTIME_ROUTE_INPUT_AFTER_HANDLE =
  RUNTIME_ROUTE_INPUT | RUNTIME_ROUTE_AFTER_HANDLE;

export const RUNTIME_ROUTE_BEFORE_AFTER_HANDLE =
  RUNTIME_ROUTE_BEFORE_HANDLE | RUNTIME_ROUTE_AFTER_HANDLE;

export const RUNTIME_ROUTE_INPUT_BEFORE_AFTER_HANDLE =
  RUNTIME_ROUTE_INPUT |
  RUNTIME_ROUTE_BEFORE_HANDLE |
  RUNTIME_ROUTE_AFTER_HANDLE;

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

export type RuntimeAfterHandle = (
  context: RuntimeRouteContext,

  result: unknown,
) => void | PromiseLike<void>;

export interface RuntimeRouteRecord {
  readonly method: HttpMethod;

  readonly path: string;

  readonly handler: RuntimeRouteHandler;

  /*
   * Lifecycle execution fields are mutable
   * deliberately.
   *
   * Gelis recompiles effective lifecycle plans
   * at configuration time when global hooks
   * are added.
   */
  flags: number;

  readonly input: RuntimeInputPlan | undefined;

  beforeHandle: RuntimeBeforeHandle | undefined;

  afterHandle: RuntimeAfterHandle | undefined;

  readonly responses: ResponseSchemaMap | undefined;
}

export type RuntimeRouteRegister = (route: RuntimeRouteRecord) => void;
