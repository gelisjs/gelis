export type OpenAPIJSONSchema = boolean | Readonly<Record<string, unknown>>;

export interface OpenAPIPathParameterMetadata {
  readonly description?: string;

  readonly schema?: OpenAPIJSONSchema;

  readonly deprecated?: boolean;
}

export interface OpenAPIQueryParameter {
  readonly name: string;

  readonly description?: string;

  readonly required?: boolean;

  readonly deprecated?: boolean;

  readonly schema?: OpenAPIJSONSchema;

  readonly style?: "form" | "spaceDelimited" | "pipeDelimited" | "deepObject";

  readonly explode?: boolean;
}

type OpenAPIQuerySchemaMetadata = {
  readonly schema: OpenAPIJSONSchema;

  readonly parameters?: never;

  readonly opaque?: never;
};

type OpenAPIExplicitQueryMetadata = {
  readonly parameters: readonly OpenAPIQueryParameter[];

  readonly schema?: never;

  readonly opaque?: never;
};

type OpenAPIOpaqueQueryMetadata = {
  readonly opaque: true;

  readonly schema?: never;

  readonly parameters?: never;
};

export type OpenAPIQueryMetadata =
  | OpenAPIQuerySchemaMetadata
  | OpenAPIExplicitQueryMetadata
  | OpenAPIOpaqueQueryMetadata;

type OpenAPISchemaMetadata =
  | {
      readonly schema?: OpenAPIJSONSchema;

      readonly opaque?: never;
    }
  | {
      readonly opaque: true;

      readonly schema?: never;
    };

export type OpenAPIRequestBodyMetadata = OpenAPISchemaMetadata & {
  readonly description?: string;

  readonly mediaType?: string;

  readonly required?: boolean;
};

export interface OpenAPIRequestMetadata {
  readonly params?: Readonly<Record<string, OpenAPIPathParameterMetadata>>;

  readonly query?: OpenAPIQueryMetadata;

  readonly body?: OpenAPIRequestBodyMetadata;
}

export type OpenAPIResponseMetadata = OpenAPISchemaMetadata & {
  readonly description?: string;

  readonly mediaType?: string;
};

export type OpenAPIResponseMetadataMap = Readonly<
  Record<number, OpenAPIResponseMetadata> & {
    readonly default?: OpenAPIResponseMetadata;
  }
>;

export interface OpenAPIRouteMetadata {
  readonly summary?: string;

  readonly description?: string;

  readonly operationId?: string;

  readonly tags?: readonly string[];

  readonly deprecated?: boolean;

  readonly request?: OpenAPIRequestMetadata;

  readonly responses?: OpenAPIResponseMetadataMap;
}
