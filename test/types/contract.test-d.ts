import { Gelis } from "../../src";

import type { RouteContractOf, StandardSchemaV1 } from "../../src";

import type { Equal, Expect } from "./assert";

declare const CreateUser: StandardSchemaV1<
  {
    name: string;
  },
  {
    name: string;
    normalized: true;
  }
>;

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
    body: CreateUser,

    responses: {
      201: User,

      409: Conflict,
    },
  },

  ({ body, reply }) => {
    const normalized: true = body.normalized;

    const name: string = body.name;

    void normalized;

    return reply.status(201, {
      id: "user-1",
      name,
    });
  },
);

type Contract = RouteContractOf<typeof createUser>;

type Method = Expect<Equal<Contract["method"], "POST">>;

type Path = Expect<Equal<Contract["path"], "/users">>;

type Params = Expect<
  Equal<Contract["request"]["params"], Record<never, never>>
>;

type Body = Expect<
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
        name: string;
      };

      409: {
        code: "EMAIL_EXISTS";
      };
    }
  >
>;

const first = app.post(
  "/users",

  {
    body: CreateUser,
  },

  ({ body }) => ({
    name: body.name,
  }),
);

const second = app.post(
  "/users",

  {
    body: CreateUser,
  },

  ({ body }) => {
    const localImplementationDetail = new Map<string, number>();

    void localImplementationDetail;

    return {
      name: body.name,
    };
  },
);

type SamePublicContract = Expect<
  Equal<RouteContractOf<typeof first>, RouteContractOf<typeof second>>
>;

export type { Body, Method, Params, Path, Responses, SamePublicContract };
