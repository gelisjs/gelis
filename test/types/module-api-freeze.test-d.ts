import {
  Gelis,
  ModuleMountError,
  defineCapability,
  defineModule,
} from "../../src";

import type {
  Capability,
  ModuleContractOf,
  ModuleLifecycle,
  ModuleMountErrorCode,
  ModuleRef,
  ModuleScopeLifecycle,
  ModuleSetupContext,
} from "../../src";

import type { Equal, Expect } from "./assert";

interface DatabaseClient {
  readonly kind: "database";
}

const Database: Capability<DatabaseClient> = defineCapability(
  "module-api-freeze-database",
);

/*
 * Freeze the public mount error-code vocabulary.
 */
type MountErrorCodes = Expect<
  Equal<
    ModuleMountErrorCode,
    | "MODULE_DEPENDENCY_MISSING"
    | "MODULE_SETUP_CONTEXT_INACTIVE"
    | "MODULE_ASYNC_SCOPE_UNSUPPORTED"
    | "MODULE_ALREADY_MOUNTED"
  >
>;

const mountError: ModuleMountError = new ModuleMountError(
  "MODULE_ALREADY_MOUNTED",
  "already mounted",
  "/freeze",
);

const mountErrorCode: ModuleMountErrorCode = mountError.code;

void mountErrorCode;

/*
 * 1. Static module.
 */
const staticModule = defineModule(
  "/static",

  (route) => ({
    read: route.get(
      "/:id",

      ({ params }) => params.id,
    ),
  }),
);

type StaticPrefix = Expect<Equal<typeof staticModule.prefix, "/static">>;

type StaticRoutePath = Expect<
  Equal<typeof staticModule.routes.read.path, "/static/:id">
>;

/*
 * 2. Static module + lifecycle.
 */
const staticLifecycle: ModuleLifecycle = {
  beforeHandle(context) {
    const request: Request = context.request;

    void request;
  },

  afterHandle(_context, result) {
    const value: unknown = result;

    void value;
  },
};

const staticLifecycleModule = defineModule(
  "/static-lifecycle",

  staticLifecycle,

  (route) => ({
    read: route.get("/", () => "ok" as const),
  }),
);

/*
 * 3. Scoped module.
 */
interface ModuleScope {
  readonly database: DatabaseClient;
}

const resolveScope = (setup: ModuleSetupContext): ModuleScope => ({
  database: Database.require(setup),
});

const scopedModule = defineModule(
  "/scoped",

  resolveScope,

  (module) => ({
    read: module.get(
      "/:id",

      ({ params }, scope) => {
        const id: string = params.id;

        const database: DatabaseClient = scope.database;

        void database;

        return id;
      },
    ),
  }),
);

/*
 * 4. Scoped module + lifecycle.
 */
const scopedLifecycle: ModuleScopeLifecycle<ModuleScope> = {
  beforeHandle(_context, scope) {
    const database: DatabaseClient = scope.database;

    void database;
  },

  afterHandle(_context, result, scope) {
    const database: DatabaseClient = scope.database;

    const value: unknown = result;

    void database;
    void value;
  },
};

const scopedLifecycleModule = defineModule(
  "/scoped-lifecycle",

  resolveScope,

  scopedLifecycle,

  (module) => {
    const requestScope = module.requestScope((_context, moduleScope) => ({
      kind: moduleScope.database.kind,
    }));

    return {
      read: requestScope.get(
        "/:id",

        ({ params }, moduleScope, requestScope) => {
          const id: string = params.id;

          const database: DatabaseClient = moduleScope.database;

          const kind: "database" = requestScope.kind;

          void database;
          void kind;

          return id;
        },
      ),
    };
  },
);

/*
 * Freeze ModuleRef / ModuleContractOf projection.
 */
type StaticRef = Expect<
  Equal<
    typeof staticModule extends ModuleRef<"/static", infer Routes>
      ? Routes["read"]["path"]
      : never,
    "/static/:id"
  >
>;

type ScopedContractPath = Expect<
  Equal<
    ModuleContractOf<typeof scopedLifecycleModule>["routes"]["read"]["path"],
    "/scoped-lifecycle/:id"
  >
>;

/*
 * Freeze app.mount:
 * - accepts every public ModuleRef shape
 * - returns void
 * - does not grow the Gelis root type
 */
const app = new Gelis();

type RootBefore = typeof app;

const mountStatic = app.mount(staticModule);

const mountStaticLifecycle = app.mount(staticLifecycleModule);

const mountScoped = app.mount(scopedModule);

const mountScopedLifecycle = app.mount(scopedLifecycleModule);

type MountStaticReturn = Expect<Equal<typeof mountStatic, void>>;

type MountStaticLifecycleReturn = Expect<
  Equal<typeof mountStaticLifecycle, void>
>;

type MountScopedReturn = Expect<Equal<typeof mountScoped, void>>;

type MountScopedLifecycleReturn = Expect<
  Equal<typeof mountScopedLifecycle, void>
>;

type RootAfter = typeof app;

type StableRoot = Expect<Equal<RootBefore, RootAfter>>;

export type {
  MountErrorCodes,
  MountScopedLifecycleReturn,
  MountScopedReturn,
  MountStaticLifecycleReturn,
  MountStaticReturn,
  ScopedContractPath,
  StableRoot,
  StaticPrefix,
  StaticRef,
  StaticRoutePath,
};
