import { Gelis } from "../../src";

import type { RouteContractOf, StandardSchemaV1 } from "../../src";

import type { Equal, Expect } from "./assert";

declare const Query: StandardSchemaV1<
  Record<string, string | string[]>,
  {
    page: number;
  }
>;

declare const Body: StandardSchemaV1<
  {
    name: string;
  },
  {
    name: string;
    normalized: true;
  }
>;

declare const Output: StandardSchemaV1<
  {
    name: string;
  },
  {
    name: string;
    serialized: true;
  }
>;

const app = new Gelis();

type RootBefore = typeof app;

const routes = app.requestScope(({ request, params, query, body }) => {
  type DeriveRequest = Expect<Equal<typeof request, Request>>;

  type DeriveParams = Expect<Equal<typeof params, Record<string, string>>>;

  type DeriveQuery = Expect<Equal<typeof query, unknown>>;

  type DeriveBody = Expect<Equal<typeof body, unknown>>;

  void (null as unknown as DeriveRequest);
  void (null as unknown as DeriveParams);
  void (null as unknown as DeriveQuery);
  void (null as unknown as DeriveBody);

  return {
    user: {
      id: request.method,
    },

    tenant: "primary",
  } as const;
});

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

const validatedRoute = routes.post(
  "/validated/:id",

  {
    query: Query,

    body: Body,

    responses: {
      200: {
        schema: Output,

        validate: true,
      },
    },
  },

  (
    { params, query, body, reply },

    scope,
  ) => {
    type ParamId = Expect<Equal<typeof params.id, string>>;

    type QueryOutput = Expect<
      Equal<
        typeof query,
        {
          page: number;
        }
      >
    >;

    type BodyOutput = Expect<
      Equal<
        typeof body,
        {
          name: string;
          normalized: true;
        }
      >
    >;

    type ScopeTenant = Expect<Equal<typeof scope.tenant, "primary">>;

    void (null as unknown as ParamId);
    void (null as unknown as QueryOutput);
    void (null as unknown as BodyOutput);
    void (null as unknown as ScopeTenant);

    if (query.page === 0) {
      return reply.status(
        200,

        {
          name: body.name,
        },
      );
    }

    return {
      name: `${scope.tenant}:${body.name}`,
    };
  },

  {
    beforeHandle(
      { query, body },

      scope,
    ) {
      const page: number = query.page;

      const normalized: true = body.normalized;

      const tenant: "primary" = scope.tenant;

      void page;
      void normalized;
      void tenant;
    },

    afterHandle(_context, result, scope) {
      /*
       * Explicit response contracts intentionally expose
       * the complete raw producer-result union here,
       * including reply.status(...) and raw Response.
       */
      type ResultIsNotWireOutput = Expect<
        Equal<
          typeof result extends {
            serialized: true;
          }
            ? true
            : false,
          false
        >
      >;

      const tenant: "primary" = scope.tenant;

      void (null as unknown as ResultIsNotWireOutput);
      void tenant;
      void result;
    },
  },
);

const genericRoute = routes.route(
  "PATCH",
  "/generic/:slug",

  (
    { params },

    scope,
  ) => ({
    slug: params.slug,

    tenant: scope.tenant,
  }),
);

const postMethod = routes.post("/method-post", () => null);

const putMethod = routes.put("/method-put", () => null);

const patchMethod = routes.patch("/method-patch", () => null);

const deleteMethod = routes.delete("/method-delete", () => null);

const optionsMethod = routes.options("/method-options", () => null);

const headMethod = routes.head("/method-head", () => new Response(null));

const asyncRoutes = app.requestScope(async () => ({
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

type UserResponse = Expect<
  Equal<
    UserContract["responses"],
    {
      200: {
        id: string;
        tenant: "primary";
      };
    }
  >
>;

type ValidatedContract = RouteContractOf<typeof validatedRoute>;

type ValidatedMethod = Expect<Equal<ValidatedContract["method"], "POST">>;

type ValidatedParams = Expect<
  Equal<
    ValidatedContract["request"]["params"],
    {
      id: string;
    }
  >
>;

type ValidatedQueryInput = Expect<
  Equal<
    ValidatedContract["request"]["query"],
    Record<string, string | string[]>
  >
>;

type ValidatedBodyInput = Expect<
  Equal<
    ValidatedContract["request"]["body"],
    {
      name: string;
    }
  >
>;

type ValidatedWireResponse = Expect<
  Equal<
    ValidatedContract["responses"],
    {
      200: {
        name: string;
        serialized: true;
      };
    }
  >
>;

type GenericContract = RouteContractOf<typeof genericRoute>;

type GenericMethod = Expect<Equal<GenericContract["method"], "PATCH">>;

type GenericPath = Expect<Equal<GenericContract["path"], "/generic/:slug">>;

type PostMethod = Expect<
  Equal<RouteContractOf<typeof postMethod>["method"], "POST">
>;

type PutMethod = Expect<
  Equal<RouteContractOf<typeof putMethod>["method"], "PUT">
>;

type PatchMethod = Expect<
  Equal<RouteContractOf<typeof patchMethod>["method"], "PATCH">
>;

type DeleteMethod = Expect<
  Equal<RouteContractOf<typeof deleteMethod>["method"], "DELETE">
>;

type OptionsMethod = Expect<
  Equal<RouteContractOf<typeof optionsMethod>["method"], "OPTIONS">
>;

type HeadMethod = Expect<
  Equal<RouteContractOf<typeof headMethod>["method"], "HEAD">
>;

// @ts-expect-error invalid Gelis route path.
routes.get("users", () => null);

routes.get(
  "/wrong-query-output",

  {
    query: Query,
  },

  ({ query }) => {
    // @ts-expect-error query is the transformed schema output inside the handler.
    const raw: Record<string, string | string[]> = query;

    return raw;
  },
);

routes.get(
  "/wrong-response",

  {
    responses: {
      200: {
        schema: Output,

        validate: true,
      },
    },
  },

  // @ts-expect-error response producer must match the response schema input.
  () => ({
    serialized: true as const,
  }),
);

export type {
  DeleteMethod,
  GenericMethod,
  GenericPath,
  HeadMethod,
  OptionsMethod,
  PatchMethod,
  PostMethod,
  PutMethod,
  StableRoot,
  UserMethod,
  UserParams,
  UserResponse,
  ValidatedBodyInput,
  ValidatedMethod,
  ValidatedParams,
  ValidatedQueryInput,
  ValidatedWireResponse,
};
