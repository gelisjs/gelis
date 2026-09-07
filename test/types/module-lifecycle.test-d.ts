import { defineCapability, defineModule } from "../../src";

import type {
  Capability,
  ModuleContractOf,
  ModuleLifecycle,
  ModuleScopeLifecycle,
} from "../../src";

import type { Equal, Expect } from "./assert";

interface DatabaseClient {
  readonly kind: "database";
}

const Database: Capability<DatabaseClient> = defineCapability(
  "module-lifecycle-database",
);

const staticLifecycle: ModuleLifecycle = {
  beforeHandle(context) {
    const pathname: string = new URL(context.request.url).pathname;

    const params: Record<string, string> = context.params;

    const query: unknown = context.query;

    const body: unknown = context.body;

    void pathname;
    void params;
    void query;
    void body;
  },
};

const staticModule = defineModule(
  "/static-hooks",

  staticLifecycle,

  (route) => ({
    read: route.get(
      "/:id",

      ({ params }) => params.id,
    ),
  }),
);

type StaticPath = Expect<
  Equal<
    ModuleContractOf<typeof staticModule>["routes"]["read"]["path"],
    "/static-hooks/:id"
  >
>;

interface ModuleServices {
  readonly database: DatabaseClient;
}

const scopedLifecycle: ModuleScopeLifecycle<ModuleServices> = {
  beforeHandle(_context, scope) {
    const database: DatabaseClient = scope.database;

    void database;

    // @ts-expect-error module lifecycle scope is exact.
    scope.missing;
  },

  afterHandle(_context, result, scope) {
    const unknownResult: unknown = result;

    const kind: "database" = scope.database.kind;

    void unknownResult;
    void kind;
  },
};

const scopedModule = defineModule(
  "/scoped-hooks",

  (setup): ModuleServices => ({
    database: Database.require(setup),
  }),

  scopedLifecycle,

  (route) => ({
    read: route.get(
      "/",

      (_context, scope) => scope.database.kind,
    ),
  }),
);

type ScopedPath = Expect<
  Equal<
    ModuleContractOf<typeof scopedModule>["routes"]["read"]["path"],
    "/scoped-hooks"
  >
>;

export type { ScopedPath, StaticPath };
