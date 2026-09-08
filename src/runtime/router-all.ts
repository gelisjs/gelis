import { ALL_ROUTE_METHOD } from "../http-method";

import type { Router, RuntimeRouteMatch } from "./router";

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

      return exactMatch(ALL_ROUTE_METHOD, pathname);
    },
  });
}
