import { defineModule } from "../../src";

import type { ModuleScopeResolver, ModuleSetupContext } from "../../src";

import type { Equal, Expect } from "./assert";

interface AsyncScope {
  readonly value: string;
}

const asyncResolver: ModuleScopeResolver<AsyncScope> = async (
  _setup: ModuleSetupContext,
) => ({
  value: "async",
});

type ResolverReturn = Expect<
  Equal<
    ReturnType<ModuleScopeResolver<AsyncScope>>,
    AsyncScope | PromiseLike<AsyncScope>
  >
>;

const module = defineModule(
  "/async-type",

  asyncResolver,

  (route) => ({
    read: route.get(
      "/",

      (_context, scope) => {
        const value: string = scope.value;

        return value;
      },
    ),
  }),
);

type AsyncModulePrefix = Expect<Equal<typeof module.prefix, "/async-type">>;

export type { AsyncModulePrefix, ResolverReturn };
