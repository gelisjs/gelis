import { Gelis } from "../../src";

import type { RouteContractOf, StandardSchemaV1 } from "../../src";

import type { Equal, Expect } from "./assert";

declare const Query: StandardSchemaV1<
  {
    page: string;
  },
  {
    page: number;
  }
>;

declare const Body: StandardSchemaV1<
  {
    name: string;
  },
  {
    name: string;

    normalized: true;
  }
>;

declare const Created: StandardSchemaV1<{
  id: string;
}>;

declare const Unauthorized: StandardSchemaV1<{
  code: "UNAUTHORIZED";
}>;

const app = new Gelis();

const route = app.post(
  "/teams/:teamId/users",

  {
    query: Query,

    body: Body,

    responses: {
      201: Created,

      401: Unauthorized,
    },

    beforeHandle: ({ params, query, body, reply }) => {
      const teamId: string = params.teamId;

      const page: number = query.page;

      const normalized: true = body.normalized;

      if (teamId === "blocked") {
        return reply.status(401, {
          code: "UNAUTHORIZED",
        });
      }

      reply.status(401, {
        // @ts-expect-error invalid 401 response body
        code: "INVALID",
      });

      void page;
      void normalized;

      return undefined;
    },
  },

  ({ params, query, body, reply }) => {
    return reply.status(201, {
      id: `${params.teamId}-${query.page}-${body.name}`,
    });
  },
);

type Contract = RouteContractOf<typeof route>;

type Params = Expect<
  Equal<
    Contract["request"]["params"],
    {
      teamId: string;
    }
  >
>;

type QueryInput = Expect<
  Equal<
    Contract["request"]["query"],
    {
      page: string;
    }
  >
>;

type BodyInput = Expect<
  Equal<
    Contract["request"]["body"],
    {
      name: string;
    }
  >
>;

type Responses = Expect<
  Equal<
    Contract["responses"],
    {
      201: {
        id: string;
      };

      401: {
        code: "UNAUTHORIZED";
      };
    }
  >
>;

export type { BodyInput, Params, QueryInput, Responses };
