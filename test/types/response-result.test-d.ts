import { Gelis } from "../../src";

import type { RouteContractOf, StandardSchemaV1 } from "../../src";

import type { Equal, Expect } from "./assert";

declare const User: StandardSchemaV1<{
  id: string;
  name: string;
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

const app = new Gelis();

/*
 * Implicit non-undefined values map to 200.
 */
const implicitObject = app.get("/implicit-object", () => ({
  ok: true,
  count: 1,
}));

type ImplicitObjectContract = RouteContractOf<typeof implicitObject>;

type ImplicitObjectResponse = Expect<
  Equal<
    ImplicitObjectContract["responses"],
    {
      200: {
        ok: boolean;
        count: number;
      };
    }
  >
>;

/*
 * Direct undefined maps to 204.
 */
const implicitUndefined = app.get("/implicit-undefined", () => undefined);

type ImplicitUndefinedContract = RouteContractOf<typeof implicitUndefined>;

type ImplicitUndefinedResponse = Expect<
  Equal<
    ImplicitUndefinedContract["responses"],
    {
      204: undefined;
    }
  >
>;

/*
 * void-producing handlers also map to 204.
 */
const implicitVoid = app.get("/implicit-void", () => {
  return;
});

type ImplicitVoidContract = RouteContractOf<typeof implicitVoid>;

type ImplicitVoidResponse = Expect<
  Equal<
    ImplicitVoidContract["responses"],
    {
      204: undefined;
    }
  >
>;

/*
 * A managed union reflects both runtime statuses.
 */
const implicitUnion = app.get("/implicit-union", () =>
  Math.random() > 0.5
    ? {
        ok: true,
      }
    : undefined,
);

type ImplicitUnionContract = RouteContractOf<typeof implicitUnion>;

type ImplicitUnionResponse = Expect<
  Equal<
    ImplicitUnionContract["responses"],
    {
      200: {
        ok: boolean;
      };
      204: undefined;
    }
  >
>;

/*
 * Awaited handler results use the same inference.
 */
const implicitAsyncUndefined = app.get(
  "/implicit-async-undefined",
  async () => undefined,
);

type ImplicitAsyncUndefinedContract = RouteContractOf<
  typeof implicitAsyncUndefined
>;

type ImplicitAsyncUndefinedResponse = Expect<
  Equal<
    ImplicitAsyncUndefinedContract["responses"],
    {
      204: undefined;
    }
  >
>;

/*
 * Raw Response owns arbitrary HTTP status/body semantics,
 * so implicit public contracts become opaque.
 */
const implicitRawResponse = app.get(
  "/implicit-response",
  () =>
    new Response("partial", {
      status: 206,
    }),
);

type ImplicitRawResponseContract = RouteContractOf<typeof implicitRawResponse>;

type ImplicitRawResponse = Expect<
  Equal<
    ImplicitRawResponseContract["responses"],
    Readonly<Record<number, unknown>>
  >
>;

/*
 * A union containing raw Response is also opaque.
 */
const implicitMixedRaw = app.get("/implicit-mixed-response", () =>
  Math.random() > 0.5
    ? {
        ok: true,
      }
    : new Response(null, {
        status: 304,
      }),
);

type ImplicitMixedRawContract = RouteContractOf<typeof implicitMixedRaw>;

type ImplicitMixedRawResponse = Expect<
  Equal<
    ImplicitMixedRawContract["responses"],
    Readonly<Record<number, unknown>>
  >
>;

/*
 * Explicit status 200 permits a matching direct body.
 */
app.get(
  "/explicit-direct-200",
  {
    responses: {
      200: User,
    },
  },
  () => ({
    id: "user-1",
    name: "John",
  }),
);

/*
 * Validated direct result uses Schema Input.
 */
app.get(
  "/explicit-validated-direct",
  {
    responses: {
      200: {
        schema: TransformUser,
        validate: true,
      },
    },
  },
  () => ({
    id: "user-1",
    name: "John",
  }),
);

/*
 * Contract-only direct result must already be Schema Output.
 */
app.get(
  "/explicit-contract-output",
  {
    responses: {
      200: TransformUser,
    },
  },
  () => ({
    id: "user-1",
    name: "John",
    normalized: true,
  }),
);

app.get(
  "/invalid-contract-input",
  {
    responses: {
      200: TransformUser,
    },
  },

  // @ts-expect-error contract-only direct result must produce Schema Output
  () => ({ id: "user-1", name: "John" }),
);

/*
 * Direct non-undefined values imply HTTP 200.
 * A route declaring only 201 must use reply.status(201, ...).
 */
app.get(
  "/invalid-direct-201",
  {
    responses: {
      201: User,
    },
  },

  // @ts-expect-error direct non-undefined result implies undeclared status 200
  () => ({ id: "user-1", name: "John" }),
);

/*
 * Explicit 204 allows direct undefined.
 */
app.get(
  "/explicit-direct-204",
  {
    responses: {
      204: undefined,
    },
  },
  () => undefined,
);

/*
 * Without declared 204, direct undefined is invalid.
 */
app.get(
  "/invalid-direct-undefined",
  {
    responses: {
      200: User,
    },
  },

  // @ts-expect-error direct undefined implies undeclared status 204
  () => undefined,
);

/*
 * A bodyless status 200 requires explicit status selection.
 * Direct undefined still means HTTP 204.
 */
app.get(
  "/explicit-empty-200",
  {
    responses: {
      200: undefined,
    },
  },
  ({ reply }) => reply.status(200),
);

app.get(
  "/invalid-direct-empty-200",
  {
    responses: {
      200: undefined,
    },
  },

  // @ts-expect-error direct undefined means 204, not bodyless 200
  () => undefined,
);

/*
 * Raw Response remains the explicit escape hatch even when
 * a managed response contract exists.
 */
app.get(
  "/explicit-raw-response",
  {
    responses: {
      200: User,
    },
  },
  () =>
    new Response("caller-owned", {
      status: 418,
    }),
);

export type {
  ImplicitAsyncUndefinedResponse,
  ImplicitMixedRawResponse,
  ImplicitObjectResponse,
  ImplicitRawResponse,
  ImplicitUndefinedResponse,
  ImplicitUnionResponse,
  ImplicitVoidResponse,
};
