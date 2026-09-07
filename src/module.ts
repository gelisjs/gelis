import {
  bindModuleApplicationScopeRoute,
  createModuleRequestScopeBuilder,
} from "./module-request-scope";

import type {
  ModuleRequestScopeBuilder,
  ModuleRequestScopeDerive,
} from "./module-request-scope";

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

import type {
  ModulePlainRouteBuilder,
  ModuleRouteBuilderState,
  ModuleScopedRouteBuilder,
  ModuleScopedRouteBuilderState,
} from "./module-route-surface";

import { compileAfterHandle, compileBeforeHandle } from "./runtime/lifecycle";

import {
  RUNTIME_ROUTE_AFTER_HANDLE,
  RUNTIME_ROUTE_BEFORE_HANDLE,
} from "./runtime/types";

import type {
  AnyRouteRef,
  GlobalAfterHandle,
  GlobalBeforeHandle,
  GlobalRouteContext,
  RouteContractOf,
} from "./route";

import type { ValidRoutePath } from "./types/path";

import type {
  RuntimeAfterHandle,
  RuntimeBeforeHandle,
  RuntimeRouteContext,
  RuntimeRouteRecord,
} from "./runtime/types";

export type ModuleRoutes = Readonly<Record<string, AnyRouteRef>>;

type ModulePublicRoutes<Routes extends ModuleRoutes> = {
  -readonly [Name in keyof Routes]: RouteContractOf<Routes[Name]>;
};

declare const moduleRefBrand: unique symbol;

const moduleRuntimeDefinition = Symbol("gelis.module.runtime.definition");

export interface ModuleSetupContext extends CapabilitySetupContext {}

export type ModuleScopeResolver<Scope extends object> = (
  setup: ModuleSetupContext,
) => Scope;

interface StaticModuleRequestScopeFactory {
  <const Prefix extends string, const RequestScope extends object>(
    this: ModuleRouteBuilderState<Prefix>,

    derive: ModuleRequestScopeDerive<never, RequestScope>,
  ): ModuleRequestScopeBuilder<never, RequestScope, Prefix>;
}

interface ScopedModuleRequestScopeFactory {
  <
    const ModuleScope extends object,
    const Prefix extends string,
    const RequestScope extends object,
  >(
    this: ModuleScopedRouteBuilderState<ModuleScope, Prefix>,

    derive: ModuleRequestScopeDerive<ModuleScope, RequestScope>,
  ): ModuleRequestScopeBuilder<ModuleScope, RequestScope, Prefix>;
}

export type ModuleRouteBuilder<Prefix extends string> =
  ModulePlainRouteBuilder<Prefix> & {
    readonly requestScope: StaticModuleRequestScopeFactory;
  };

export type ModuleScopeBuilder<
  Scope extends object,
  Prefix extends string,
> = ModuleScopedRouteBuilder<Scope, Prefix> & {
  readonly requestScope: ScopedModuleRequestScopeFactory;
};

export interface ModuleLifecycle {
  readonly beforeHandle?: GlobalBeforeHandle;

  readonly afterHandle?: GlobalAfterHandle;
}

export interface ModuleScopeLifecycle<Scope extends object> {
  readonly beforeHandle?: (
    context: GlobalRouteContext,

    scope: Scope,
  ) => unknown | PromiseLike<unknown>;

  readonly afterHandle?: (
    context: GlobalRouteContext,

    result: unknown,

    scope: Scope,
  ) => void | PromiseLike<void>;
}

export type ModuleMountErrorCode =
  | "MODULE_DEPENDENCY_MISSING"
  | "MODULE_SETUP_CONTEXT_INACTIVE"
  | "MODULE_ASYNC_SCOPE_UNSUPPORTED"
  | "MODULE_ALREADY_MOUNTED";

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
> {
  readonly prefix: Prefix;

  readonly routes: Routes;

  readonly [moduleRefBrand]: true;
}

interface StaticRuntimeModuleLifecycle {
  readonly kind: "static";

  readonly beforeHandle: RuntimeBeforeHandle | undefined;

  readonly afterHandle: RuntimeAfterHandle | undefined;
}

type ScopedRuntimeModuleBeforeHandle = (
  context: RuntimeRouteContext,

  scope: object,
) => unknown | PromiseLike<unknown>;

type ScopedRuntimeModuleAfterHandle = (
  context: RuntimeRouteContext,

  result: unknown,

  scope: object,
) => void | PromiseLike<void>;

interface ScopedRuntimeModuleLifecycle {
  readonly kind: "scoped";

  readonly beforeHandle: ScopedRuntimeModuleBeforeHandle | undefined;

  readonly afterHandle: ScopedRuntimeModuleAfterHandle | undefined;
}

type RuntimeModuleLifecycle =
  | StaticRuntimeModuleLifecycle
  | ScopedRuntimeModuleLifecycle;

interface RuntimeModuleDefinition {
  readonly routes: readonly RuntimeRouteRecord[];

  readonly resolveScope: ModuleScopeResolver<object> | undefined;

  readonly lifecycle: RuntimeModuleLifecycle | undefined;
}

interface RuntimeModule {
  readonly [moduleRuntimeDefinition]: RuntimeModuleDefinition;
}

interface ModuleSetupFrame {
  readonly application: object;

  readonly prefix: string;

  active: boolean;
}

type ModuleMountCommit = (routes: readonly RuntimeRouteRecord[]) => void;

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
> = ModuleRefInternal<Prefix, Routes>;

export type AnyModuleRef = ModuleRefInternal<string, ModuleRoutes>;

export type ModulePublicContractOf<Module> =
  Module extends ModuleRefInternal<string, infer Routes>
    ? ModulePublicRoutes<Routes>
    : never;

export type ModuleContractOf<Module> =
  Module extends ModuleRefInternal<infer Prefix, infer Routes>
    ? {
        prefix: Prefix;

        routes: ModulePublicRoutes<Routes>;
      }
    : never;

const applicationModuleMounts = new WeakMap<object, Set<AnyModuleRef>>();

export function defineModule<
  const Prefix extends string,
  const Routes extends ModuleRoutes,
>(
  prefix: Prefix & ValidRoutePath<Prefix>,

  define: (route: ModuleRouteBuilder<Prefix>) => Routes,
): ModuleRef<Prefix, Routes>;

export function defineModule<
  const Prefix extends string,
  const Routes extends ModuleRoutes,
>(
  prefix: Prefix & ValidRoutePath<Prefix>,

  lifecycle: ModuleLifecycle,

  define: (route: ModuleRouteBuilder<Prefix>) => Routes,
): ModuleRef<Prefix, Routes>;

export function defineModule<
  const Prefix extends string,
  const Scope extends object,
  const Routes extends ModuleRoutes,
>(
  prefix: Prefix & ValidRoutePath<Prefix>,

  resolveScope: ModuleScopeResolver<Scope>,

  define: (route: ModuleScopeBuilder<Scope, Prefix>) => Routes,
): ModuleRef<Prefix, Routes>;

export function defineModule<
  const Prefix extends string,
  const Scope extends object,
  const Routes extends ModuleRoutes,
>(
  prefix: Prefix & ValidRoutePath<Prefix>,

  resolveScope: ModuleScopeResolver<Scope>,

  lifecycle: ModuleScopeLifecycle<Scope>,

  define: (route: ModuleScopeBuilder<Scope, Prefix>) => Routes,
): ModuleRef<Prefix, Routes>;

export function defineModule(
  prefix: string,

  defineLifecycleOrResolve: any,

  defineOrLifecycle?: any,

  defineScoped?: any,
): AnyModuleRef {
  const runtimeRoutes: RuntimeRouteRecord[] = [];

  /*
   * Existing two-argument static module.
   */
  if (defineOrLifecycle === undefined) {
    const define = defineLifecycleOrResolve as (
      route: ModuleRouteBuilder<string>,
    ) => ModuleRoutes;

    const route = createStaticModuleRouteBuilder(
      prefix,
      runtimeRoutes,
      undefined,
    );

    const routes = define(route);

    return createModuleRef(prefix, routes, runtimeRoutes, undefined, undefined);
  }

  /*
   * Four-argument scoped module with module lifecycle.
   */
  if (defineScoped !== undefined) {
    const resolveScope =
      defineLifecycleOrResolve as ModuleScopeResolver<object>;

    const lifecycle = normalizeScopedModuleLifecycle(
      defineOrLifecycle as ModuleScopeLifecycle<object>,
    );

    const route = createScopedModuleRouteBuilder(
      prefix,
      runtimeRoutes,
      lifecycle,
    );

    const routes = defineScoped(route);

    return createModuleRef(
      prefix,
      routes,
      runtimeRoutes,
      resolveScope,
      lifecycle,
    );
  }

  /*
   * Existing three-argument scoped module.
   *
   * The second argument is necessarily a function here:
   * static lifecycle uses an object in the second position.
   */
  if (typeof defineLifecycleOrResolve === "function") {
    const resolveScope =
      defineLifecycleOrResolve as ModuleScopeResolver<object>;

    const define = defineOrLifecycle as (
      route: ModuleScopeBuilder<object, string>,
    ) => ModuleRoutes;

    const route = createScopedModuleRouteBuilder(
      prefix,
      runtimeRoutes,
      undefined,
    );

    const routes = define(route);

    return createModuleRef(
      prefix,
      routes,
      runtimeRoutes,
      resolveScope,
      undefined,
    );
  }

  /*
   * Three-argument static module with module lifecycle.
   */
  const lifecycle = normalizeStaticModuleLifecycle(defineLifecycleOrResolve);

  const define = defineOrLifecycle as (
    route: ModuleRouteBuilder<string>,
  ) => ModuleRoutes;

  const route = createStaticModuleRouteBuilder(
    prefix,
    runtimeRoutes,
    lifecycle,
  );

  const routes = define(route);

  return createModuleRef(prefix, routes, runtimeRoutes, undefined, lifecycle);
}

export function mountModuleRuntimeRoutes(
  application: object,

  module: AnyModuleRef,

  commit: ModuleMountCommit,
): void {
  let mounted = applicationModuleMounts.get(application);

  if (mounted === undefined) {
    mounted = new Set();

    applicationModuleMounts.set(application, mounted);
  }

  if (mounted.has(module)) {
    throw moduleAlreadyMountedError(module.prefix);
  }

  /*
   * Reserve identity before dependency resolution.
   *
   * This makes a re-entrant mount of the same Module object fail immediately.
   * The reservation is removed on every failed mount, so dependency or route
   * failures remain retryable.
   */
  mounted.add(module);

  let mountSucceeded = false;

  try {
    const routes = instantiateModuleRuntimeRoutes(application, module);

    commit(routes);

    mountSucceeded = true;
  } finally {
    if (!mountSucceeded) {
      mounted.delete(module);
    }
  }
}

function instantiateModuleRuntimeRoutes(
  application: object,

  module: AnyModuleRef,
): readonly RuntimeRouteRecord[] {
  const definition = (module as unknown as RuntimeModule)[
    moduleRuntimeDefinition
  ];

  const resolveScope = definition.resolveScope;

  if (resolveScope === undefined) {
    const routes = definition.routes.map(cloneRuntimeRoute);

    const lifecycle = definition.lifecycle;

    if (lifecycle === undefined) {
      return routes;
    }

    if (lifecycle.kind !== "static") {
      throw new Error("Invalid Gelis static module lifecycle");
    }

    bindModuleLifecycleRoutes(
      routes,
      lifecycle.beforeHandle,
      lifecycle.afterHandle,
    );

    return routes;
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

  const routes = definition.routes.map((route) =>
    bindModuleApplicationScopeRoute(route, scope),
  );

  const lifecycle = definition.lifecycle;

  if (lifecycle === undefined) {
    return routes;
  }

  if (lifecycle.kind !== "scoped") {
    throw new Error("Invalid Gelis scoped module lifecycle");
  }

  const scopedBeforeHandle = lifecycle.beforeHandle;

  const beforeHandle: RuntimeBeforeHandle | undefined =
    scopedBeforeHandle === undefined
      ? undefined
      : (context) => scopedBeforeHandle(context, scope);

  const scopedAfterHandle = lifecycle.afterHandle;

  const afterHandle: RuntimeAfterHandle | undefined =
    scopedAfterHandle === undefined
      ? undefined
      : (context, result) => scopedAfterHandle(context, result, scope);

  bindModuleLifecycleRoutes(routes, beforeHandle, afterHandle);

  return routes;
}

function createStaticModuleRouteBuilder(
  prefix: string,

  runtimeRoutes: RuntimeRouteRecord[],

  lifecycle: RuntimeModuleLifecycle | undefined,
): ModuleRouteBuilder<string> {
  const register = (runtimeRoute: RuntimeRouteRecord) => {
    runtimeRoutes.push(runtimeRoute);
  };

  const builder = new RouteBuilder(prefix, register);

  const beforeHandle =
    lifecycle?.kind === "static" ? lifecycle.beforeHandle : undefined;

  const afterHandle =
    lifecycle?.kind === "static" ? lifecycle.afterHandle : undefined;

  Object.defineProperty(builder, "requestScope", {
    value: (derive: ModuleRequestScopeDerive<never, object>) =>
      createModuleRequestScopeBuilder(
        prefix,
        derive,
        register,
        false,
        beforeHandle,
        afterHandle,
      ),
  });

  return builder as unknown as ModuleRouteBuilder<string>;
}

function createScopedModuleRouteBuilder(
  prefix: string,

  runtimeRoutes: RuntimeRouteRecord[],

  lifecycle: RuntimeModuleLifecycle | undefined,
): ModuleScopeBuilder<object, string> {
  const register = (runtimeRoute: RuntimeRouteRecord) => {
    runtimeRoutes.push(runtimeRoute);
  };

  const builder = new RouteBuilder(prefix, register);

  const beforeHandle =
    lifecycle?.kind === "scoped" ? lifecycle.beforeHandle : undefined;

  const afterHandle =
    lifecycle?.kind === "scoped" ? lifecycle.afterHandle : undefined;

  Object.defineProperty(builder, "requestScope", {
    value: (derive: ModuleRequestScopeDerive<object, object>) =>
      createModuleRequestScopeBuilder(
        prefix,
        derive,
        register,
        true,
        beforeHandle,
        afterHandle,
      ),
  });

  return builder as unknown as ModuleScopeBuilder<object, string>;
}

function normalizeStaticModuleLifecycle(
  lifecycle: ModuleLifecycle,
): RuntimeModuleLifecycle | undefined {
  const beforeHandle = lifecycle.beforeHandle;

  const afterHandle = lifecycle.afterHandle;

  if (beforeHandle === undefined && afterHandle === undefined) {
    return undefined;
  }

  return {
    kind: "static",

    beforeHandle: beforeHandle as RuntimeBeforeHandle | undefined,

    afterHandle: afterHandle as RuntimeAfterHandle | undefined,
  };
}

function normalizeScopedModuleLifecycle(
  lifecycle: ModuleScopeLifecycle<object>,
): RuntimeModuleLifecycle | undefined {
  const beforeHandle = lifecycle.beforeHandle;

  const afterHandle = lifecycle.afterHandle;

  if (beforeHandle === undefined && afterHandle === undefined) {
    return undefined;
  }

  return {
    kind: "scoped",

    beforeHandle: beforeHandle as ScopedRuntimeModuleBeforeHandle | undefined,

    afterHandle: afterHandle as ScopedRuntimeModuleAfterHandle | undefined,
  };
}

function bindModuleLifecycleRoutes(
  routes: readonly RuntimeRouteRecord[],

  beforeHandle: RuntimeBeforeHandle | undefined,

  afterHandle: RuntimeAfterHandle | undefined,
): void {
  if (beforeHandle === undefined && afterHandle === undefined) {
    return;
  }

  const beforeHooks =
    beforeHandle === undefined ? undefined : ([beforeHandle] as const);

  const afterHooks =
    afterHandle === undefined ? undefined : ([afterHandle] as const);

  for (const route of routes) {
    /*
     * Module request-scope routes captured their module lifecycle
     * callbacks in their immutable definition-time plan.
     *
     * Scoped plans receive the concrete module scope separately at
     * mount time, so no lifecycle wrapper is needed here.
     */
    if (route.moduleRequestScope !== undefined) {
      continue;
    }

    if (beforeHooks !== undefined) {
      route.beforeHandle = compileBeforeHandle(beforeHooks, route.beforeHandle);

      route.flags |= RUNTIME_ROUTE_BEFORE_HANDLE;
    }

    if (afterHooks !== undefined) {
      route.afterHandle = compileAfterHandle(afterHooks, route.afterHandle);

      route.flags |= RUNTIME_ROUTE_AFTER_HANDLE;
    }
  }
}

function createModuleRef(
  prefix: string,

  routes: ModuleRoutes,

  runtimeRoutes: readonly RuntimeRouteRecord[],

  resolveScope: ModuleScopeResolver<object> | undefined,

  lifecycle: RuntimeModuleLifecycle | undefined,
): AnyModuleRef {
  return {
    prefix,

    routes,

    [moduleRuntimeDefinition]: {
      routes: runtimeRoutes,

      resolveScope,

      lifecycle,
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

function moduleAlreadyMountedError(modulePrefix: string): ModuleMountError {
  return new ModuleMountError(
    "MODULE_ALREADY_MOUNTED",

    `Module "${modulePrefix}" cannot be mounted more than once on the same application`,

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
