import { Gelis } from "../../src";

import type { RouteContractOf, StandardSchemaV1 } from "../../src";

import type { Equal, Expect } from "./assert";

declare const User: StandardSchemaV1<{
  id: string;
  name: string;
}>;

declare const Conflict: StandardSchemaV1<{
  code: "EMAIL_EXISTS";
}>;

const app = new Gelis();

const createUser = app.post(
  "/users",

  {
    responses: {
      201: User,
      409: Conflict,
    },
  },

  ({ reply }) => {
    if (Math.random() > 0.5) {
      return reply.status(201, {
        id: "user-1",
        name: "John",
      });
    }

    return reply.status(409, {
      code: "EMAIL_EXISTS",
    });
  },
);

type Contract = RouteContractOf<typeof createUser>;

type Responses = Expect<
  Equal<
    Contract["responses"],
    {
      201: {
        id: string;
        name: string;
      };

      409: {
        code: "EMAIL_EXISTS";
      };
    }
  >
>;

export type { Responses };
