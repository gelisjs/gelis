import { Gelis, defineCapability, defineModule } from "../../src";

import type { Capability, ModuleContractOf } from "../../src";

import type { Equal, Expect } from "./assert";

interface DatabaseClient {
  readonly kind: "database";

  find(id: string): string;
}

const Database: Capability<DatabaseClient> = defineCapability("database");

const users = defineModule(
  "/teams/:teamId",

  (setup) => {
    const database = Database.require(setup);

    const kind: "database" = database.kind;

    void kind;

    // Modules consume capabilities but cannot provide them.
    // @ts-expect-error module setup is not plugin setup.
    Database.provide(setup, database);

    // Module setup does not expose plugin composition.
    // @ts-expect-error routes belong to the definition builder.
    setup.routes;

    // @ts-expect-error nested plugin installation is not module setup API.
    setup.use;

    return {
      database,
    };
  },

  (route) => ({
    find: route.get(
      "/users/:userId",

      ({ params }, scope) => {
        const teamId: string = params.teamId;

        const userId: string = params.userId;

        const database: DatabaseClient = scope.database;

        return {
          teamId,
          userId,
          result: database.find(userId),
        };
      },
    ),
  }),
);

type Contract = ModuleContractOf<typeof users>;

type Prefix = Expect<Equal<Contract["prefix"], "/teams/:teamId">>;

type FindPath = Expect<
  Equal<Contract["routes"]["find"]["path"], "/teams/:teamId/users/:userId">
>;

type FindParams = Expect<
  Equal<
    Contract["routes"]["find"]["request"]["params"],
    {
      teamId: string;

      userId: string;
    }
  >
>;

type RouteRefPath = Expect<
  Equal<typeof users.routes.find.path, "/teams/:teamId/users/:userId">
>;

const staticModule = defineModule(
  "/static",

  (route) => ({
    read: route.get("/", () => "ok"),
  }),
);

type StaticPath = Expect<
  Equal<
    ModuleContractOf<typeof staticModule>["routes"]["read"]["path"],
    "/static"
  >
>;

const app = new Gelis();

type RootBefore = typeof app;

app.mount(users);
app.mount(staticModule);

type RootAfter = typeof app;

type StableRoot = Expect<Equal<RootBefore, RootAfter>>;

export type {
  FindParams,
  FindPath,
  Prefix,
  RouteRefPath,
  StableRoot,
  StaticPath,
};
