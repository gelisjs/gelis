import { Gelis } from "../../src";

import type {
  ResponseContractMap,
  RouteContractOf,
  StandardSchemaV1,
} from "../../src";

import type { Equal, Expect } from "./assert";

const app = new Gelis();

const querySchema: StandardSchemaV1<
  {
    q: string;
  },
  {
    q: string;
  }
> = {
  "~standard": {
    version: 1,

    vendor: "test",

    validate(value: unknown) {
      return {
        value: value as {
          q: string;
        },
      };
    },
  },
};

const bodySchema: StandardSchemaV1<
  {
    body: string;
  },
  {
    body: string;
  }
> = {
  "~standard": {
    version: 1,

    vendor: "test",

    validate(value: unknown) {
      return {
        value: value as {
          body: string;
        },
      };
    },
  },
};

const responseSchema: StandardSchemaV1<
  {
    ok: boolean;
  },
  {
    ok: boolean;
  }
> = {
  "~standard": {
    version: 1,

    vendor: "test",

    validate(value: unknown) {
      return {
        value: value as {
          ok: boolean;
        },
      };
    },
  },
};

const responses = {
  200: responseSchema,
} satisfies ResponseContractMap;

const putRoute = app.put(
  "/put/:id",

  {
    query: querySchema,

    body: bodySchema,

    responses,

    openapi: {
      summary: "PUT route",
    },
  },

  ({ params, query, body }) => {
    const id: string = params.id;

    const q: string = query.q;

    const bodyValue: string = body.body;

    void id;
    void q;
    void bodyValue;

    return {
      ok: true,
    };
  },
);

const patchRoute = app.patch(
  "/patch",

  () => "patch",
);

const deleteRoute = app.delete(
  "/delete",

  () => "delete",
);

const optionsRoute = app.options(
  "/options",

  () => "options",
);

const headRoute = app.head(
  "/head",

  () => "head",
);

const genericRoute = app.route(
  "DELETE",

  "/generic/:id",

  {
    query: querySchema,

    body: bodySchema,

    responses,

    openapi: {
      summary: "Generic DELETE route",
    },
  },

  ({ params, query, body }) => {
    const id: string = params.id;

    const q: string = query.q;

    const bodyValue: string = body.body;

    void id;
    void q;
    void bodyValue;

    return {
      ok: true,
    };
  },
);

type PutMethod = Expect<
  Equal<RouteContractOf<typeof putRoute>["method"], "PUT">
>;

type PatchMethod = Expect<
  Equal<RouteContractOf<typeof patchRoute>["method"], "PATCH">
>;

type DeleteMethod = Expect<
  Equal<RouteContractOf<typeof deleteRoute>["method"], "DELETE">
>;

type OptionsMethod = Expect<
  Equal<RouteContractOf<typeof optionsRoute>["method"], "OPTIONS">
>;

type HeadMethod = Expect<
  Equal<RouteContractOf<typeof headRoute>["method"], "HEAD">
>;

type GenericMethod = Expect<
  Equal<RouteContractOf<typeof genericRoute>["method"], "DELETE">
>;

type PutQuery = Expect<
  Equal<
    RouteContractOf<typeof putRoute>["request"]["query"],
    {
      q: string;
    }
  >
>;

type PutBody = Expect<
  Equal<
    RouteContractOf<typeof putRoute>["request"]["body"],
    {
      body: string;
    }
  >
>;

type GenericQuery = Expect<
  Equal<
    RouteContractOf<typeof genericRoute>["request"]["query"],
    {
      q: string;
    }
  >
>;

export type {
  DeleteMethod,
  GenericMethod,
  GenericQuery,
  HeadMethod,
  OptionsMethod,
  PatchMethod,
  PutBody,
  PutMethod,
  PutQuery,
};
