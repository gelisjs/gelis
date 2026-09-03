export { Gelis } from "./app";

export { defineContract } from "./contract";

export { defineModule } from "./module";

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

export type { ModuleContractOf, ModuleRef } from "./module";

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
