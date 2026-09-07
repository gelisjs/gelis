import { bindApplicationScopeRoute } from "./application-scope";

import type { ApplicationScopeBuilder } from "./application-scope";

import {
  GELIS_CAPABILITY_REQUIRE_RUNTIME,
  MISSING_CAPABILITY,
  readInstalledCapability,
} from "./plugin";

import type {
  CapabilityRequireRuntime,
  CapabilitySetupContext,
} from "./plugin";

import { RouteBuilder } from "./route-builder";

import type { AnyRouteRef, RouteContractOf } from "./route";

import type { ValidRoutePath } from "./types/path";

import type { RuntimeRouteRecord } from "./runtime/types";

export type ModuleRoutes = Readonly<Record<string, AnyRouteRef>>;

type AnyModulePublicRoutes = Readonly<Record<string, unknown>>;

type ModulePublicRoutes<Routes extends ModuleRoutes> = {
  -readonly [Name in keyof Routes]: RouteContractOf<Routes[Name]>;
};

declare const moduleRefBrand: unique symbol;

const moduleRuntimeDefinition = Symbol("gelis.module.runtime.definition");

export interface ModuleSetupContext extends CapabilitySetupContext {}

export type ModuleScopeResolver<Scope extends object> = (
  setup: ModuleSetupContext,
) => Scope;

export type ModuleMountErrorCode =
  | "MODULE_DEPENDENCY_MISSING"
  | "MODULE_SETUP_CONTEXT_INACTIVE"
  | "MODULE_ASYNC_SCOPE_UNSUPPORTED";

export class ModuleMountError extends Error {
  override readonly name = "ModuleMountError";

  constructor(
    readonly code: ModuleMountErrorCode,

    message: string,

    readonly modulePrefix: string,

    readonly capabilityName?: string,
  ) {
    super(message);
  }
}

interface ModuleRefInternal<
  Prefix extends string,
  Routes extends ModuleRoutes,
  PublicRoutes extends AnyModulePublicRoutes,
> {
  readonly prefix: Prefix;

  readonly routes: Routes;

  readonly [moduleRefBrand]: {
    readonly publicRoutes: PublicRoutes;
  };
}

interface RuntimeModuleDefinition {
  readonly routes: readonly RuntimeRouteRecord[];

  readonly resolveScope: ModuleScopeResolver<object> | undefined;
}

interface RuntimeModule {
  readonly [moduleRuntimeDefinition]: RuntimeModuleDefinition;
}

interface ModuleSetupFrame {
  readonly application: object;

  readonly prefix: string;

  active: boolean;
}

class ModuleSetupContextRuntime implements ModuleSetupContext {
  readonly #frame: ModuleSetupFrame;

  constructor(frame: ModuleSetupFrame) {
    this.#frame = frame;
  }

  readonly [GELIS_CAPABILITY_REQUIRE_RUNTIME]: CapabilityRequireRuntime = (
    capability,

    capabilityName,
  ) => {
    const frame = this.#frame;

    if (!frame.active) {
      throw moduleSetupContextInactiveError(frame.prefix);
    }

    const value = readInstalledCapability(frame.application, capability);

    if (value === MISSING_CAPABILITY) {
      throw moduleDependencyMissingError(frame.prefix, capabilityName);
    }

    return value;
  };
}

export type ModuleRef<
  Prefix extends string,
  Routes extends ModuleRoutes,
> = ModuleRefInternal<Prefix, Routes, ModulePublicRoutes<Routes>>;

export type AnyModuleRef = ModuleRefInternal<
  string,
  ModuleRoutes,
  AnyModulePublicRoutes
>;

export type ModulePublicContractOf<Module> =
  Module extends ModuleRefInternal<string, ModuleRoutes, infer PublicRoutes>
    ? PublicRoutes
    : never;

export type ModuleContractOf<Module> =
  Module extends ModuleRefInternal<
    infer Prefix,
    ModuleRoutes,
    infer PublicRoutes
  >
    ? {
        prefix: Prefix;

        routes: PublicRoutes;
      }
    : never;

export function defineModule<
  const Prefix extends string,
  const Routes extends ModuleRoutes,
>(
  prefix: Prefix & ValidRoutePath<Prefix>,

  define: (route: RouteBuilder<Prefix>) => Routes,
): ModuleRef<Prefix, Routes>;

export function defineModule<
  const Prefix extends string,
  const Scope extends object,
  const Routes extends ModuleRoutes,
>(
  prefix: Prefix & ValidRoutePath<Prefix>,

  resolveScope: ModuleScopeResolver<Scope>,

  define: (route: ApplicationScopeBuilder<Scope, Prefix>) => Routes,
): ModuleRef<Prefix, Routes>;

export function defineModule(
  prefix: string,

  defineOrResolve: (...args: any[]) => unknown,

  defineScoped?: (...args: any[]) => unknown,
): AnyModuleRef {
  const runtimeRoutes: RuntimeRouteRecord[] = [];

  if (defineScoped === undefined) {
    const route = new RouteBuilder(
      prefix,

      (runtimeRoute) => {
        runtimeRoutes.push(runtimeRoute);
      },
    );

    const routes = defineOrResolve(route) as ModuleRoutes;

    return createModuleRef(prefix, routes, runtimeRoutes, undefined);
  }

  const route = new RouteBuilder(
    prefix,

    (runtimeRoute) => {
      runtimeRoutes.push(runtimeRoute);
    },
  ) as unknown as ApplicationScopeBuilder<object, string>;

  const routes = defineScoped(route) as ModuleRoutes;

  return createModuleRef(
    prefix,

    routes,

    runtimeRoutes,

    defineOrResolve as ModuleScopeResolver<object>,
  );
}

export function instantiateModuleRuntimeRoutes(
  application: object,

  module: AnyModuleRef,
): readonly RuntimeRouteRecord[] {
  const definition = (module as unknown as RuntimeModule)[
    moduleRuntimeDefinition
  ];

  const resolveScope = definition.resolveScope;

  if (resolveScope === undefined) {
    return definition.routes.map(cloneRuntimeRoute);
  }

  const frame: ModuleSetupFrame = {
    application,

    prefix: module.prefix,

    active: true,
  };

  const setup = new ModuleSetupContextRuntime(frame);

  let scope: object;

  try {
    scope = resolveScope(setup);

    if (isPromiseLike(scope)) {
      void Promise.resolve(scope).catch(() => undefined);

      throw moduleAsyncScopeUnsupportedError(module.prefix);
    }
  } finally {
    frame.active = false;
  }

  return definition.routes.map((route) =>
    bindApplicationScopeRoute(route, scope),
  );
}

function createModuleRef(
  prefix: string,

  routes: ModuleRoutes,

  runtimeRoutes: readonly RuntimeRouteRecord[],

  resolveScope: ModuleScopeResolver<object> | undefined,
): AnyModuleRef {
  return {
    prefix,

    routes,

    [moduleRuntimeDefinition]: {
      routes: runtimeRoutes,

      resolveScope,
    },
  } as unknown as AnyModuleRef;
}

function cloneRuntimeRoute(route: RuntimeRouteRecord): RuntimeRouteRecord {
  return {
    ...route,
  };
}

function moduleDependencyMissingError(
  modulePrefix: string,

  capabilityName: string,
): ModuleMountError {
  return new ModuleMountError(
    "MODULE_DEPENDENCY_MISSING",

    `Missing capability dependency "${capabilityName}" required by module "${modulePrefix}"`,

    modulePrefix,

    capabilityName,
  );
}

function moduleSetupContextInactiveError(
  modulePrefix: string,
): ModuleMountError {
  return new ModuleMountError(
    "MODULE_SETUP_CONTEXT_INACTIVE",

    `Module setup context for "${modulePrefix}" is no longer active`,

    modulePrefix,
  );
}

function moduleAsyncScopeUnsupportedError(
  modulePrefix: string,
): ModuleMountError {
  return new ModuleMountError(
    "MODULE_ASYNC_SCOPE_UNSUPPORTED",

    `Async module scope resolution is not supported for "${modulePrefix}"`,

    modulePrefix,
  );
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    "then" in value &&
    typeof (
      value as {
        then?: unknown;
      }
    ).then === "function"
  );
}
