export { Gelis } from "./app";

export { defineCapability, definePlugin, PluginInstallError } from "./plugin";

export type {
  Capability,
  Plugin,
  PluginInstallErrorCode,
  PluginRouteBuilder,
  PluginSetup,
  PluginSetupContext,
} from "./plugin";

export type {
  ApplicationScopeBuilder,
  ApplicationScopeHandler,
  ApplicationScopeLifecycleFor,
} from "./application-scope";

export type {
  RequestScopeBuilder,
  RequestScopeDerive,
  RequestScopeDeriveContext,
  RequestScopeHandler,
  RequestScopeLifecycleFor,
} from "./request-scope";

export { inspectContract } from "./contract-source";

export type {
  ApplicationContractSnapshot,
  ContractRouteSnapshot,
} from "./contract-source";

export { defineContract } from "./contract";

export { defineModule, ModuleMountError } from "./module";

export { ResponseContractError } from "./error";

export type {
  StandardJSONSchemaV1,
  StandardSchemaV1,
  StandardTypedV1,
} from "./schema";

export type {
  OpenAPIJSONSchema,
  OpenAPIPathParameterMetadata,
  OpenAPIQueryMetadata,
  OpenAPIQueryParameter,
  OpenAPIRequestBodyMetadata,
  OpenAPIRequestMetadata,
  OpenAPIResponseMetadata,
  OpenAPIResponseMetadataMap,
  OpenAPIRouteMetadata,
} from "./openapi";

export type {
  GlobalAfterHandle,
  GlobalBeforeHandle,
  GlobalRouteContext,
  HttpMethod,
  ResponseContract,
  ResponseContractMap,
  ResponseDescriptor,
  RouteAfterHandle,
  RouteBeforeHandle,
  RouteContext,
  RouteContractOf,
  RouteLifecycleFor,
  RouteRef,
  RouteRequestContract,
} from "./route";

export type {
  ModuleContractOf,
  ModuleLifecycle,
  ModuleMountErrorCode,
  ModuleRef,
  ModuleScopeLifecycle,
  ModuleScopeResolver,
  ModuleSetupContext,
} from "./module";

export type {
  ApiContractOf,
  ApiContractRef,
  AnyApiContractRef,
} from "./contract";

export type { InferPathParams } from "./types/path";

export type { OnRequest, OnRequestContext } from "./request";

export type {
  OnError,
  OnErrorContext,
  ResponseContractErrorKind,
  ResponseContractErrorOptions,
} from "./error";
