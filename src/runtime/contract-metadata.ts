import type {
  OpenAPIPathParameterMetadata,
  OpenAPIQueryMetadata,
  OpenAPIRequestMetadata,
  OpenAPIResponseMetadata,
  OpenAPIResponseMetadataMap,
  OpenAPIRouteMetadata,
} from "../openapi";

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

  return {
    openapi: cloneOpenAPIRouteMetadata(openapi),
  };
}

/*
 * Clone OpenAPI metadata containers while preserving
 * explicit JSON Schema object identity.
 *
 * Metadata is application/tooling state.
 * Schema objects are contract capabilities/resources
 * and intentionally remain references.
 */
export function cloneOpenAPIRouteMetadata(
  openapi: OpenAPIRouteMetadata,
): OpenAPIRouteMetadata {
  const tags = openapi.tags;

  const request = openapi.request;

  const responses = openapi.responses;

  return {
    ...openapi,

    ...(tags === undefined
      ? {}
      : {
          tags: [...tags],
        }),

    ...(request === undefined
      ? {}
      : {
          request: cloneOpenAPIRequestMetadata(request),
        }),

    ...(responses === undefined
      ? {}
      : {
          responses: cloneOpenAPIResponseMetadataMap(responses),
        }),
  };
}

function cloneOpenAPIRequestMetadata(
  request: OpenAPIRequestMetadata,
): OpenAPIRequestMetadata {
  const params = request.params;

  const query = request.query;

  const body = request.body;

  return {
    ...request,

    ...(params === undefined
      ? {}
      : {
          params: cloneOpenAPIPathParameters(params),
        }),

    ...(query === undefined
      ? {}
      : {
          query: cloneOpenAPIQueryMetadata(query),
        }),

    ...(body === undefined
      ? {}
      : {
          body: {
            ...body,
          },
        }),
  };
}

function cloneOpenAPIPathParameters(
  params: Readonly<Record<string, OpenAPIPathParameterMetadata>>,
): Readonly<Record<string, OpenAPIPathParameterMetadata>> {
  const result: Record<string, OpenAPIPathParameterMetadata> = {};

  for (const name of Object.keys(params)) {
    result[name] = {
      ...params[name]!,
    };
  }

  return result;
}

function cloneOpenAPIQueryMetadata(
  query: OpenAPIQueryMetadata,
): OpenAPIQueryMetadata {
  const parameters = query.parameters;

  if (parameters !== undefined) {
    return {
      parameters: parameters.map((parameter) => ({
        ...parameter,
      })),
    };
  }

  const schema = query.schema;

  if (schema !== undefined) {
    return {
      schema,
    };
  }

  return {
    opaque: true,
  };
}

function cloneOpenAPIResponseMetadataMap(
  responses: OpenAPIResponseMetadataMap,
): OpenAPIResponseMetadataMap {
  const result: Record<string, OpenAPIResponseMetadata> = {};

  for (const [status, response] of Object.entries(responses)) {
    result[status] = {
      ...response,
    };
  }

  return result as OpenAPIResponseMetadataMap;
}
