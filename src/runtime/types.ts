import type { HttpMethod, ResponseContractMap } from "../route";

import type { RuntimeInputPlan } from "./input";

import type { RuntimeResponsePlan } from "./response-plan";

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

  /*
   * Present only when at least one declared response
   * entry activates executable response behavior.
   *
   * Metadata-only and plain routes deliberately omit
   * this property so their runtime record shape does
   * not gain response-plan state unnecessarily.
   */
  readonly responsePlan?: RuntimeResponsePlan;

  beforeHandle: RuntimeBeforeHandle | undefined;

  afterHandle: RuntimeAfterHandle | undefined;

  readonly responses: ResponseContractMap | undefined;
}

export type RuntimeRouteRegister = (route: RuntimeRouteRecord) => void;
