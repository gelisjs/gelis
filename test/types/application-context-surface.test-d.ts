import { Gelis } from "../../src";

import type { RouteContractOf, StandardSchemaV1 } from "../../src";

import type { Equal, Expect } from "./assert";

declare const Query: StandardSchemaV1<
  {
    page: string;
  },
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
  }
>;

declare const Output: StandardSchemaV1<
  {
    id: string;
    database: "primary";
  },
  {
    id: string;
    database: "primary";
  }
>;

const app = new Gelis();

type RootBefore = typeof app;

const routes = app.context({
  db: {
    name: "primary",
  },

  logger: {
    level: "info",
  },
} as const);

const postRoute = routes.post(
  "/users/:id",

  {
    query: Query,

    body: Body,
  },

  (
    { params, query, body },

    scope,
  ) => {
    type Param = Expect<Equal<typeof params.id, string>>;

    type QueryPage = Expect<Equal<typeof query.page, number>>;

    type BodyName = Expect<Equal<typeof body.name, string>>;

    type Database = Expect<Equal<typeof scope.db.name, "primary">>;

    void (null as unknown as Param);

    void (null as unknown as QueryPage);

    void (null as unknown as BodyName);

    void (null as unknown as Database);

    return {
      id: params.id,

      page: query.page,

      name: body.name,
    };
  },

  {
    beforeHandle(
      { query },

      scope,
    ) {
      const page: number = query.page;

      const database: "primary" = scope.db.name;

      void page;
      void database;
    },

    afterHandle(_context, result, scope) {
      const name: string = result.name;

      const level: "info" = scope.logger.level;

      void name;
      void level;
    },
  },
);

const explicitRoute = routes.get(
  "/explicit/:id",

  {
    responses: {
      200: Output,
    },
  },

  (
    { params },

    scope,
  ) => ({
    id: params.id,

    database: scope.db.name,
  }),
);

const genericRoute = routes.route(
  "PATCH",
  "/generic/:id",

  (
    { params },

    scope,
  ) => ({
    id: params.id,

    database: scope.db.name,
  }),
);

type RootAfter = typeof app;

type StableRoot = Expect<Equal<RootBefore, RootAfter>>;

type PostContract = RouteContractOf<typeof postRoute>;

type PostMethod = Expect<Equal<PostContract["method"], "POST">>;

type PostRequest = Expect<
  Equal<
    PostContract["request"],
    {
      params: {
        id: string;
      };

      query: {
        page: string;
      };

      body: {
        name: string;
      };
    }
  >
>;

type ExplicitContract = RouteContractOf<typeof explicitRoute>;

type ExplicitResponse = Expect<
  Equal<
    ExplicitContract["responses"],
    {
      200: {
        id: string;
        database: "primary";
      };
    }
  >
>;

type GenericContract = RouteContractOf<typeof genericRoute>;

type GenericMethod = Expect<Equal<GenericContract["method"], "PATCH">>;

// @ts-expect-error unknown application-context property.
routes.get("/invalid-scope", (_context, scope) => scope.cache);

// @ts-expect-error invalid route path.
routes.post("users", () => null);

export type {
  ExplicitResponse,
  GenericMethod,
  PostMethod,
  PostRequest,
  StableRoot,
};
