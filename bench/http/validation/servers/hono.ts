import { Hono } from "hono";

import { sValidator } from "@hono/standard-validator";

import { bodySyncSchema, queryAsyncSchema, querySyncSchema } from "../schemas";

const PORT = Number(process.env.PORT ?? 3100);

const ROUTES = Number(process.env.ROUTES ?? 5000);

const CASE = process.env.CASE ?? "query-sync";

const app = new Hono();

switch (CASE) {
  case "query-sync": {
    for (let index = 0; index < ROUTES; index++) {
      const path = `/r/${index}`;

      app.get(
        path,

        sValidator("query", querySyncSchema),

        (context) => {
          const query = context.req.valid("query");

          return new Response(`${query.page}:${query.q}`);
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

        sValidator("query", queryAsyncSchema),

        (context) => {
          const query = context.req.valid("query");

          return new Response(`${query.page}:${query.q}`);
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

        sValidator("json", bodySyncSchema),

        (context) => {
          const body = context.req.valid("json");

          return new Response(`${body.name}:${body.count}`);
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

        sValidator("query", querySyncSchema),

        sValidator("json", bodySyncSchema),

        (context) => {
          const query = context.req.valid("query");

          const body = context.req.valid("json");

          return new Response(
            `${query.page}:${query.q}:${body.name}:${body.count}`,
          );
        },
      );
    }

    break;
  }

  default:
    throw new Error(`Unknown validation case: ${CASE}`);
}

Bun.serve({
  port: PORT,

  hostname: "127.0.0.1",

  reusePort: false,

  fetch: app.fetch,
});
