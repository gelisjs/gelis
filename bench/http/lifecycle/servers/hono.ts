import { Hono } from "hono";

import { sValidator } from "@hono/standard-validator";

import { querySyncSchema } from "../../validation/schemas";

const PORT = Number(process.env.PORT ?? 3100);

const ROUTES = Number(process.env.ROUTES ?? 5000);

const CASE = process.env.CASE ?? "plain";

const app = new Hono();

switch (CASE) {
  case "plain": {
    for (let index = 0; index < ROUTES; index++) {
      app.get(
        `/r/${index}`,

        () => new Response("ok"),
      );
    }

    break;
  }

  case "before-sync": {
    for (let index = 0; index < ROUTES; index++) {
      app.get(
        `/r/${index}`,

        (_context, next) => next(),

        () => new Response("ok"),
      );
    }

    break;
  }

  case "before-async": {
    for (let index = 0; index < ROUTES; index++) {
      app.get(
        `/r/${index}`,

        async (_context, next) => {
          await Promise.resolve();

          await next();
        },

        () => new Response("ok"),
      );
    }

    break;
  }

  case "after-sync": {
    for (let index = 0; index < ROUTES; index++) {
      app.get(
        `/r/${index}`,

        async (_context, next) => {
          await next();
        },

        () => new Response("ok"),
      );
    }

    break;
  }

  case "before-after-sync": {
    for (let index = 0; index < ROUTES; index++) {
      app.get(
        `/r/${index}`,

        async (_context, next) => {
          await next();
        },

        () => new Response("ok"),
      );
    }

    break;
  }

  case "validation-before": {
    for (let index = 0; index < ROUTES; index++) {
      app.get(
        `/r/${index}`,

        sValidator("query", querySyncSchema),

        (context, next) => {
          const query = context.req.valid("query");

          if (query.page !== 42 || query.q !== "gelis") {
            throw new Error("Unexpected validated query");
          }

          return next();
        },

        () => new Response("ok"),
      );
    }

    break;
  }

  case "early-return": {
    for (let index = 0; index < ROUTES; index++) {
      app.get(
        `/r/${index}`,

        () => new Response("early"),

        () => {
          throw new Error("Handler must not run");
        },
      );
    }

    break;
  }

  default:
    throw new Error(`Unknown lifecycle case: ${CASE}`);
}

Bun.serve({
  port: PORT,

  hostname: "127.0.0.1",

  reusePort: false,

  fetch: app.fetch,
});
