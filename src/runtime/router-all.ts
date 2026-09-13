import { ALL_ROUTE_METHOD } from "../http-method";

import type { Router, RuntimeRouteMatch } from "./router";

export function activateAllFallback(router: Router): void {
  if (!Object.prototype.hasOwnProperty.call(router, "match")) {
    const exactMatch = router.match.bind(router);

    Object.defineProperty(router, "match", {
      configurable: true,

      writable: true,

      value: (
        method: string,

        pathname: string,
      ): RuntimeRouteMatch | undefined => {
        const exact = exactMatch(method, pathname);

        if (exact !== undefined || method === ALL_ROUTE_METHOD) {
          return exact;
        }

        return exactMatch(ALL_ROUTE_METHOD, pathname);
      },
    });
  }

  if (!Object.prototype.hasOwnProperty.call(router, "matchRequestUrl")) {
    const exactMatchRequestUrl = router.matchRequestUrl.bind(router);

    Object.defineProperty(router, "matchRequestUrl", {
      configurable: true,

      writable: true,

      value: (
        method: string,

        url: string,
      ): RuntimeRouteMatch | undefined => {
        const exact = exactMatchRequestUrl(method, url);

        if (exact !== undefined || method === ALL_ROUTE_METHOD) {
          return exact;
        }

        return exactMatchRequestUrl(ALL_ROUTE_METHOD, url);
      },
    });
  }
}
