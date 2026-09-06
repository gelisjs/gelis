import { Gelis } from "../../src";

import type { RouteContractOf } from "../../src";

import type { Equal, Expect } from "./assert";

const app = new Gelis();

type RootBefore = typeof app;

const routes = app.requestContext(
  ({ request }) =>
    ({
      user: {
        id: request.method,
      },

      tenant: "primary",
    }) as const,
);

const userRoute = routes.get(
  "/users/:id",

  (
    { params },

    scope,
  ) => {
    type ParamId = Expect<Equal<typeof params.id, string>>;

    type Tenant = Expect<Equal<typeof scope.tenant, "primary">>;

    type UserId = Expect<Equal<typeof scope.user.id, string>>;

    void (null as unknown as ParamId);

    void (null as unknown as Tenant);

    void (null as unknown as UserId);

    // @ts-expect-error unknown request-scope property.
    void scope.cache;

    return {
      id: params.id,

      tenant: scope.tenant,
    };
  },

  {
    beforeHandle(_context, scope) {
      const tenant: "primary" = scope.tenant;

      void tenant;
    },

    afterHandle(_context, result, scope) {
      const id: string = result.id;

      const tenant: "primary" = scope.tenant;

      void id;
      void tenant;
    },
  },
);

const asyncRoutes = app.requestContext(async () => ({
  authenticated: true as const,
}));

asyncRoutes.get(
  "/async",

  (_context, scope) => {
    const authenticated: true = scope.authenticated;

    return authenticated;
  },
);

type RootAfter = typeof app;

type StableRoot = Expect<Equal<RootBefore, RootAfter>>;

type UserContract = RouteContractOf<typeof userRoute>;

type UserMethod = Expect<Equal<UserContract["method"], "GET">>;

type UserParams = Expect<
  Equal<
    UserContract["request"]["params"],
    {
      id: string;
    }
  >
>;

// @ts-expect-error invalid Gelis route path.
routes.get("users", () => null);

export type { StableRoot, UserMethod, UserParams };
