import { GELIS_INTERNAL_RUNTIME, type Gelis } from "../app";

import {
  bindSemanticRoutePlan,
  SEMANTIC_ROUTE_PLAN_VERSION,
} from "./semantic-route-plan";

import type {
  SemanticRouteBindings,
  SemanticRoutePlan,
} from "./semantic-route-plan";

import { hydrateRouterSnapshot } from "./router-snapshot";

import type { RuntimeRouteHandler } from "./types";

export interface AotRuntimeBinding {
  readonly version: typeof SEMANTIC_ROUTE_PLAN_VERSION;

  readonly shapeFingerprint: string;

  readonly handlers: readonly RuntimeRouteHandler[];
}

/*
 * Install a precomputed plain-route runtime into
 * an otherwise normally constructed Gelis instance.
 *
 * This is intentionally the semantic runtime boundary.
 * Artifact transport and serialization formats must
 * remain outside this function.
 */
export function installAotRuntime(
  app: Gelis,

  plan: SemanticRoutePlan,

  binding: AotRuntimeBinding,
): void {
  const semanticBinding: SemanticRouteBindings = {
    version: binding.version,

    shapeFingerprint: binding.shapeFingerprint,

    handlers: binding.handlers,
  };

  const routes = bindSemanticRoutePlan(
    plan,

    semanticBinding,
  );

  const router = hydrateRouterSnapshot(
    plan.router,

    routes,
  );

  const control = app[GELIS_INTERNAL_RUNTIME]();

  control.installPrebuiltRuntime(
    router,

    routes,
  );
}
