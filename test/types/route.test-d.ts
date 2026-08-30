import { Gelis } from "../../src";

import type { RouteContractOf } from "../../src";

import type { Equal, Expect } from "./assert";

const app = new Gelis();

const getUser = app.get("/users/:id", ({ params }) => {
  const id: string = params.id;

  return {
    id,
  };
});

type Contract = RouteContractOf<typeof getUser>;

type Method = Expect<Equal<Contract["method"], "GET">>;

type Path = Expect<Equal<Contract["path"], "/users/:id">>;

type Params = Expect<
  Equal<
    Contract["request"]["params"],
    {
      id: string;
    }
  >
>;

type Response = Expect<
  Equal<
    Contract["responses"],
    {
      200: {
        id: string;
      };
    }
  >
>;

app.get("/teams/:teamId/users/:userId", ({ params }) => {
  const teamId: string = params.teamId;

  const userId: string = params.userId;

  return {
    teamId,
    userId,
  };
});

app.get("/health", ({ params }) => {
  // @ts-expect-error
  // health has no id parameter
  params.id;

  return {
    status: "ok",
  };
});

export type { Method, Params, Path, Response };
