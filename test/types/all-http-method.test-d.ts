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
} from "../../src";

import type { Equal, Expect } from "./assert";

type AllIsNotAFirstClassWireMethod = Expect<
  Equal<"*" extends HttpMethod ? true : false, false>
>;

type HasAll<T> = "all" extends keyof T ? true : false;

type ApplicationScopeHasAll = Expect<
  Equal<HasAll<ApplicationScopeBuilder<{ readonly db: true }>>, true>
>;

type RequestScopeHasAll = Expect<
  Equal<HasAll<RequestScopeBuilder<{ readonly userId: string }>>, true>
>;

type ModuleRouteHasAll = Expect<
  Equal<HasAll<ModuleRouteBuilder<"/module">>, true>
>;

type ModuleScopeHasAll = Expect<
  Equal<HasAll<ModuleScopeBuilder<{ readonly db: true }, "/module">>, true>
>;

type ModuleRequestScopeHasAll = Expect<
  Equal<
    HasAll<
      ModuleRequestScopeBuilder<never, { readonly userId: string }, "/module">
    >,
    true
  >
>;

type PluginRouteHasAll = Expect<Equal<HasAll<PluginRouteBuilder>, true>>;

const app = new Gelis();

const allRoute = app.all("/fallback/:id", ({ params }) => params.id);

type AllRouteMethod = Expect<
  Equal<RouteContractOf<typeof allRoute>["method"], "*">
>;

/*
 * "*" remains reserved for all(); generic route()
 * must not become a second entry point for the pseudo-method.
 */
// @ts-expect-error * is reserved for app.all()
app.route("*", "/reserved", () => "no");

export type {
  AllIsNotAFirstClassWireMethod,
  AllRouteMethod,
  ApplicationScopeHasAll,
  ModuleRequestScopeHasAll,
  ModuleRouteHasAll,
  ModuleScopeHasAll,
  PluginRouteHasAll,
  RequestScopeHasAll,
};
