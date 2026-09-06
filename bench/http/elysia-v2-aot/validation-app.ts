import { Elysia } from "elysia";

import {
  bodySyncSchema,
  queryAsyncSchema,
  querySyncSchema,
} from "../validation/schemas";

import type { BodyOutput, QueryOutput } from "../validation/schemas";

const ROUTES = Number(process.env.ROUTES ?? 5000);

const CASE = process.env.CASE ?? "query-sync";

const app = new Elysia({
  serve: {
    hostname: "127.0.0.1",

    reusePort: false,
  },
});

switch (CASE) {
  case "query-sync": {
    for (let index = 0; index < ROUTES; index++) {
      const path = `/r/${index}`;

      app.get(
        path,

        {
          query: querySyncSchema,
        },

        ({ query }) => {
          const validated = query as QueryOutput;

          return new Response(`${validated.page}:${validated.q}`);
        },
      );
    }

    break;
  }

  case "query-async": {
    for (let index = 0; index < ROUTES; index++) {
      const path = `/r/${index}`;

      app.get(
        path,

        {
          query: queryAsyncSchema,
        },

        ({ query }) => {
          const validated = query as QueryOutput;

          return new Response(`${validated.page}:${validated.q}`);
        },
      );
    }

    break;
  }

  case "body-sync": {
    for (let index = 0; index < ROUTES; index++) {
      const path = `/r/${index}`;

      app.post(
        path,

        {
          body: bodySyncSchema,
        },

        ({ body }) => {
          const validated = body as BodyOutput;

          return new Response(`${validated.name}:${validated.count}`);
        },
      );
    }

    break;
  }

  case "query-body": {
    for (let index = 0; index < ROUTES; index++) {
      const path = `/r/${index}`;

      app.post(
        path,

        {
          query: querySyncSchema,

          body: bodySyncSchema,
        },

        ({ query, body }) => {
          const validatedQuery = query as QueryOutput;

          const validatedBody = body as BodyOutput;

          return new Response(
            `${validatedQuery.page}:${validatedQuery.q}:${validatedBody.name}:${validatedBody.count}`,
          );
        },
      );
    }

    break;
  }

  default:
    throw new Error(`Unknown validation case: ${CASE}`);
}

export default app;
