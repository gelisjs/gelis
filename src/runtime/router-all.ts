import { ALL_ROUTE_METHOD } from "../http-method";

import { Router, type RuntimeRouteMatch } from "./router";

const exactMatchRequestUrl = Router.prototype.matchRequestUrl;

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

        if (exact !== undefined) {
          return exact;
        }

        return exactMatch(ALL_ROUTE_METHOD, pathname);
      },
    });
  }

  if (!Object.prototype.hasOwnProperty.call(router, "matchRequestUrl")) {
    Object.defineProperty(router, "matchRequestUrl", {
      configurable: true,

      writable: true,

      value: (
        method: string,

        url: string,
      ): RuntimeRouteMatch | undefined => {
        const exact = exactMatchRequestUrl.call(router, method, url);

        if (exact !== undefined) {
          return exact;
        }

        return exactMatchRequestUrl.call(router, ALL_ROUTE_METHOD, url);
      },
    });
  }
}
