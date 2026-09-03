import type { StandardSchemaV1 } from "./schema";

import type { OpenAPIRouteMetadata } from "./openapi";

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

/*
 * A schema/descriptor response entry always represents
 * a body-bearing response.
 *
 * `{}` includes every non-nullish JavaScript value,
 * while `| null` explicitly keeps JSON null valid.
 *
 * The resulting type therefore excludes top-level
 * `undefined` and `void` without recursive type logic.
 */
type ResponseBodyOutput = {} | null;

type BodyBearingSchema = StandardSchemaV1<unknown, ResponseBodyOutput>;

type ValidatedAutoResponse = {
  readonly schema: BodyBearingSchema;

  readonly validate: true;

  readonly serialize?: never;

  readonly contentType?: never;
};

type JsonResponse = {
  readonly schema: BodyBearingSchema;

  readonly serialize: "json";

  readonly validate?: true;

  readonly contentType?: string;
};

type TextResponse = {
  readonly schema: StandardSchemaV1<unknown, string>;

  readonly serialize: "text";

  readonly validate?: true;

  readonly contentType?: string;
};

export type ResponseDescriptor =
  | ValidatedAutoResponse
  | JsonResponse
  | TextResponse;

export type ResponseContract =
  | BodyBearingSchema
  | ResponseDescriptor
  | undefined;

export type ResponseContractMap = Readonly<
  Record<number, ResponseContract> & {
    readonly 204?: undefined;

    readonly 205?: undefined;

    readonly 304?: undefined;
  }
>;

export interface RouteOptions {
  readonly query?: StandardSchemaV1;

  readonly body?: StandardSchemaV1;

  readonly responses?: ResponseContractMap;

  readonly openapi?: OpenAPIRouteMetadata | false;
}

type SchemaInput<Schema> = Schema extends StandardSchemaV1
  ? StandardSchemaV1.InferInput<Schema>
  : never;

type SchemaOutput<Schema> = Schema extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<Schema>
  : never;

type ResponseSchema<Entry> = Entry extends StandardSchemaV1
  ? Entry
  : Entry extends {
        readonly schema: infer Schema;
      }
    ? Schema extends StandardSchemaV1
      ? Schema
      : never
    : never;

type ResponseWireBody<Entry> = [Entry] extends [undefined]
  ? undefined
  : SchemaOutput<ResponseSchema<Entry>>;

type ResponseProducerBody<Entry> = Entry extends {
  readonly schema: infer Schema;
  readonly validate: true;
}
  ? SchemaInput<Schema>
  : ResponseWireBody<Entry>;

export type InferResponseContracts<Responses extends ResponseContractMap> = {
  -readonly [Status in keyof Responses]: ResponseWireBody<Responses[Status]>;
};

type InferResponseProducers<Responses extends ResponseContractMap> = {
  -readonly [Status in keyof Responses]: ResponseProducerBody<
    Responses[Status]
  >;
};

type DeclaredRouteWireResponsesFor<Options> = Options extends {
  readonly responses?: infer Responses;
}
  ? Responses extends ResponseContractMap
    ? InferResponseContracts<Responses>
    : Record<never, never>
  : Record<never, never>;

type DeclaredRouteProducerResponsesFor<Options> = Options extends {
  readonly responses?: infer Responses;
}
  ? Responses extends ResponseContractMap
    ? InferResponseProducers<Responses>
    : Record<never, never>
  : Record<never, never>;

type ReplyStatus<Responses extends RouteResponses> = Extract<
  keyof Responses,
  number
>;

declare const replyResultBrand: unique symbol;

interface ReplyResult<Status extends number, Body> {
  readonly status: Status;

  readonly body: Body;

  readonly [replyResultBrand]: true;
}

type ReplyBodyArguments<Body> = [Body] extends [undefined] ? [] : [body: Body];

interface Reply<Responses extends RouteResponses> {
  status<const Status extends ReplyStatus<Responses>>(
    status: Status,

    ...body: ReplyBodyArguments<Responses[Status]>
  ): ReplyResult<Status, Responses[Status]>;
}

type StatusReplyResult<Responses extends RouteResponses> = {
  [Status in ReplyStatus<Responses>]: ReplyResult<Status, Responses[Status]>;
}[ReplyStatus<Responses>];

type DirectManagedHandlerResult<Responses extends RouteResponses> =
  | (200 extends keyof Responses ? Exclude<Responses[200], undefined> : never)
  | (204 extends keyof Responses ? undefined : never);

type ManagedHandlerResult<Responses extends RouteResponses> =
  | DirectManagedHandlerResult<Responses>
  | StatusReplyResult<Responses>;

type ExplicitHandlerResolvedResult<Responses extends ResponseContractMap> =
  | ManagedHandlerResult<InferResponseProducers<Responses>>
  | Response;

export type RouteHandlerResultFor<
  Responses extends ResponseContractMap | undefined,
> = Responses extends ResponseContractMap
  ?
      | ExplicitHandlerResolvedResult<Responses>
      | PromiseLike<ExplicitHandlerResolvedResult<Responses>>
  : unknown;

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
    status(status: number, body?: unknown): unknown;
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
  Responses extends ResponseContractMap | undefined = undefined,
> = {
  readonly query?: QuerySchema;

  readonly body?: BodySchema;

  readonly responses?: Responses;

  readonly openapi?: OpenAPIRouteMetadata | false;
};

export type RouteLifecycleFor<
  Path extends string,
  QuerySchema extends StandardSchemaV1 | undefined = undefined,
  BodySchema extends StandardSchemaV1 | undefined = undefined,
  Responses extends ResponseContractMap | undefined = undefined,
  Result = unknown,
> = {
  readonly beforeHandle?: RouteBeforeHandle<
    Path,
    SchemaOutput<QuerySchema>,
    SchemaOutput<BodySchema>,
    Responses extends ResponseContractMap
      ? InferResponseContracts<Responses>
      : Record<never, never>
  >;

  readonly afterHandle?: RouteAfterHandle<
    Path,
    SchemaOutput<QuerySchema>,
    SchemaOutput<BodySchema>,
    Responses extends ResponseContractMap
      ? InferResponseContracts<Responses>
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
  DeclaredRouteProducerResponsesFor<Options>
>;

type ImplicitResolvedResult<Result> = Awaited<Result>;

type ImplicitBody<Value> = Exclude<Value, undefined | void>;

type ImplicitBodyless<Value> = Extract<Value, undefined | void>;

type InferManagedImplicitResponses<Value> = [Value] extends [never]
  ? RouteResponses
  : [ImplicitBody<Value>] extends [never]
    ? {
        204: undefined;
      }
    : [ImplicitBodyless<Value>] extends [never]
      ? {
          200: ImplicitBody<Value>;
        }
      : {
          200: ImplicitBody<Value>;
          204: undefined;
        };

export type InferImplicitResponses<Result> = [
  Extract<ImplicitResolvedResult<Result>, Response>,
] extends [never]
  ? InferManagedImplicitResponses<ImplicitResolvedResult<Result>>
  : RouteResponses;

export type RouteResponsesFor<Options, Result> = Options extends {
  readonly responses?: infer Responses;
}
  ? Responses extends ResponseContractMap
    ? InferResponseContracts<Responses>
    : InferImplicitResponses<Result>
  : InferImplicitResponses<Result>;

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
