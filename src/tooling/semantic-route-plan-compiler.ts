import { RUNTIME_ROUTE_PLAIN } from "../runtime/types";

import type {
  SemanticRoutePlan,
  SemanticRoutePlanEntry,
} from "../runtime/semantic-route-plan";

import { SEMANTIC_ROUTE_PLAN_VERSION } from "../runtime/semantic-route-plan";

import { compileRouterSnapshot } from "./router-snapshot-compiler";

import type { RouterSnapshotRoute } from "./router-snapshot-compiler";

const TEXT_ENCODER = new TextEncoder();

export async function compileSemanticRoutePlan(
  routes: readonly RouterSnapshotRoute[],
): Promise<SemanticRoutePlan> {
  const entries = new Array<SemanticRoutePlanEntry>(routes.length);

  for (let index = 0; index < routes.length; index++) {
    const route = routes[index];

    if (route === undefined) {
      throw new Error("Missing Gelis semantic route");
    }

    entries[index] = {
      method: route.method,

      path: route.path,

      flags: RUNTIME_ROUTE_PLAIN,
    };
  }

  const [router, shapeFingerprint] = await Promise.all([
    Promise.resolve(compileRouterSnapshot(routes)),

    createRouteShapeFingerprint(routes),
  ]);

  return {
    version: SEMANTIC_ROUTE_PLAN_VERSION,

    routeCount: routes.length,

    shapeFingerprint,

    routes: entries,

    router,
  };
}

async function createRouteShapeFingerprint(
  routes: readonly RouterSnapshotRoute[],
): Promise<string> {
  /*
   * Length-prefix every value instead of using
   * a separator. This makes the canonical form
   * unambiguous even if future paths contain
   * unusual characters.
   *
   * Registration order is intentionally part
   * of the fingerprint because RouterSnapshot
   * binds route indexes by order.
   */
  let canonical = "";

  for (let index = 0; index < routes.length; index++) {
    const route = routes[index];

    if (route === undefined) {
      throw new Error("Missing Gelis semantic route");
    }

    canonical += encodePart(route.method) + encodePart(route.path);
  }

  const bytes = TEXT_ENCODER.encode(canonical);

  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return toHex(new Uint8Array(digest));
}

function encodePart(value: string): string {
  return `${value.length}:` + value;
}

function toHex(bytes: Uint8Array): string {
  let result = "";

  for (const byte of bytes) {
    result += byte.toString(16).padStart(2, "0");
  }

  return result;
}
