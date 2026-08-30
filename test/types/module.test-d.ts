import { Gelis, defineModule } from "../../src";

import type { ModuleContractOf, StandardSchemaV1 } from "../../src";

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

const users = defineModule(
  "/users",

  (route) => ({
    list: route.get("/", () => [
      {
        id: "1",
        name: "John",
      },
    ]),

    find: route.get(
      "/:id",

      ({ params }) => ({
        id: params.id,
        name: "John",
      }),
    ),

    create: route.post(
      "/",

      {
        body: CreateUser,

        responses: {
          201: User,
        },
      },

      ({ body, reply }) =>
        reply.status(201, {
          id: "1",
          name: body.name,
        }),
    ),
  }),
);

type Contract = ModuleContractOf<typeof users>;

type Prefix = Expect<Equal<Contract["prefix"], "/users">>;

type ListPath = Expect<Equal<Contract["routes"]["list"]["path"], "/users">>;

type FindPath = Expect<Equal<Contract["routes"]["find"]["path"], "/users/:id">>;

type FindParams = Expect<
  Equal<
    Contract["routes"]["find"]["request"]["params"],
    {
      id: string;
    }
  >
>;

type CreateBody = Expect<
  Equal<
    Contract["routes"]["create"]["request"]["body"],
    {
      name: string;
    }
  >
>;

type CreateResponses = Expect<
  Equal<
    Contract["routes"]["create"]["responses"],
    {
      201: {
        id: string;
        name: string;
      };
    }
  >
>;

const teamUsers = defineModule(
  "/teams/:teamId",

  (route) => ({
    find: route.get(
      "/users/:userId",

      ({ params }) => {
        const teamId: string = params.teamId;

        const userId: string = params.userId;

        return {
          teamId,
          userId,
        };
      },
    ),
  }),
);

type TeamUsersContract = ModuleContractOf<typeof teamUsers>;

type PrefixParams = Expect<
  Equal<
    TeamUsersContract["routes"]["find"]["request"]["params"],
    {
      teamId: string;
      userId: string;
    }
  >
>;

const app = new Gelis();

type BeforeMount = typeof app;

app.mount(users);
app.mount(teamUsers);

type AfterMount = typeof app;

type StableRoot = Expect<Equal<BeforeMount, AfterMount>>;

// @ts-expect-error module entries must be Gelis RouteRefs
defineModule("/invalid", () => ({
  nope: {
    method: "GET",
    path: "/invalid",
  },
}));

export type {
  CreateBody,
  CreateResponses,
  FindParams,
  FindPath,
  ListPath,
  Prefix,
  PrefixParams,
  StableRoot,
};
