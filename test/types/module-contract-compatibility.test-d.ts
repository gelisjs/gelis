import { defineCapability, defineContract, defineModule } from "../../src";

import type {
  ApiContractOf,
  Capability,
  ModuleContractOf,
  StandardSchemaV1,
} from "../../src";

import type { Equal, Expect } from "./assert";

interface DatabaseClient {
  readonly kind: "database";
}

const Database: Capability<DatabaseClient> = defineCapability(
  "module-contract-compatibility-database",
);

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
    normalizedName: string;
  }
>;

declare const Output: StandardSchemaV1<
  {
    id: string;

    name: string;
  },
  {
    id: string;

    name: string;

    normalized: true;
  }
>;

const users = defineModule(
  "/users",

  (setup) => ({
    database: Database.require(setup),
  }),

  {
    beforeHandle(_context, moduleScope) {
      const kind: "database" = moduleScope.database.kind;

      void kind;
    },

    afterHandle(_context, _result, moduleScope) {
      const kind: "database" = moduleScope.database.kind;

      void kind;
    },
  },

  (module) => {
    const requestScope = module.requestScope((_context, moduleScope) => ({
      databaseKind: moduleScope.database.kind,
    }));

    return {
      upsert: requestScope.post(
        "/:id",

        {
          query: Query,

          body: Body,

          responses: {
            200: {
              schema: Output,

              validate: true,
            },
          },

          openapi: {
            summary: "Upsert user",
          },
        },

        (
          { params, query, body },

          moduleScope,

          requestScope,
        ) => {
          const id: string = params.id;

          const page: number = query.page;

          const normalizedName: string = body.normalizedName;

          const databaseKind: "database" = moduleScope.database.kind;

          const requestDatabaseKind: "database" = requestScope.databaseKind;

          void page;
          void databaseKind;
          void requestDatabaseKind;

          return {
            id,

            name: normalizedName,
          };
        },
      ),
    };
  },
);

type ModuleContract = ModuleContractOf<typeof users>;

type ModulePrefix = Expect<Equal<ModuleContract["prefix"], "/users">>;

type UpsertContract = ModuleContract["routes"]["upsert"];

type UpsertMethod = Expect<Equal<UpsertContract["method"], "POST">>;

type UpsertPath = Expect<Equal<UpsertContract["path"], "/users/:id">>;

type UpsertParams = Expect<
  Equal<
    UpsertContract["request"]["params"],
    {
      id: string;
    }
  >
>;

type UpsertQuery = Expect<
  Equal<UpsertContract["request"]["query"], Record<string, string | string[]>>
>;

type UpsertBody = Expect<
  Equal<
    UpsertContract["request"]["body"],
    {
      name: string;
    }
  >
>;

type UpsertResponses = Expect<
  Equal<
    UpsertContract["responses"],
    {
      200: {
        id: string;

        name: string;

        normalized: true;
      };
    }
  >
>;

const api = defineContract({
  users,
});

type Api = ApiContractOf<typeof api>;

type ApiPreservesModuleRoute = Expect<
  Equal<Api["users"]["upsert"], UpsertContract>
>;

export type {
  ApiPreservesModuleRoute,
  ModulePrefix,
  UpsertBody,
  UpsertMethod,
  UpsertParams,
  UpsertPath,
  UpsertQuery,
  UpsertResponses,
};
