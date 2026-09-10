import type { ResponseContractMap } from "../route";

import { RUNTIME_ROUTE_CONTRACT_METADATA } from "./contract-metadata";

import type { RuntimeRouteContractMetadata } from "./contract-metadata";

import type { RuntimeInputPlan } from "./input";

import type { RuntimeResponsePlan } from "./response-plan";

export const RUNTIME_ROUTE_PLAIN = 0;

export const RUNTIME_ROUTE_INPUT = 1;

export const RUNTIME_ROUTE_BEFORE_HANDLE = 2;

export const RUNTIME_ROUTE_AFTER_HANDLE = 4;

export const RUNTIME_ROUTE_RESPONSE = 8;

export const RUNTIME_ROUTE_REQUEST_SCOPE = 16;

export const RUNTIME_ROUTE_MODULE_REQUEST_SCOPE = 32;

export const RUNTIME_ROUTE_INPUT_BEFORE_HANDLE =
  RUNTIME_ROUTE_INPUT | RUNTIME_ROUTE_BEFORE_HANDLE;

export const RUNTIME_ROUTE_INPUT_AFTER_HANDLE =
  RUNTIME_ROUTE_INPUT | RUNTIME_ROUTE_AFTER_HANDLE;

export const RUNTIME_ROUTE_BEFORE_AFTER_HANDLE =
  RUNTIME_ROUTE_BEFORE_HANDLE | RUNTIME_ROUTE_AFTER_HANDLE;

export const RUNTIME_ROUTE_INPUT_BEFORE_AFTER_HANDLE =
  RUNTIME_ROUTE_INPUT |
  RUNTIME_ROUTE_BEFORE_HANDLE |
  RUNTIME_ROUTE_AFTER_HANDLE;

export const RUNTIME_ROUTE_INPUT_RESPONSE =
  RUNTIME_ROUTE_INPUT | RUNTIME_ROUTE_RESPONSE;

export const RUNTIME_ROUTE_BEFORE_HANDLE_RESPONSE =
  RUNTIME_ROUTE_BEFORE_HANDLE | RUNTIME_ROUTE_RESPONSE;

export const RUNTIME_ROUTE_INPUT_BEFORE_HANDLE_RESPONSE =
  RUNTIME_ROUTE_INPUT | RUNTIME_ROUTE_BEFORE_HANDLE | RUNTIME_ROUTE_RESPONSE;

export const RUNTIME_ROUTE_AFTER_HANDLE_RESPONSE =
  RUNTIME_ROUTE_AFTER_HANDLE | RUNTIME_ROUTE_RESPONSE;

export const RUNTIME_ROUTE_INPUT_AFTER_HANDLE_RESPONSE =
  RUNTIME_ROUTE_INPUT | RUNTIME_ROUTE_AFTER_HANDLE | RUNTIME_ROUTE_RESPONSE;

export const RUNTIME_ROUTE_BEFORE_AFTER_HANDLE_RESPONSE =
  RUNTIME_ROUTE_BEFORE_HANDLE |
  RUNTIME_ROUTE_AFTER_HANDLE |
  RUNTIME_ROUTE_RESPONSE;

export const RUNTIME_ROUTE_INPUT_BEFORE_AFTER_HANDLE_RESPONSE =
  RUNTIME_ROUTE_INPUT |
  RUNTIME_ROUTE_BEFORE_HANDLE |
  RUNTIME_ROUTE_AFTER_HANDLE |
  RUNTIME_ROUTE_RESPONSE;

export interface RuntimeReply {
  status(status: number, body: unknown): unknown;
}

export interface RuntimeRouteContext {
  request: Request;

  params: Record<string, string>;

  query: unknown;

  body: unknown;

  reply: RuntimeReply;
}

export type RuntimeRouteHandler = (
  context: RuntimeRouteContext,
) => unknown | Promise<unknown>;

export type RuntimeBeforeHandle = (
  context: RuntimeRouteContext,
) => unknown | PromiseLike<unknown>;

export type RuntimeAfterHandle = (
  context: RuntimeRouteContext,

  result: unknown,
) => void | PromiseLike<void>;

export type RuntimeRequestScopeDerive = (
  context: RuntimeRouteContext,
) => unknown | PromiseLike<unknown>;

export type RuntimeRequestScopeHandler = (
  context: RuntimeRouteContext,

  scope: unknown,
) => unknown;

export type RuntimeRequestScopeBeforeHandle = (
  context: RuntimeRouteContext,

  scope: unknown,
) => unknown | PromiseLike<unknown>;

export type RuntimeRequestScopeAfterHandle = (
  context: RuntimeRouteContext,

  result: unknown,

  scope: unknown,
) => void | PromiseLike<void>;

export interface RuntimeRequestScopePlan {
  readonly derive: RuntimeRequestScopeDerive;

  readonly beforeHandle: RuntimeRequestScopeBeforeHandle | undefined;

  readonly afterHandle: RuntimeRequestScopeAfterHandle | undefined;
}

export type RuntimeStaticModuleRequestScopeDerive = (
  context: RuntimeRouteContext,
) => unknown | PromiseLike<unknown>;

export type RuntimeScopedModuleRequestScopeDerive = (
  context: RuntimeRouteContext,

  moduleScope: object,
) => unknown | PromiseLike<unknown>;

export type RuntimeStaticModuleRequestScopeHandler = (
  context: RuntimeRouteContext,

  requestScope: unknown,
) => unknown;

export type RuntimeScopedModuleRequestScopeHandler = (
  context: RuntimeRouteContext,

  moduleScope: object,

  requestScope: unknown,
) => unknown;

export type RuntimeStaticModuleRequestScopeBeforeHandle = (
  context: RuntimeRouteContext,

  requestScope: unknown,
) => unknown | PromiseLike<unknown>;

export type RuntimeScopedModuleRequestScopeBeforeHandle = (
  context: RuntimeRouteContext,

  moduleScope: object,

  requestScope: unknown,
) => unknown | PromiseLike<unknown>;

export type RuntimeStaticModuleRequestScopeAfterHandle = (
  context: RuntimeRouteContext,

  result: unknown,

  requestScope: unknown,
) => void | PromiseLike<void>;

export type RuntimeScopedModuleRequestScopeAfterHandle = (
  context: RuntimeRouteContext,

  result: unknown,

  moduleScope: object,

  requestScope: unknown,
) => void | PromiseLike<void>;

export type RuntimeScopedModuleBeforeHandle = (
  context: RuntimeRouteContext,

  moduleScope: object,
) => unknown | PromiseLike<unknown>;

export type RuntimeScopedModuleAfterHandle = (
  context: RuntimeRouteContext,

  result: unknown,

  moduleScope: object,
) => void | PromiseLike<void>;

export interface RuntimeStaticModuleRequestScopePlan {
  readonly kind: "static";

  readonly derive: RuntimeStaticModuleRequestScopeDerive;

  readonly beforeHandle:
    RuntimeStaticModuleRequestScopeBeforeHandle | undefined;

  readonly afterHandle: RuntimeStaticModuleRequestScopeAfterHandle | undefined;

  readonly moduleBeforeHandle: RuntimeBeforeHandle | undefined;

  readonly moduleAfterHandle: RuntimeAfterHandle | undefined;
}

export interface RuntimeScopedModuleRequestScopePlan {
  readonly kind: "scoped";

  readonly derive: RuntimeScopedModuleRequestScopeDerive;

  readonly beforeHandle:
    RuntimeScopedModuleRequestScopeBeforeHandle | undefined;

  readonly afterHandle: RuntimeScopedModuleRequestScopeAfterHandle | undefined;

  readonly moduleBeforeHandle: RuntimeScopedModuleBeforeHandle | undefined;

  readonly moduleAfterHandle: RuntimeScopedModuleAfterHandle | undefined;
}

export type RuntimeModuleRequestScopePlan =
  RuntimeStaticModuleRequestScopePlan | RuntimeScopedModuleRequestScopePlan;

export interface RuntimeRouteRecord {
  readonly method: string;

  readonly path: string;

  /*
   * Optional registration metadata used only by
   * explicit contract/tooling inspection.
   *
   * The symbol-keyed property exists only on routes
   * that declare contract metadata.
   *
   * It is deliberately enumerable so module route
   * templates preserve it through object spread.
   */
  readonly [RUNTIME_ROUTE_CONTRACT_METADATA]?: RuntimeRouteContractMetadata;

  readonly handler: RuntimeRouteHandler;

  /*
   * Lifecycle execution fields are mutable
   * deliberately.
   *
   * Gelis recompiles effective lifecycle plans
   * at configuration time when global hooks
   * are added.
   */
  flags: number;

  readonly input: RuntimeInputPlan | undefined;

  /*
   * Present only when at least one declared response
   * entry activates executable response behavior.
   *
   * Metadata-only and plain routes deliberately omit
   * this property so their runtime record shape does
   * not gain response-plan state unnecessarily.
   */
  readonly responsePlan?: RuntimeResponsePlan;

  /*
   * Present only on ordinary request-scoped routes.
   *
   * Ordinary non-scoped routes deliberately omit this
   * property so their runtime object shape remains unchanged.
   */
  readonly requestScope?: RuntimeRequestScopePlan;

  /*
   * Present only on request-scoped routes declared by
   * ModuleRouteBuilder / ModuleScopeBuilder.
   *
   * The immutable callback plan is created at module definition
   * time. Scoped modules bind only the concrete moduleScope
   * reference when the module is mounted.
   */
  readonly moduleRequestScope?: RuntimeModuleRequestScopePlan;

  readonly moduleScope?: object;

  beforeHandle: RuntimeBeforeHandle | undefined;

  afterHandle: RuntimeAfterHandle | undefined;

  readonly responses: ResponseContractMap | undefined;
}

export type RuntimeRouteRegister = (route: RuntimeRouteRecord) => void;
