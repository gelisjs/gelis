import { RouteBuilder } from "./route-builder";

import type { AnyRouteRef, RouteContractOf } from "./route";

import type { ValidRoutePath } from "./types/path";

export type ModuleRoutes = Readonly<Record<string, AnyRouteRef>>;

export interface ModuleRef<Prefix extends string, Routes extends ModuleRoutes> {
  readonly prefix: Prefix;
  readonly routes: Routes;
}

export type ModuleContractOf<Module> =
  Module extends ModuleRef<infer Prefix, infer Routes>
    ? {
        prefix: Prefix;

        routes: {
          -readonly [Name in keyof Routes]: RouteContractOf<Routes[Name]>;
        };
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

  return {
    prefix,
    routes: define(route),
  };
}
