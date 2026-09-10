import { Gelis } from "../../src";

import type {
  ApplicationScopeBuilder,
  HttpMethod,
  ModuleRequestScopeBuilder,
  ModuleRouteBuilder,
  ModuleScopeBuilder,
  PluginRouteBuilder,
  RequestScopeBuilder,
  RouteContractOf,
  StandardSchemaV1,
} from "../../src";

import type { Equal, Expect } from "./assert";

type FrozenHttpMethod =
  "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD" | "QUERY";

type HttpMethodShape = Expect<Equal<HttpMethod, FrozenHttpMethod>>;

type HasQuery<T> = "query" extends keyof T ? true : false;

type ApplicationScopeHasQuery = Expect<
  Equal<HasQuery<ApplicationScopeBuilder<{ readonly db: true }>>, true>
>;

type RequestScopeHasQuery = Expect<
  Equal<HasQuery<RequestScopeBuilder<{ readonly userId: string }>>, true>
>;

type ModuleRouteHasQuery = Expect<
  Equal<HasQuery<ModuleRouteBuilder<"/module">>, true>
>;

type ModuleScopeHasQuery = Expect<
  Equal<HasQuery<ModuleScopeBuilder<{ readonly db: true }, "/module">>, true>
>;

type ModuleRequestScopeHasQuery = Expect<
  Equal<
    HasQuery<
      ModuleRequestScopeBuilder<never, { readonly userId: string }, "/module">
    >,
    true
  >
>;

type PluginRouteHasQuery = Expect<Equal<HasQuery<PluginRouteBuilder>, true>>;

declare const Body: StandardSchemaV1<
  {
    term: string;
  },
  {
    term: string;
  }
>;

const app = new Gelis();

const queryRoute = app.query(
  "/query/:id",

  {
    body: Body,
  },

  ({ params, body }) => {
    const id: string = params.id;

    const term: string = body.term;

    void id;

    return term;
  },
);

const genericQueryRoute = app.route(
  "QUERY",

  "/generic-query",

  () => "ok" as const,
);

type QueryMethod = Expect<
  Equal<RouteContractOf<typeof queryRoute>["method"], "QUERY">
>;

type QueryBody = Expect<
  Equal<
    RouteContractOf<typeof queryRoute>["request"]["body"],
    {
      term: string;
    }
  >
>;

type GenericQueryMethod = Expect<
  Equal<RouteContractOf<typeof genericQueryRoute>["method"], "QUERY">
>;

export type {
  ApplicationScopeHasQuery,
  GenericQueryMethod,
  HttpMethodShape,
  ModuleRequestScopeHasQuery,
  ModuleRouteHasQuery,
  ModuleScopeHasQuery,
  PluginRouteHasQuery,
  QueryBody,
  QueryMethod,
  RequestScopeHasQuery,
};
