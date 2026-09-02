import { Gelis } from "../../src";

import type {
  ResponseContractMap,
  RouteContractOf,
  StandardSchemaV1,
} from "../../src";

import type { Equal, Expect } from "./assert";

declare const User: StandardSchemaV1<{
  id: string;
  name: string;
}>;

declare const NotFound: StandardSchemaV1<{
  code: "NOT_FOUND";
}>;

declare const TransformUser: StandardSchemaV1<
  {
    id: string;
    name: string;
  },
  {
    id: string;
    name: string;
    normalized: true;
  }
>;

declare const TextValue: StandardSchemaV1<string>;

declare const UndefinedOutput: StandardSchemaV1<string, undefined>;

declare const MaybeUndefinedOutput: StandardSchemaV1<
  string,
  string | undefined
>;

declare const NullOutput: StandardSchemaV1<unknown, null>;

const contractOnly = {
  200: User,
  404: NotFound,
  204: undefined,
} satisfies ResponseContractMap;

void contractOnly;

/*
 * null remains a legitimate body-bearing JSON value.
 */
const nullContract = {
  200: NullOutput,
} satisfies ResponseContractMap;

void nullContract;

/*
 * A schema entry always represents a body-bearing
 * response. Top-level undefined must use the explicit
 * `undefined` response entry instead.
 */
const undefinedSchemaOutput = {
  // @ts-expect-error response schema output cannot be top-level undefined
  200: UndefinedOutput,
} satisfies ResponseContractMap;

void undefinedSchemaOutput;

/*
 * A body-bearing schema also cannot merely include
 * undefined as one possible top-level output.
 */
const maybeUndefinedSchemaOutput = {
  // @ts-expect-error response schema output cannot include top-level undefined
  200: MaybeUndefinedOutput,
} satisfies ResponseContractMap;

void maybeUndefinedSchemaOutput;

/*
 * Validation does not turn an undefined schema output
 * into a bodyless response contract.
 */
const undefinedValidatedOutput = {
  // @ts-expect-error validated response schema must remain body-bearing
  200: { schema: UndefinedOutput, validate: true },
} satisfies ResponseContractMap;

void undefinedValidatedOutput;

/*
 * Explicit JSON serialization has the same invariant.
 */
const undefinedJsonOutput = {
  // @ts-expect-error serialized response schema must remain body-bearing
  200: { schema: MaybeUndefinedOutput, serialize: "json" },
} satisfies ResponseContractMap;

void undefinedJsonOutput;

const app = new Gelis();

app.get(
  "/null-response",
  {
    responses: {
      200: NullOutput,
    },
  },
  () => null,
);

const contractRoute = app.get(
  "/contract",
  {
    responses: {
      200: User,
      404: NotFound,
      204: undefined,
    },
  },
  ({ reply }) => {
    if (Math.random() > 0.5) {
      return reply.status(200, {
        id: "user-1",
        name: "John",
      });
    }

    if (Math.random() > 0.5) {
      return reply.status(404, {
        code: "NOT_FOUND",
      });
    }

    return reply.status(204);
  },
);

type ContractRoute = RouteContractOf<typeof contractRoute>;

type ContractResponses = Expect<
  Equal<
    ContractRoute["responses"],
    {
      200: {
        id: string;
        name: string;
      };

      404: {
        code: "NOT_FOUND";
      };

      204: undefined;
    }
  >
>;

app.get(
  "/validated",
  {
    responses: {
      200: {
        schema: TransformUser,
        validate: true,
      },
    },
  },
  ({ reply }) => {
    /*
     * Validation-enabled response producers use
     * Standard Schema Input.
     *
     * `normalized` is intentionally absent here.
     */
    return reply.status(200, {
      id: "user-1",
      name: "John",
    });
  },
);

const validatedRoute = app.get(
  "/validated-contract",
  {
    responses: {
      200: {
        schema: TransformUser,
        validate: true,
      },
    },
  },
  ({ reply }) =>
    reply.status(200, {
      id: "user-1",
      name: "John",
    }),
);

type ValidatedContract = RouteContractOf<typeof validatedRoute>;

type ValidatedWireResponse = Expect<
  Equal<
    ValidatedContract["responses"],
    {
      200: {
        id: string;
        name: string;
        normalized: true;
      };
    }
  >
>;

app.get(
  "/validated-lifecycle",
  {
    responses: {
      200: {
        schema: TransformUser,
        validate: true,
      },
    },
  },
  ({ reply }) =>
    reply.status(200, {
      id: "handler",
      name: "Handler",
    }),
  {
    beforeHandle: ({ reply }) => {
      /*
       * beforeHandle bypasses executable response
       * validation, so lifecycle reply uses wire
       * output rather than producer input.
       */
      return reply.status(200, {
        id: "early",
        name: "Early",
        normalized: true,
      });
    },
  },
);

app.get(
  "/json",
  {
    responses: {
      200: {
        schema: User,
        serialize: "json",
      },

      400: {
        schema: NotFound,
        serialize: "json",
        contentType: "application/problem+json",
      },
    },
  },
  ({ reply }) =>
    reply.status(200, {
      id: "user-1",
      name: "John",
    }),
);

app.get(
  "/text",
  {
    responses: {
      200: {
        schema: TextValue,
        serialize: "text",
      },
    },
  },
  ({ reply }) => reply.status(200, "hello"),
);

app.get(
  "/invalid-bodyless-body",
  {
    responses: {
      204: undefined,
    },
  },
  ({ reply }) => {
    // @ts-expect-error bodyless status accepts no body argument
    return reply.status(204, undefined);
  },
);

app.get(
  "/invalid-body-required",
  {
    responses: {
      200: User,
    },
  },
  ({ reply }) => {
    // @ts-expect-error body-bearing status requires a body
    return reply.status(200);
  },
);

const invalid204 = {
  // @ts-expect-error 204 cannot have a body-bearing schema
  204: User,
} satisfies ResponseContractMap;

void invalid204;

const invalid205 = {
  // @ts-expect-error 205 cannot have a body-bearing schema
  205: User,
} satisfies ResponseContractMap;

void invalid205;

const invalid304 = {
  // @ts-expect-error 304 cannot have a body-bearing schema
  304: User,
} satisfies ResponseContractMap;

void invalid304;

const uselessDescriptor = {
  // @ts-expect-error descriptor requires validation or serializer behavior
  200: {
    schema: User,

    // No executable response behavior.
  },
} satisfies ResponseContractMap;

void uselessDescriptor;

const contentTypeWithoutSerializer = {
  // @ts-expect-error contentType requires an explicit serializer
  400: {
    schema: NotFound,
    contentType: "application/problem+json",
  },
} satisfies ResponseContractMap;

void contentTypeWithoutSerializer;

const objectAsText = {
  // @ts-expect-error text serializer requires string schema output
  200: {
    schema: User,
    serialize: "text",
  },
} satisfies ResponseContractMap;

void objectAsText;

export type { ContractResponses, ValidatedWireResponse };
