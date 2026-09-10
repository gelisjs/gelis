import { ALL_ROUTE_METHOD } from "../http-method";

import type { Router, RuntimeRouteMatch } from "./router";

function isFetchForbiddenMethod(method: string): boolean {
  return method === "CONNECT" || method === "TRACE" || method === "TRACK";
}

export function activateAllFallback(router: Router): void {
  if (Object.prototype.hasOwnProperty.call(router, "match")) {
    return;
  }

  const exactMatch = router.match.bind(router);

  Object.defineProperty(router, "match", {
    configurable: true,

    writable: true,

    value: (
      method: string,

      pathname: string,
    ): RuntimeRouteMatch | undefined => {
      const exact = exactMatch(method, pathname);

      if (exact !== undefined) {
        return exact;
      }

      /*
       * Fetch forbids CONNECT / TRACE / TRACK and Gelis route registration
       * rejects them. They therefore cannot be legitimate wire-dispatch
       * targets and must not enter the ALL fallback.
       *
       * P11 application HTTP capabilities use CONNECT internally as a
       * side-effect-free method-topology probe against the bare router path.
       */
      if (isFetchForbiddenMethod(method)) {
        return undefined;
      }

      return exactMatch(ALL_ROUTE_METHOD, pathname);
    },
  });
}
