import type { HttpMethod } from "../route";

import { RUNTIME_ROUTE_PLAIN } from "./types";

import type { RuntimeRouteHandler, RuntimeRouteRecord } from "./types";

import type { RouterSnapshot } from "./router-snapshot";

export const SEMANTIC_ROUTE_PLAN_VERSION = 1 as const;

export interface SemanticRoutePlan {
  readonly version: typeof SEMANTIC_ROUTE_PLAN_VERSION;

  readonly routeCount: number;

  /*
   * SHA-256 of the ordered route shape:
   *
   * method + path + order
   *
   * Runtime bindings carry an independently
   * generated copy of this fingerprint.
   */
  readonly shapeFingerprint: string;

  readonly routes: readonly SemanticRoutePlanEntry[];

  readonly router: RouterSnapshot;
}

export interface SemanticRoutePlanEntry {
  readonly method: HttpMethod;

  readonly path: string;

  /*
   * v0.1 intentionally supports only completely
   * plain routes.
   *
   * Keep the field in the serialized IR so the
   * format can grow toward input/lifecycle/response
   * feature shapes later without redesigning the
   * route entry itself.
   */
  readonly flags: typeof RUNTIME_ROUTE_PLAIN;
}

export interface SemanticRouteBindings {
  readonly version: typeof SEMANTIC_ROUTE_PLAN_VERSION;

  /*
   * This must come from the generated runtime
   * binding artifact, not copied from the plan
   * dynamically at server startup.
   */
  readonly shapeFingerprint: string;

  readonly handlers: readonly RuntimeRouteHandler[];
}

export function bindSemanticRoutePlan(
  plan: SemanticRoutePlan,

  bindings: SemanticRouteBindings,
): RuntimeRouteRecord[] {
  if (plan.version !== SEMANTIC_ROUTE_PLAN_VERSION) {
    throw new Error("Unsupported Gelis semantic route plan version");
  }

  if (bindings.version !== SEMANTIC_ROUTE_PLAN_VERSION) {
    throw new Error("Unsupported Gelis semantic route binding version");
  }

  if (plan.shapeFingerprint !== bindings.shapeFingerprint) {
    throw new Error("Gelis semantic route plan fingerprint mismatch");
  }

  if (
    plan.routeCount !== plan.routes.length ||
    plan.routeCount !== bindings.handlers.length
  ) {
    throw new Error("Gelis semantic route plan route count mismatch");
  }

  const routes = new Array<RuntimeRouteRecord>(plan.routeCount);

  for (let index = 0; index < plan.routeCount; index++) {
    const entry = plan.routes[index];

    const handler = bindings.handlers[index];

    if (entry === undefined || handler === undefined) {
      throw new Error(`Missing Gelis semantic route binding: ${index}`);
    }

    if (entry.flags !== RUNTIME_ROUTE_PLAIN) {
      throw new Error(`Unsupported Gelis semantic route flags: ${entry.flags}`);
    }

    routes[index] = {
      method: entry.method,

      path: entry.path,

      handler,

      flags: RUNTIME_ROUTE_PLAIN,

      input: undefined,

      beforeHandle: undefined,

      afterHandle: undefined,

      responses: undefined,
    };
  }

  return routes;
}
