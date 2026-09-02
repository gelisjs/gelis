import { describe, expect, test } from "bun:test";

import type { ResponseContractMap, StandardSchemaV1 } from "../../src";

import {
  createRuntimeResponsePlan,
  RUNTIME_RESPONSE_JSON,
  RUNTIME_RESPONSE_TEXT,
  RUNTIME_RESPONSE_VALIDATE,
} from "../../src/runtime/response-plan";

describe("Gelis response plan compilation", () => {
  test("does not create a plan without response contracts", () => {
    expect(createRuntimeResponsePlan(undefined)).toBeUndefined();
  });

  test("does not create a plan for metadata-only response contracts", () => {
    const User = createSchema<{
      id: string;
    }>();

    const responses = {
      200: User,
      204: undefined,
    } satisfies ResponseContractMap;

    expect(createRuntimeResponsePlan(responses)).toBeUndefined();
  });

  test("compiles the complete status contract when validation is executable", () => {
    const User = createSchema<{
      id: string;
    }>();

    const NotFound = createSchema<{
      code: "NOT_FOUND";
    }>();

    const responses = {
      200: User,

      404: {
        schema: NotFound,
        validate: true,
      },

      204: undefined,
    } satisfies ResponseContractMap;

    const plan = createRuntimeResponsePlan(responses);

    expect(plan).toBeDefined();

    expect(plan?.entries).toHaveLength(3);

    expect(plan?.entries[0]).toEqual({
      status: 200,
      flags: 0,
      schema: User,
      contentType: undefined,
    });

    expect(plan?.entries[1]).toEqual({
      status: 204,
      flags: 0,
      schema: undefined,
      contentType: undefined,
    });

    expect(plan?.entries[2]).toEqual({
      status: 404,
      flags: RUNTIME_RESPONSE_VALIDATE,
      schema: NotFound,
      contentType: undefined,
    });
  });

  test("compiles explicit JSON and text serializers", () => {
    const User = createSchema<{
      id: string;
    }>();

    const Text = createSchema<string>();

    const responses = {
      200: {
        schema: User,
        serialize: "json",
        validate: true,
        contentType: "application/problem+json",
      },

      201: {
        schema: Text,
        serialize: "text",
      },
    } satisfies ResponseContractMap;

    const plan = createRuntimeResponsePlan(responses);

    expect(plan).toBeDefined();

    expect(plan?.entries).toHaveLength(2);

    expect(plan?.entries[0]).toEqual({
      status: 200,
      flags: RUNTIME_RESPONSE_VALIDATE | RUNTIME_RESPONSE_JSON,
      schema: User,
      contentType: "application/problem+json",
    });

    expect(plan?.entries[1]).toEqual({
      status: 201,
      flags: RUNTIME_RESPONSE_TEXT,
      schema: Text,
      contentType: undefined,
    });
  });
});

function createSchema<Input = unknown, Output = Input>(): StandardSchemaV1<
  Input,
  Output
> {
  return {
    "~standard": {
      version: 1,

      vendor: "gelis-test",

      validate(value) {
        return {
          value: value as Output,
        };
      },
    },
  } as StandardSchemaV1<Input, Output>;
}
