import type { StandardSchemaV1 } from "./schema";

import type { InferPathParams } from "./types/path";

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD";

export interface RouteRequestContract<
  Params = Record<never, never>,
  Query = never,
  Body = never,
> {
  params: Params;
  query: Query;
  body: Body;
}

export type RouteResponses = Readonly<Record<number, unknown>>;

export type ResponseSchemaMap = Readonly<Record<number, StandardSchemaV1>>;

export interface RouteOptions {
  readonly query?: StandardSchemaV1;

  readonly body?: StandardSchemaV1;

  readonly responses?: ResponseSchemaMap;
}

type SchemaInput<Schema> = Schema extends StandardSchemaV1
  ? StandardSchemaV1.InferInput<Schema>
  : never;

type SchemaOutput<Schema> = Schema extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<Schema>
  : never;

export type InferResponseSchemas<Schemas extends ResponseSchemaMap> = {
  -readonly [Status in keyof Schemas]: SchemaOutput<Schemas[Status]>;
};

type DeclaredRouteResponsesFor<Options> = Options extends {
  readonly responses?: infer Responses;
}
  ? Responses extends ResponseSchemaMap
    ? InferResponseSchemas<Responses>
    : Record<never, never>
  : Record<never, never>;

type ReplyStatus<Responses extends RouteResponses> = Extract<
  keyof Responses,
  number
>;

interface ReplyResult<Status extends number, Body> {
  readonly status: Status;

  readonly body: Body;

  readonly "~gelisReply"?: true;
}

interface Reply<Responses extends RouteResponses> {
  status<const Status extends ReplyStatus<Responses>>(
    status: Status,

    body: Responses[Status],
  ): ReplyResult<Status, Responses[Status]>;
}

export interface RouteContext<
  Path extends string,
  Query = never,
  Body = never,
  Responses extends RouteResponses = Record<never, never>,
> {
  request: Request;

  params: InferPathParams<Path>;

  query: Query;

  body: Body;

  reply: Reply<Responses>;
}

export interface GlobalRouteContext {
  request: Request;

  params: Record<string, string>;

  /*
   * A global hook can apply to many route
   * contracts, so query/body cannot safely
   * expose one route-specific type.
   */
  query: unknown;

  body: unknown;

  reply: {
    status(status: number, body: unknown): unknown;
  };
}

export type RouteHandler<
  Path extends string,
  Query = never,
  Body = never,
  Result = unknown,
> = (context: RouteContext<Path, Query, Body>) => Result;

export type RouteBeforeHandle<
  Path extends string,
  Query = never,
  Body = never,
  Responses extends RouteResponses = Record<never, never>,
> = (
  context: RouteContext<Path, Query, Body, Responses>,
) => unknown | PromiseLike<unknown>;

export type RouteAfterHandle<
  Path extends string,
  Query = never,
  Body = never,
  Responses extends RouteResponses = Record<never, never>,
  Result = unknown,
> = (
  context: RouteContext<Path, Query, Body, Responses>,

  result: Awaited<Result>,
) => void | PromiseLike<void>;

export type GlobalBeforeHandle = (
  context: GlobalRouteContext,
) => unknown | PromiseLike<unknown>;

export type GlobalAfterHandle = (
  context: GlobalRouteContext,

  result: unknown,
) => void | PromiseLike<void>;

export type RouteOptionsFor<
  QuerySchema extends StandardSchemaV1 | undefined = undefined,
  BodySchema extends StandardSchemaV1 | undefined = undefined,
  Responses extends ResponseSchemaMap | undefined = undefined,
> = {
  readonly query?: QuerySchema;

  readonly body?: BodySchema;

  readonly responses?: Responses;
};

export type RouteLifecycleFor<
  Path extends string,
  QuerySchema extends StandardSchemaV1 | undefined = undefined,
  BodySchema extends StandardSchemaV1 | undefined = undefined,
  Responses extends ResponseSchemaMap | undefined = undefined,
  Result = unknown,
> = {
  readonly beforeHandle?: RouteBeforeHandle<
    Path,
    SchemaOutput<QuerySchema>,
    SchemaOutput<BodySchema>,
    Responses extends ResponseSchemaMap
      ? InferResponseSchemas<Responses>
      : Record<never, never>
  >;

  readonly afterHandle?: RouteAfterHandle<
    Path,
    SchemaOutput<QuerySchema>,
    SchemaOutput<BodySchema>,
    Responses extends ResponseSchemaMap
      ? InferResponseSchemas<Responses>
      : Record<never, never>,
    Result
  >;
};

export type RouteRequestFor<
  Path extends string,
  Options,
> = RouteRequestContract<
  InferPathParams<Path>,
  Options extends {
    readonly query?: infer Query;
  }
    ? SchemaInput<Query>
    : never,
  Options extends {
    readonly body?: infer Body;
  }
    ? SchemaInput<Body>
    : never
>;

export type RouteHandlerContextFor<Path extends string, Options> = RouteContext<
  Path,
  Options extends {
    readonly query?: infer Query;
  }
    ? SchemaOutput<Query>
    : never,
  Options extends {
    readonly body?: infer Body;
  }
    ? SchemaOutput<Body>
    : never,
  DeclaredRouteResponsesFor<Options>
>;

export type RouteResponsesFor<Options, Result> = Options extends {
  readonly responses?: infer Responses;
}
  ? Responses extends ResponseSchemaMap
    ? InferResponseSchemas<Responses>
    : {
        200: Awaited<Result>;
      }
  : {
      200: Awaited<Result>;
    };

declare const routeRefBrand: unique symbol;

export interface RouteRef<
  Method extends HttpMethod,
  Path extends string,
  Request extends RouteRequestContract<unknown, unknown, unknown> =
    RouteRequestContract<InferPathParams<Path>>,
  Responses extends RouteResponses = RouteResponses,
> {
  readonly method: Method;

  readonly path: Path;

  readonly [routeRefBrand]: {
    readonly request: Request;

    readonly responses: Responses;
  };
}

export type AnyRouteRef = RouteRef<
  HttpMethod,
  string,
  RouteRequestContract<unknown, unknown, unknown>,
  RouteResponses
>;

export type RouteContractOf<Route> =
  Route extends RouteRef<
    infer Method,
    infer Path,
    infer Request,
    infer Responses
  >
    ? {
        method: Method;

        path: Path;

        request: Request;

        responses: Responses;
      }
    : never;
