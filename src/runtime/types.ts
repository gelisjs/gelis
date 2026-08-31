import type { HttpMethod, ResponseSchemaMap } from "../route";

import type { RuntimeInputPlan } from "./input";

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

  readonly input: RuntimeInputPlan | undefined;

  readonly responses: ResponseSchemaMap | undefined;
}

export type RuntimeRouteRegister = (route: RuntimeRouteRecord) => void;
