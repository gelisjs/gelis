import { Gelis, defineContract, defineModule } from "../../src";

import type { StandardSchemaV1 } from "../../src";

import type { GelisClient } from "../../prototype/client";

import type { Equal, Expect } from "./assert";

declare const User: StandardSchemaV1<{
  id: string;
  name: string;
}>;

declare const NotFound: StandardSchemaV1<{
  code: "NOT_FOUND";
}>;

declare const UpdateUser: StandardSchemaV1<
  {
    name: string;
  },
  {
    name: string;
    normalized: true;
  }
>;

const app = new Gelis();

const health = app.get(
  "/health",

  () => ({
    status: "ok" as const,
  }),
);

const users = defineModule(
  "/users",

  (route) => ({
    find: route.get(
      "/:id",

      {
        responses: {
          200: User,
          404: NotFound,
        },
      },

      ({ params, reply }) => {
        if (params.id === "missing") {
          return reply.status(404, {
            code: "NOT_FOUND",
          });
        }

        return reply.status(200, {
          id: params.id,
          name: "John",
        });
      },
    ),

    update: route.post(
      "/:id",

      {
        body: UpdateUser,

        responses: {
          200: User,
        },
      },

      ({ params, body, reply }) =>
        reply.status(200, {
          id: params.id,
          name: body.name,
        }),
    ),
  }),
);

const api = defineContract({
  health,
  users,
});

type Client = GelisClient<typeof api>;

declare const client: Client;

const healthResult = client.health();

type HealthResult = Expect<Equal<Awaited<typeof healthResult>["status"], 200>>;

const findResult = client.users.find({
  params: {
    id: "123",
  },
});

type FindResult = Awaited<typeof findResult>;

type FindStatus = Expect<Equal<FindResult["status"], 200 | 404>>;

async function testNarrowing() {
  const result = await client.users.find({
    params: {
      id: "123",
    },
  });

  if (result.status === 200) {
    const id: string = result.data.id;

    const name: string = result.data.name;

    void id;
    void name;

    // @ts-expect-error 200 response is User
    result.data.code;
  }

  if (result.status === 404) {
    const code: "NOT_FOUND" = result.data.code;

    void code;

    // @ts-expect-error 404 response is NotFound
    result.data.name;
  }
}

client.users.update({
  params: {
    id: "123",
  },

  body: {
    name: "Jane",
  },
});

// @ts-expect-error params are required
client.users.find();

client.users.find({
  params: {
    // @ts-expect-error id must be a string
    id: 123,
  },
});

client.users.update({
  params: {
    id: "123",
  },

  body: {
    name: "Jane",

    // @ts-expect-error body uses schema input, not transformed output
    normalized: true,
  },
});

void testNarrowing;

export type { FindStatus, HealthResult };
