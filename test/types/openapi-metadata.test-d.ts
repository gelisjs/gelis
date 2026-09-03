import { Gelis } from "../../src";

import type {
  OpenAPIJSONSchema,
  OpenAPIQueryMetadata,
  OpenAPIRouteMetadata,
  RouteContractOf,
  StandardSchemaV1,
} from "../../src";

import type { Equal, Expect } from "./assert";

const objectSchema = {
  type: "object",

  properties: {
    id: {
      type: "string",
    },
  },

  required: ["id"],
} satisfies OpenAPIJSONSchema;

const allowAnything = true satisfies OpenAPIJSONSchema;

const rejectEverything = false satisfies OpenAPIJSONSchema;

void objectSchema;
void allowAnything;
void rejectEverything;

/*
 * Query documentation supports exactly one source:
 *
 * schema decomposition,
 * explicit parameters,
 * or explicit opaque behavior.
 */
const querySchema = {
  schema: {
    type: "object",

    properties: {
      page: {
        type: "integer",
      },
    },
  },
} satisfies OpenAPIQueryMetadata;

const queryParameters = {
  parameters: [
    {
      name: "tag",

      required: false,

      style: "form",

      explode: true,

      schema: {
        type: "array",

        items: {
          type: "string",
        },
      },
    },
  ],
} satisfies OpenAPIQueryMetadata;

const opaqueQuery = {
  opaque: true,
} satisfies OpenAPIQueryMetadata;

void querySchema;
void queryParameters;
void opaqueQuery;

/*
 * The complete passive metadata surface can describe
 * operation, request, and response documentation
 * without participating in route type inference.
 */
const metadata = {
  summary: "Get user",

  description: "Returns one user.",

  operationId: "getUser",

  tags: ["Users"],

  deprecated: false,

  request: {
    params: {
      id: {
        description: "User identifier",

        schema: {
          type: "string",
        },
      },
    },

    query: {
      parameters: [
        {
          name: "include",

          schema: {
            type: "string",
          },
        },
      ],
    },

    body: {
      description: "Optional documentation body metadata",

      mediaType: "application/json",

      schema: {
        type: "object",
      },
    },
  },

  responses: {
    200: {
      description: "User returned",
    },

    404: {
      description: "User not found",

      schema: {
        type: "object",

        properties: {
          code: {
            type: "string",
          },
        },
      },
    },

    429: {
      description: "Rate limited",

      opaque: true,
    },

    default: {
      description: "Undocumented response",

      opaque: true,
    },
  },
} satisfies OpenAPIRouteMetadata;

void metadata;

declare const QuerySchema: StandardSchemaV1<
  {
    page: string;
  },
  {
    page: number;
  }
>;

declare const UserSchema: StandardSchemaV1<{
  id: string;

  name: string;
}>;

const app = new Gelis();

/*
 * Adding only OpenAPI metadata must not alter
 * implicit response inference or RouteRef shape.
 */
const documentedImplicit = app.get(
  "/users/:id",

  {
    openapi: {
      summary: "Get implicit user",

      tags: ["Users"],
    },
  },

  ({ params }) => ({
    id: params.id,
  }),
);

type ImplicitContract = RouteContractOf<typeof documentedImplicit>;

type _ImplicitMethod = Expect<Equal<ImplicitContract["method"], "GET">>;

type _ImplicitPath = Expect<Equal<ImplicitContract["path"], "/users/:id">>;

type _ImplicitResponse = Expect<
  Equal<
    ImplicitContract["responses"],
    {
      200: {
        id: string;
      };
    }
  >
>;

type _OpenAPINotInRouteContract = Expect<
  Equal<"openapi" extends keyof ImplicitContract ? true : false, false>
>;

/*
 * Passive documentation must also preserve request
 * Input typing and handler Output typing.
 */
const documentedQuery = app.get(
  "/search",

  {
    query: QuerySchema,

    openapi: {
      summary: "Search",

      request: {
        query: {
          schema: {
            type: "object",

            properties: {
              page: {
                type: "string",
              },
            },
          },
        },
      },
    },
  },

  ({ query }) => query.page,
);

type QueryContract = RouteContractOf<typeof documentedQuery>;

type _QueryWireInput = Expect<
  Equal<
    QueryContract["request"]["query"],
    {
      page: string;
    }
  >
>;

type _QueryResponse = Expect<
  Equal<
    QueryContract["responses"],
    {
      200: number;
    }
  >
>;

/*
 * Explicit runtime responses remain the typed public
 * response contract. Documentation metadata does not
 * add or remove reply statuses.
 */
const documentedExplicit = app.get(
  "/users/current",

  {
    responses: {
      200: UserSchema,
    },

    openapi: {
      operationId: "getCurrentUser",

      responses: {
        200: {
          description: "Current user",
        },

        429: {
          description: "Rate limited",

          opaque: true,
        },
      },
    },
  },

  () => ({
    id: "user-1",

    name: "Gelis",
  }),
);

type ExplicitContract = RouteContractOf<typeof documentedExplicit>;

type _ExplicitResponses = Expect<
  Equal<
    ExplicitContract["responses"],
    {
      200: {
        id: string;

        name: string;
      };
    }
  >
>;

/*
 * Routes can explicitly opt out of OpenAPI without
 * changing their runtime/type contract.
 */
const hidden = app.get(
  "/internal",

  {
    openapi: false,
  },

  () => "hidden",
);

type HiddenContract = RouteContractOf<typeof hidden>;

type _HiddenPath = Expect<Equal<HiddenContract["path"], "/internal">>;

type _HiddenResponse = Expect<
  Equal<
    HiddenContract["responses"],
    {
      200: string;
    }
  >
>;
