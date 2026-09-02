import type { StandardSchemaV1 } from "../../../src";

export interface Payload {
  readonly id: string;

  readonly name: string;
}

export interface ValidationInput {
  readonly id: string;

  readonly name: string;
}

export interface ValidatedPayload {
  readonly id: string;

  readonly name: string;

  readonly normalized: true;
}

export const PAYLOAD = {
  id: "user-1",

  name: "Gelis",
} satisfies Payload;

export const VALIDATION_INPUT = {
  id: "user-1",

  name: " Gelis ",
} satisfies ValidationInput;

export const TEXT = "created";

export const payloadSchema = createSchema<Payload, Payload>(validatePayload);

export const textSchema = createSchema<string, string>(validateText);

export const validationSchema = createSchema<ValidationInput, ValidatedPayload>(
  validateOutput,
);

export function validateOutput(
  value: unknown,
): StandardSchemaV1.Result<ValidatedPayload> {
  if (typeof value !== "object" || value === null) {
    return {
      issues: [
        {
          message: "Expected response object",
        },
      ],
    };
  }

  const input = value as Record<string, unknown>;

  const id = input.id;

  const name = input.name;

  if (typeof id !== "string") {
    return {
      issues: [
        {
          message: "id must be a string",

          path: ["id"],
        },
      ],
    };
  }

  if (typeof name !== "string") {
    return {
      issues: [
        {
          message: "name must be a string",

          path: ["name"],
        },
      ],
    };
  }

  return {
    value: {
      id,

      name: name.trim(),

      normalized: true,
    },
  };
}

function validatePayload(value: unknown): StandardSchemaV1.Result<Payload> {
  if (typeof value !== "object" || value === null) {
    return {
      issues: [
        {
          message: "Expected payload object",
        },
      ],
    };
  }

  const input = value as Record<string, unknown>;

  const id = input.id;

  const name = input.name;

  if (typeof id !== "string") {
    return {
      issues: [
        {
          message: "id must be a string",

          path: ["id"],
        },
      ],
    };
  }

  if (typeof name !== "string") {
    return {
      issues: [
        {
          message: "name must be a string",

          path: ["name"],
        },
      ],
    };
  }

  return {
    value: {
      id,

      name,
    },
  };
}

function validateText(value: unknown): StandardSchemaV1.Result<string> {
  if (typeof value !== "string") {
    return {
      issues: [
        {
          message: "Expected response string",
        },
      ],
    };
  }

  return {
    value,
  };
}

function createSchema<Input, Output>(
  validate: (
    value: unknown,
  ) =>
    | StandardSchemaV1.Result<Output>
    | Promise<StandardSchemaV1.Result<Output>>,
): StandardSchemaV1<Input, Output> {
  return {
    "~standard": {
      version: 1,

      vendor: "gelis-response-benchmark",

      validate,
    },
  } as StandardSchemaV1<Input, Output>;
}
