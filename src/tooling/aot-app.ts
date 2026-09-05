import { GELIS_INTERNAL_RUNTIME, Gelis } from "../app";

import type { GelisInternalRouter } from "../app";

import { hydrateRouterSnapshot } from "../runtime/router-snapshot";

import type { RouterSnapshot } from "../runtime/router-snapshot";

import type { RuntimeRouteMatch } from "../runtime/router";

import type { RuntimeRouteRecord } from "../runtime/types";

export interface AotAppSession {
  readonly app: Gelis;

  collectRoutes(): readonly RuntimeRouteRecord[];

  hydrate(snapshot: RouterSnapshot): Gelis;
}

/*
 * Collect runtime route records without performing
 * any routing grammar or placement work.
 *
 * This intentionally does not extend Router:
 * the AOT collection path does not need Router's
 * Map allocation or registration machinery.
 */
class CollectOnlyRouter implements GelisInternalRouter {
  readonly routes: RuntimeRouteRecord[] = [];

  register(route: RuntimeRouteRecord): void {
    this.routes.push(route);
  }

  match(
    _method: string,

    _pathname: string,
  ): RuntimeRouteMatch | undefined {
    throw new Error("Gelis AOT application was used before router hydration");
  }
}

export function createAotAppSession(): AotAppSession {
  const app = new Gelis();

  const control = app[GELIS_INTERNAL_RUNTIME]();

  const collector = new CollectOnlyRouter();

  control.installRouter(collector);

  return {
    app,

    collectRoutes(): readonly RuntimeRouteRecord[] {
      return collector.routes;
    },

    hydrate(snapshot: RouterSnapshot): Gelis {
      const router = hydrateRouterSnapshot(snapshot, collector.routes);

      control.installRouter(router);

      return app;
    },
  };
}
