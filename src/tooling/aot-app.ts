import { GELIS_INTERNAL_RUNTIME, Gelis } from "../app";

import { Router } from "../runtime/router";

import { hydrateRouterSnapshot } from "../runtime/router-snapshot";

import type { RouterSnapshot } from "../runtime/router-snapshot";

import type { RuntimeRouteMatch } from "../runtime/router";

import type { RuntimeRouteRecord } from "../runtime/types";

export interface AotAppSession {
  readonly app: Gelis;

  collectRoutes(): RuntimeRouteRecord[];

  hydrate(snapshot: RouterSnapshot): Gelis;
}

/*
 * RouteBuilder and Gelis still perform all normal
 * runtime-plan construction.
 *
 * Only router grammar/placement work is skipped.
 */
class CollectOnlyRouter extends Router {
  override register(_route: RuntimeRouteRecord): void {
    /*
     * Intentionally empty.
     *
     * Duplicate/path-placement validation occurs
     * when the RouterSnapshot is compiled.
     */
  }

  override match(
    _method: string,

    _pathname: string,
  ): RuntimeRouteMatch | undefined {
    throw new Error("Gelis AOT application was used before router hydration");
  }
}

export function createAotAppSession(): AotAppSession {
  const app = new Gelis();

  const control = app[GELIS_INTERNAL_RUNTIME]();

  control.installRouter(new CollectOnlyRouter());

  return {
    app,

    collectRoutes(): RuntimeRouteRecord[] {
      return control.collectRoutes();
    },

    hydrate(snapshot: RouterSnapshot): Gelis {
      const routes = control.collectRoutes();

      const router = hydrateRouterSnapshot(snapshot, routes);

      control.installRouter(router);

      return app;
    },
  };
}
