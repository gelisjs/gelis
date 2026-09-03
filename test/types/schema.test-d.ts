import type {
  StandardJSONSchemaV1,
  StandardSchemaV1,
  StandardTypedV1,
} from "../../src";

import type { Equal, Expect } from "./assert";

/*
 * StandardTypedV1 is the shared type-information
 * capability used by the validation and JSON Schema
 * specifications.
 */
declare const Typed: StandardTypedV1<
  {
    raw: string;
  },
  {
    normalized: number;
  }
>;

type TypedInput = StandardTypedV1.InferInput<typeof Typed>;

type TypedOutput = StandardTypedV1.InferOutput<typeof Typed>;

type _TypedInput = Expect<
  Equal<
    TypedInput,
    {
      raw: string;
    }
  >
>;

type _TypedOutput = Expect<
  Equal<
    TypedOutput,
    {
      normalized: number;
    }
  >
>;

/*
 * Existing Standard Schema Input / Output inference
 * must remain unchanged after moving shared typed
 * properties into StandardTypedV1.
 */
declare const ValidationSchema: StandardSchemaV1<
  {
    id: string;
  },
  {
    id: number;
  }
>;

type ValidationInput = StandardSchemaV1.InferInput<typeof ValidationSchema>;

type ValidationOutput = StandardSchemaV1.InferOutput<typeof ValidationSchema>;

type _ValidationInput = Expect<
  Equal<
    ValidationInput,
    {
      id: string;
    }
  >
>;

type _ValidationOutput = Expect<
  Equal<
    ValidationOutput,
    {
      id: number;
    }
  >
>;

/*
 * Standard JSON Schema independently exposes the
 * same Input / Output type information.
 */
declare const JSONSchema: StandardJSONSchemaV1<
  {
    id: string;
  },
  {
    id: number;
  }
>;

type JSONSchemaInput = StandardJSONSchemaV1.InferInput<typeof JSONSchema>;

type JSONSchemaOutput = StandardJSONSchemaV1.InferOutput<typeof JSONSchema>;

type _JSONSchemaInput = Expect<
  Equal<
    JSONSchemaInput,
    {
      id: string;
    }
  >
>;

type _JSONSchemaOutput = Expect<
  Equal<
    JSONSchemaOutput,
    {
      id: number;
    }
  >
>;

/*
 * Standard Schema and Standard JSON Schema are
 * orthogonal structural capabilities.
 *
 * A single entity can implement both by combining
 * their properties under the same "~standard"
 * object.
 */
interface CombinedProps
  extends
    StandardSchemaV1.Props<string, number>,
    StandardJSONSchemaV1.Props<string, number> {}

interface CombinedSchema {
  readonly "~standard": CombinedProps;
}

declare const Combined: CombinedSchema;

const validationCapability: StandardSchemaV1<string, number> = Combined;

const jsonSchemaCapability: StandardJSONSchemaV1<string, number> = Combined;

void validationCapability;
void jsonSchemaCapability;

/*
 * The converter target keeps the standardized known
 * targets while remaining forward-compatible with
 * future target strings.
 */
const draft202012: StandardJSONSchemaV1.Target = "draft-2020-12";

const draft07: StandardJSONSchemaV1.Target = "draft-07";

const openapi30: StandardJSONSchemaV1.Target = "openapi-3.0";

const futureTarget: StandardJSONSchemaV1.Target = "draft-future";

void draft202012;
void draft07;
void openapi30;
void futureTarget;

/*
 * Converter methods expose the standardized options
 * and JSON object result shape.
 */
const inputJSONSchema: Record<string, unknown> = JSONSchema[
  "~standard"
].jsonSchema.input({
  target: "draft-2020-12",
});

const outputJSONSchema: Record<string, unknown> = JSONSchema[
  "~standard"
].jsonSchema.output({
  target: "draft-2020-12",

  libraryOptions: {
    mode: "strict",
  },
});

void inputJSONSchema;
void outputJSONSchema;
