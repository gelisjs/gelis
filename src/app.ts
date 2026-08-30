import { RouteBuilder } from "./route-builder";

import type { ModuleRef, ModuleRoutes } from "./module";

export class Gelis extends RouteBuilder<""> {
  constructor() {
    super("");
  }

  mount<const Prefix extends string, const Routes extends ModuleRoutes>(
    module: ModuleRef<Prefix, Routes>,
  ): void {
    void module;
  }
}
