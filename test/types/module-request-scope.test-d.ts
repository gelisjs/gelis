import { defineCapability, defineModule } from "../../src";

import type {
  Capability,
  ModuleContractOf,
  ModuleRequestScopeDerive,
  ModuleRequestScopeLifecycleFor,
} from "../../src";

import type { Equal, Expect } from "./assert";

interface DatabaseClient {
  readonly kind: "database";
}

const Database: Capability<DatabaseClient> = defineCapability(
  "module-request-scope-database",
);

const staticModule = defineModule(
  "/static-request",

  (module) => {
    const requestScope = module.requestScope(() => ({
      userId: "user" as const,
    }));

    return {
      read: requestScope.get(
        "/:id",

        (
          { params },

          requestScope,
        ) => {
          const id: string = params.id;

          const userId: "user" = requestScope.userId;

          void id;

          return userId;
        },
      ),
    };
  },
);

type StaticRequestPath = Expect<
  Equal<
    ModuleContractOf<typeof staticModule>["routes"]["read"]["path"],
    "/static-request/:id"
  >
>;

interface ModuleServices {
  readonly database: DatabaseClient;
}

interface RequestServices {
  readonly userId: "user";
}

const derive: ModuleRequestScopeDerive<ModuleServices, RequestServices> = (
  context,
  moduleScope,
) => {
  const database: DatabaseClient = moduleScope.database;

  const request: Request = context.request;

  void database;
  void request;

  return {
    userId: "user",
  };
};

const scopedModule = defineModule(
  "/scoped-request",

  (setup): ModuleServices => ({
    database: Database.require(setup),
  }),

  (module) => {
    const requestScope = module.requestScope(derive);

    return {
      read: requestScope.get(
        "/:id",

        (
          { params },

          moduleScope,

          requestScope,
        ) => {
          const id: string = params.id;

          const database: DatabaseClient = moduleScope.database;

          const userId: "user" = requestScope.userId;

          // @ts-expect-error request scope is not merged into module scope.
          moduleScope.userId;

          // @ts-expect-error module scope is not merged into request scope.
          requestScope.database;

          void id;
          void database;

          return userId;
        },

        {
          beforeHandle(_context, moduleScope, requestScope) {
            const database: DatabaseClient = moduleScope.database;

            const userId: "user" = requestScope.userId;

            void database;
            void userId;
          },

          afterHandle(_context, result, moduleScope, requestScope) {
            const database: DatabaseClient = moduleScope.database;

            const userId: "user" = requestScope.userId;

            const resolvedResult: "user" = result;

            void database;
            void userId;
            void resolvedResult;
          },
        },
      ),
    };
  },
);

type ScopedRequestPath = Expect<
  Equal<
    ModuleContractOf<typeof scopedModule>["routes"]["read"]["path"],
    "/scoped-request/:id"
  >
>;

const lifecycle: ModuleRequestScopeLifecycleFor<
  "/typed",
  ModuleServices,
  RequestServices,
  undefined,
  undefined,
  undefined,
  "user"
> = {
  beforeHandle(_context, moduleScope, requestScope) {
    const database: DatabaseClient = moduleScope.database;

    const userId: "user" = requestScope.userId;

    void database;
    void userId;
  },

  afterHandle(_context, result, moduleScope, requestScope) {
    const resolved: "user" = result;

    const database: DatabaseClient = moduleScope.database;

    const userId: "user" = requestScope.userId;

    void resolved;
    void database;
    void userId;
  },
};

void lifecycle;

export type { ScopedRequestPath, StaticRequestPath };
