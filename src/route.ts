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

export interface RouteContext<
  Path extends string,
  Query = never,
  Body = never,
> {
  params: InferPathParams<Path>;

  query: Query;

  body: Body;
}

export type RouteHandler<
  Path extends string,
  Query = never,
  Body = never,
  Result = unknown,
> = (context: RouteContext<Path, Query, Body>) => Result;

type SchemaInput<Schema> = Schema extends StandardSchemaV1
  ? StandardSchemaV1.InferInput<Schema>
  : never;

type SchemaOutput<Schema> = Schema extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<Schema>
  : never;

export type RouteRequestFor<
  Path extends string,
  Options extends RouteOptions,
> = RouteRequestContract<
  InferPathParams<Path>,
  Options extends {
    readonly query: infer Query;
  }
    ? SchemaInput<Query>
    : never,
  Options extends {
    readonly body: infer Body;
  }
    ? SchemaInput<Body>
    : never
>;

export type RouteHandlerContextFor<
  Path extends string,
  Options extends RouteOptions,
> = RouteContext<
  Path,
  Options extends {
    readonly query: infer Query;
  }
    ? SchemaOutput<Query>
    : never,
  Options extends {
    readonly body: infer Body;
  }
    ? SchemaOutput<Body>
    : never
>;

export type InferResponseSchemas<Schemas extends ResponseSchemaMap> = {
  -readonly [Status in keyof Schemas]: SchemaOutput<Schemas[Status]>;
};

export type RouteResponsesFor<
  Options extends RouteOptions,
  Result,
> = Options extends {
  readonly responses: infer Responses extends ResponseSchemaMap;
}
  ? InferResponseSchemas<Responses>
  : {
      200: Awaited<Result>;
    };

export interface RouteRef<
  Method extends HttpMethod,
  Path extends string,
  Request extends RouteRequestContract = RouteRequestContract<
    InferPathParams<Path>
  >,
  Responses extends RouteResponses = RouteResponses,
> {
  readonly method: Method;

  readonly path: Path;

  readonly "~gelis"?: {
    readonly request: Request;

    readonly responses: Responses;
  };
}

export type RouteContractOf<Route> = Route extends {
  readonly method: infer Method;

  readonly path: infer Path;

  readonly "~gelis"?: {
    readonly request: infer Request;

    readonly responses: infer Responses;
  };
}
  ? {
      method: Method;

      path: Path;

      request: Request;

      responses: Responses;
    }
  : never;
