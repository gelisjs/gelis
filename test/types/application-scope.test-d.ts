import { Gelis } from "../../src";

import type { RouteContractOf } from "../../src";

import type { Equal, Expect } from "./assert";

const app = new Gelis();

type RootBefore = typeof app;

const scope = {
  db: {
    name: "database",
  },

  logger: {
    level: "info",
  },
} as const;

const routes = app.scope(scope);

const getUser = routes.get(
  "/users/:id",

  (
    { params },

    context,
  ) => {
    type ParamId = Expect<Equal<typeof params.id, string>>;

    type DatabaseName = Expect<Equal<typeof context.db.name, "database">>;

    type LoggerLevel = Expect<Equal<typeof context.logger.level, "info">>;

    void (null as unknown as ParamId);

    void (null as unknown as DatabaseName);

    void (null as unknown as LoggerLevel);

    // @ts-expect-error unknown application-context property.
    void context.cache;

    return {
      id: params.id,

      source: context.db.name,
    };
  },
);

type RootAfter = typeof app;

type StableRoot = Expect<Equal<RootBefore, RootAfter>>;

type GetUserContract = RouteContractOf<typeof getUser>;

type GetUserMethod = Expect<Equal<GetUserContract["method"], "GET">>;

type GetUserPath = Expect<Equal<GetUserContract["path"], "/users/:id">>;

type GetUserParams = Expect<
  Equal<
    GetUserContract["request"]["params"],
    {
      id: string;
    }
  >
>;

type GetUserResponse = Expect<
  Equal<
    GetUserContract["responses"],
    {
      200: {
        id: string;
        source: "database";
      };
    }
  >
>;

// @ts-expect-error invalid Gelis route path.
routes.get("users", () => null);

export type {
  GetUserContract,
  GetUserMethod,
  GetUserParams,
  GetUserPath,
  GetUserResponse,
  StableRoot,
};
