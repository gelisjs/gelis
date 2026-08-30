import { RouteBuilder } from "./route-builder";

import type { AnyRouteRef, RouteContractOf } from "./route";

import type { ValidRoutePath } from "./types/path";

export type ModuleRoutes = Readonly<Record<string, AnyRouteRef>>;

type AnyModulePublicRoutes = Readonly<Record<string, unknown>>;

type ModulePublicRoutes<Routes extends ModuleRoutes> = {
  -readonly [Name in keyof Routes]: RouteContractOf<Routes[Name]>;
};

declare const moduleRefBrand: unique symbol;

interface ModuleRefInternal<
  Prefix extends string,
  Routes extends ModuleRoutes,
  PublicRoutes extends AnyModulePublicRoutes,
> {
  readonly prefix: Prefix;
  readonly routes: Routes;

  readonly [moduleRefBrand]: {
    readonly publicRoutes: PublicRoutes;
  };
}

export type ModuleRef<
  Prefix extends string,
  Routes extends ModuleRoutes,
> = ModuleRefInternal<Prefix, Routes, ModulePublicRoutes<Routes>>;

export type AnyModuleRef = ModuleRefInternal<
  string,
  ModuleRoutes,
  AnyModulePublicRoutes
>;

export type ModulePublicContractOf<Module> =
  Module extends ModuleRefInternal<string, ModuleRoutes, infer PublicRoutes>
    ? PublicRoutes
    : never;

export type ModuleContractOf<Module> =
  Module extends ModuleRefInternal<
    infer Prefix,
    ModuleRoutes,
    infer PublicRoutes
  >
    ? {
        prefix: Prefix;
        routes: PublicRoutes;
      }
    : never;

export function defineModule<
  const Prefix extends string,
  const Routes extends ModuleRoutes,
>(
  prefix: Prefix & ValidRoutePath<Prefix>,

  define: (route: RouteBuilder<Prefix>) => Routes,
): ModuleRef<Prefix, Routes> {
  const route = new RouteBuilder(prefix);

  const routes = define(route);

  // The brand is type-only.
  // Runtime modules intentionally stay compact.
  return {
    prefix,
    routes,
  } as unknown as ModuleRef<Prefix, Routes>;
}
