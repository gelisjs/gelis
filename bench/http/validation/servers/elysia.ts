import { Elysia } from "elysia";

import { bodySyncSchema, queryAsyncSchema, querySyncSchema } from "../schemas";

import type { BodyOutput, QueryOutput } from "../schemas";

const PORT = Number(process.env.PORT ?? 3100);

const ROUTES = Number(process.env.ROUTES ?? 5000);

const CASE = process.env.CASE ?? "query-sync";

const PRECOMPILE = process.env.PRECOMPILE === "true";

const app = new Elysia({
  precompile: PRECOMPILE,

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

        ({ query }) => {
          const validated = query as QueryOutput;

          return new Response(`${validated.page}:${validated.q}`);
        },

        {
          query: querySyncSchema,
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

        ({ query }) => {
          const validated = query as QueryOutput;

          return new Response(`${validated.page}:${validated.q}`);
        },

        {
          query: queryAsyncSchema,
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

        ({ body }) => {
          const validated = body as BodyOutput;

          return new Response(`${validated.name}:${validated.count}`);
        },

        {
          body: bodySyncSchema,
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

        ({ query, body }) => {
          const validatedQuery = query as QueryOutput;

          const validatedBody = body as BodyOutput;

          return new Response(
            `${validatedQuery.page}:${validatedQuery.q}:${validatedBody.name}:${validatedBody.count}`,
          );
        },

        {
          query: querySyncSchema,

          body: bodySyncSchema,
        },
      );
    }

    break;
  }

  default:
    throw new Error(`Unknown validation case: ${CASE}`);
}

app.listen(PORT);
