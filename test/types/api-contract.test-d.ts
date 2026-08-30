import { Gelis, defineContract, defineModule } from "../../src";

import type { ApiContractOf, StandardSchemaV1 } from "../../src";

import type { Equal, Expect } from "./assert";

declare const User: StandardSchemaV1<{
  id: string;
  name: string;
}>;

const app = new Gelis();

const health = app.get("/health", () => ({
  status: "ok" as const,
}));

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
        responses: {
          201: User,
        },
      },

      ({ reply }) =>
        reply.status(201, {
          id: "1",
          name: "John",
        }),
    ),
  }),
);

const api = defineContract({
  health,
  users,
});

type Api = ApiContractOf<typeof api>;

type HealthMethod = Expect<Equal<Api["health"]["method"], "GET">>;

type HealthPath = Expect<Equal<Api["health"]["path"], "/health">>;

type HealthResponse = Expect<
  Equal<
    Api["health"]["responses"],
    {
      200: {
        status: "ok";
      };
    }
  >
>;

type UsersListPath = Expect<Equal<Api["users"]["list"]["path"], "/users">>;

type UsersFindPath = Expect<Equal<Api["users"]["find"]["path"], "/users/:id">>;

type UsersFindParams = Expect<
  Equal<
    Api["users"]["find"]["request"]["params"],
    {
      id: string;
    }
  >
>;

type UsersCreateResponse = Expect<
  Equal<
    Api["users"]["create"]["responses"],
    {
      201: {
        id: string;
        name: string;
      };
    }
  >
>;

defineContract({
  // @ts-expect-error arbitrary values are not contract entries
  invalid: 123,
});

export type {
  HealthMethod,
  HealthPath,
  HealthResponse,
  UsersCreateResponse,
  UsersFindParams,
  UsersFindPath,
  UsersListPath,
};
