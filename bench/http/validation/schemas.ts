import type { StandardSchemaV1 } from "../../../src";

export interface QueryOutput {
  readonly page: number;

  readonly q: string;
}

export interface BodyOutput {
  readonly name: string;

  readonly count: number;
}

export const querySyncSchema = createSchema<unknown, QueryOutput>((value) =>
  validateQuery(value),
);

export const queryAsyncSchema = createSchema<unknown, QueryOutput>(
  async (value) => validateQuery(value),
);

export const bodySyncSchema = createSchema<unknown, BodyOutput>((value) =>
  validateBody(value),
);

function validateQuery(value: unknown): StandardSchemaV1.Result<QueryOutput> {
  if (typeof value !== "object" || value === null) {
    return {
      issues: [
        {
          message: "Expected query object",
        },
      ],
    };
  }

  const input = value as Record<string, unknown>;

  const page = input.page;

  const q = input.q;

  if (typeof page !== "string") {
    return {
      issues: [
        {
          message: "page must be a string",

          path: ["page"],
        },
      ],
    };
  }

  if (typeof q !== "string") {
    return {
      issues: [
        {
          message: "q must be a string",

          path: ["q"],
        },
      ],
    };
  }

  const parsedPage = Number(page);

  if (!Number.isFinite(parsedPage)) {
    return {
      issues: [
        {
          message: "page must be numeric",

          path: ["page"],
        },
      ],
    };
  }

  return {
    value: {
      page: parsedPage,

      q,
    },
  };
}

function validateBody(value: unknown): StandardSchemaV1.Result<BodyOutput> {
  if (typeof value !== "object" || value === null) {
    return {
      issues: [
        {
          message: "Expected body object",
        },
      ],
    };
  }

  const input = value as Record<string, unknown>;

  const name = input.name;

  const count = input.count;

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

  if (typeof count !== "number") {
    return {
      issues: [
        {
          message: "count must be a number",

          path: ["count"],
        },
      ],
    };
  }

  return {
    value: {
      name,
      count,
    },
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

      vendor: "gelis-benchmark",

      validate,
    },
  } as StandardSchemaV1<Input, Output>;
}
