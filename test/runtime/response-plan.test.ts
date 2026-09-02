import { describe, expect, test } from "bun:test";

import { ResponseContractError } from "../../src";

import type { ResponseContractMap, StandardSchemaV1 } from "../../src";

import {
  createRuntimeResponsePlan,
  RUNTIME_RESPONSE_JSON,
  RUNTIME_RESPONSE_TEXT,
  RUNTIME_RESPONSE_VALIDATE,
} from "../../src/runtime/response-plan";

import { runtimeReply } from "../../src/runtime/response";

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

  test("bypasses the entire plan for raw Response", () => {
    let validations = 0;

    const User = createSchema<
      {
        id: string;
      },
      {
        id: string;
      }
    >((value) => {
      validations++;

      return {
        value: value as {
          id: string;
        },
      };
    });

    const plan = createRuntimeResponsePlan({
      200: {
        schema: User,
        validate: true,
      },
    });

    if (plan === undefined) {
      throw new Error("Expected response plan");
    }

    const raw = new Response("raw", {
      status: 202,
    });

    const result = plan.finalize(raw);

    expect(result).toBe(raw);

    expect(validations).toBe(0);
  });

  test("rejects an undeclared direct managed status", () => {
    const Created = createSchema<{
      id: string;
    }>();

    const plan = createRuntimeResponsePlan({
      201: {
        schema: Created,
        validate: true,
      },
    });

    if (plan === undefined) {
      throw new Error("Expected response plan");
    }

    let thrown: unknown;

    try {
      /*
       * Direct non-undefined values select 200,
       * but this executable contract declares
       * only 201.
       */
      plan.finalize({
        id: "user-1",
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ResponseContractError);

    if (!(thrown instanceof ResponseContractError)) {
      throw new Error("Expected ResponseContractError");
    }

    expect(thrown.code).toBe("RESPONSE_CONTRACT_ERROR");

    expect(thrown.kind).toBe("status");

    expect(thrown.status).toBe(200);
  });

  test("validates and transforms synchronously before AUTO serialization", async () => {
    const User = createSchema<
      {
        name: string;
      },
      {
        name: string;
        normalized: true;
      }
    >((value) => {
      const input = value as {
        name: string;
      };

      return {
        value: {
          name: input.name.trim(),
          normalized: true,
        },
      };
    });

    const plan = createRuntimeResponsePlan({
      200: {
        schema: User,
        validate: true,
      },
    });

    if (plan === undefined) {
      throw new Error("Expected response plan");
    }

    const result = plan.finalize({
      name: " Gelis ",
    });

    /*
     * Synchronous validators must not force the
     * route into Promise execution.
     */
    expect(result).toBeInstanceOf(Response);

    if (!(result instanceof Response)) {
      throw new Error("Expected synchronous Response");
    }

    expect(result.status).toBe(200);

    expect(await result.json()).toEqual({
      name: "Gelis",
      normalized: true,
    });
  });

  test("supports asynchronous response validation", async () => {
    const User = createSchema<
      {
        name: string;
      },
      {
        name: string;
        normalized: true;
      }
    >(async (value) => {
      const input = value as {
        name: string;
      };

      return {
        value: {
          name: input.name.trim(),
          normalized: true,
        },
      };
    });

    const plan = createRuntimeResponsePlan({
      200: {
        schema: User,
        validate: true,
      },
    });

    if (plan === undefined) {
      throw new Error("Expected response plan");
    }

    const response = await plan.finalize({
      name: " Gelis ",
    });

    expect(await response.json()).toEqual({
      name: "Gelis",
      normalized: true,
    });
  });

  test("turns Standard Schema issues into a response contract error", () => {
    const issues = [
      {
        message: "Invalid server output",
      },
    ];

    const User = createSchema<{
      id: string;
    }>(() => ({
      issues,
    }));

    const plan = createRuntimeResponsePlan({
      200: {
        schema: User,
        validate: true,
      },
    });

    if (plan === undefined) {
      throw new Error("Expected response plan");
    }

    let thrown: unknown;

    try {
      plan.finalize({
        id: "invalid",
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ResponseContractError);

    if (!(thrown instanceof ResponseContractError)) {
      throw new Error("Expected ResponseContractError");
    }

    expect(thrown.kind).toBe("validation");

    expect(thrown.status).toBe(200);

    expect(thrown.issues).toBe(issues);

    /*
     * Invalid response data itself must not be
     * retained on the error.
     */
    expect("value" in thrown).toBe(false);
  });

  test("preserves validator throw identity", () => {
    const failure = new Error("schema exploded");

    const User = createSchema<{
      id: string;
    }>(() => {
      throw failure;
    });

    const plan = createRuntimeResponsePlan({
      200: {
        schema: User,
        validate: true,
      },
    });

    if (plan === undefined) {
      throw new Error("Expected response plan");
    }

    let thrown: unknown;

    try {
      plan.finalize({
        id: "user-1",
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(failure);
  });

  test("serializes strings as JSON when JSON is explicit", async () => {
    const Text = createSchema<string>();

    const plan = createRuntimeResponsePlan({
      200: {
        schema: Text,
        serialize: "json",
        contentType: "application/problem+json",
      },
    });

    if (plan === undefined) {
      throw new Error("Expected response plan");
    }

    const response = await plan.finalize("hello");

    expect(response.status).toBe(200);

    expect(response.headers.get("content-type")).toBe(
      "application/problem+json",
    );

    /*
     * Explicit JSON means a JSON string,
     * not text/plain.
     */
    expect(await response.text()).toBe('"hello"');
  });

  test("uses strict text serialization without coercion", async () => {
    const Text = createSchema<string>();

    const plan = createRuntimeResponsePlan({
      200: {
        schema: Text,
        serialize: "text",
      },
    });

    if (plan === undefined) {
      throw new Error("Expected response plan");
    }

    const response = await plan.finalize("hello");

    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );

    expect(await response.text()).toBe("hello");

    let thrown: unknown;

    try {
      /*
       * Runtime JavaScript / unsafe casts can still
       * violate TypeScript. The serializer must not
       * silently String(42).
       */
      plan.finalize(42);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ResponseContractError);

    if (!(thrown instanceof ResponseContractError)) {
      throw new Error("Expected ResponseContractError");
    }

    expect(thrown.kind).toBe("serialization");

    expect(thrown.status).toBe(200);
  });

  test("keeps metadata-only statuses legal inside an executable plan", async () => {
    const User = createSchema<{
      id: string;
    }>();

    const Text = createSchema<string>();

    const plan = createRuntimeResponsePlan({
      200: {
        schema: User,
        validate: true,
      },

      201: Text,
    });

    if (plan === undefined) {
      throw new Error("Expected response plan");
    }

    const response = await plan.finalize(runtimeReply.status(201, "created"));

    expect(response.status).toBe(201);

    expect(await response.text()).toBe("created");

    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
  });

  test("keeps direct undefined mapped to declared 204", async () => {
    const User = createSchema<{
      id: string;
    }>();

    const plan = createRuntimeResponsePlan({
      200: {
        schema: User,
        validate: true,
      },

      204: undefined,
    });

    if (plan === undefined) {
      throw new Error("Expected response plan");
    }

    const response = await plan.finalize(undefined);

    expect(response.status).toBe(204);

    expect(await response.text()).toBe("");
  });
});

function createSchema<Input = unknown, Output = Input>(
  validate: (
    value: unknown,
  ) =>
    | StandardSchemaV1.Result<Output>
    | Promise<StandardSchemaV1.Result<Output>> = (value) => ({
    value: value as Output,
  }),
): StandardSchemaV1<Input, Output> {
  return {
    "~standard": {
      version: 1,

      vendor: "gelis-test",

      validate,
    },
  } as StandardSchemaV1<Input, Output>;
}
