import { Gelis } from "../../../../src";

import { serve } from "../../../../prototype/bun";

import { bodySyncSchema, queryAsyncSchema, querySyncSchema } from "../schemas";

const PORT = Number(process.env.PORT ?? 3100);

const ROUTES = Number(process.env.ROUTES ?? 5000);

const CASE = process.env.CASE ?? "query-sync";

const app = new Gelis();

switch (CASE) {
  case "query-sync": {
    for (let index = 0; index < ROUTES; index++) {
      const path = `/r/${index}` as const;

      app.get(
        path,

        {
          query: querySyncSchema,
        },

        ({ query }) => new Response(`${query.page}:${query.q}`),
      );
    }

    break;
  }

  case "query-async": {
    for (let index = 0; index < ROUTES; index++) {
      const path = `/r/${index}` as const;

      app.get(
        path,

        {
          query: queryAsyncSchema,
        },

        ({ query }) => new Response(`${query.page}:${query.q}`),
      );
    }

    break;
  }

  case "body-sync": {
    for (let index = 0; index < ROUTES; index++) {
      const path = `/r/${index}` as const;

      app.post(
        path,

        {
          body: bodySyncSchema,
        },

        ({ body }) => new Response(`${body.name}:${body.count}`),
      );
    }

    break;
  }

  case "query-body": {
    for (let index = 0; index < ROUTES; index++) {
      const path = `/r/${index}` as const;

      app.post(
        path,

        {
          query: querySyncSchema,

          body: bodySyncSchema,
        },

        ({ query, body }) =>
          new Response(`${query.page}:${query.q}:${body.name}:${body.count}`),
      );
    }

    break;
  }

  default:
    throw new Error(`Unknown validation case: ${CASE}`);
}

serve(app, {
  port: PORT,

  hostname: "127.0.0.1",

  reusePort: false,
});
