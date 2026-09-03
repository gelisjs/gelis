import type { OpenAPIRouteMetadata } from "../openapi";

export const RUNTIME_ROUTE_CONTRACT_METADATA = Symbol(
  "gelis.runtime.contract-metadata",
);

export interface RuntimeRouteContractMetadata {
  readonly openapi: OpenAPIRouteMetadata | false;
}

export function createRuntimeRouteContractMetadata(
  openapi: OpenAPIRouteMetadata | false | undefined,
): RuntimeRouteContractMetadata | undefined {
  if (openapi === undefined) {
    return undefined;
  }

  if (openapi === false) {
    return {
      openapi: false,
    };
  }

  const tags = openapi.tags;

  return {
    openapi:
      tags === undefined
        ? {
            ...openapi,
          }
        : {
            ...openapi,

            tags: [...tags],
          },
  };
}
