import { Gelis, defineModule, definePlugin } from "../../src";

import type { HttpMethod, RouteContractOf } from "../../src";

import type { Equal, Expect } from "./assert";

type FrozenHttpMethod =
  "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD" | "QUERY";

type HttpMethodRemainsFirstClassOnly = Expect<
  Equal<HttpMethod, FrozenHttpMethod>
>;

const app = new Gelis();

const purge = app.route("PURGE", "/cache", () => "ok" as const);

const mixed = app.route("MiXeD-Gelis", "/mixed", () => "ok" as const);

const wireAll = app.route("ALL", "/wire-all", () => "ok" as const);

declare const dynamicMethod: string;

app.route(dynamicMethod, "/dynamic", () => "ok" as const);

/*
 * Composition surfaces must accept the same generic
 * custom-method contract as the root builder.
 */
app
  .scope({
    marker: "application",
  })
  .route("PURGE", "/application-scope", (_context, scope) => scope.marker);

app
  .requestScope(() => ({
    marker: "request",
  }))
  .route("PURGE", "/request-scope", (_context, scope) => scope.marker);

const staticModule = defineModule(
  "/static-module",

  (routes) => ({
    purge: routes.route("PURGE", "/cache", () => "static" as const),
  }),
);

const scopedModule = defineModule(
  "/scoped-module",

  () => ({
    marker: "module",
  }),

  (routes) => ({
    purge: routes.route("PURGE", "/cache", (_context, scope) => scope.marker),
  }),
);

const requestScopeModule = defineModule(
  "/request-module",

  (routes) => {
    const requestScope = routes.requestScope(() => ({
      marker: "module-request",
    }));

    return {
      purge: requestScope.route(
        "PURGE",
        "/cache",
        (_context, scope) => scope.marker,
      ),
    };
  },
);

app.mount(staticModule);
app.mount(scopedModule);
app.mount(requestScopeModule);

app.use(
  definePlugin(
    "custom-http-method-type-surface",

    (setup) => {
      setup.routes.route("PURGE", "/plugin-cache", () => "plugin" as const);
    },
  ),
);

type PurgeMethod = Expect<
  Equal<RouteContractOf<typeof purge>["method"], "PURGE">
>;

type MixedMethod = Expect<
  Equal<RouteContractOf<typeof mixed>["method"], "MiXeD-Gelis">
>;

type WireAllMethod = Expect<
  Equal<RouteContractOf<typeof wireAll>["method"], "ALL">
>;

// @ts-expect-error empty methods are not valid HTTP tokens
app.route("", "/invalid-empty", () => "no");

// @ts-expect-error * is reserved for app.all()
app.route("*", "/reserved", () => "no");

// @ts-expect-error Fetch forbids CONNECT
app.route("CONNECT", "/connect", () => "no");

// @ts-expect-error Fetch forbids TRACE case-insensitively
app.route("trace", "/trace", () => "no");

// @ts-expect-error invalid token whitespace
app.route("BAD METHOD", "/space", () => "no");

// @ts-expect-error GET-family methods must use canonical Fetch casing
app.route("get", "/lower-get", () => "no");

export type {
  HttpMethodRemainsFirstClassOnly,
  MixedMethod,
  PurgeMethod,
  WireAllMethod,
};
