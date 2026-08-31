import { Elysia } from "elysia";

import { querySyncSchema } from "../../validation/schemas";

import type { QueryOutput } from "../../validation/schemas";

const PORT = Number(process.env.PORT ?? 3100);

const ROUTES = Number(process.env.ROUTES ?? 5000);

const CASE = process.env.CASE ?? "plain";

const PRECOMPILE = process.env.PRECOMPILE === "true";

const app = new Elysia({
  precompile: PRECOMPILE,

  serve: {
    hostname: "127.0.0.1",

    reusePort: false,
  },
});

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

        () => new Response("ok"),

        {
          beforeHandle: () => undefined,
        },
      );
    }

    break;
  }

  case "before-async": {
    for (let index = 0; index < ROUTES; index++) {
      app.get(
        `/r/${index}`,

        () => new Response("ok"),

        {
          beforeHandle: async () => {
            await Promise.resolve();
          },
        },
      );
    }

    break;
  }

  case "after-sync": {
    for (let index = 0; index < ROUTES; index++) {
      app.get(
        `/r/${index}`,

        () => new Response("ok"),

        {
          afterHandle: () => undefined,
        },
      );
    }

    break;
  }

  case "before-after-sync": {
    for (let index = 0; index < ROUTES; index++) {
      app.get(
        `/r/${index}`,

        () => new Response("ok"),

        {
          beforeHandle: () => undefined,

          afterHandle: () => undefined,
        },
      );
    }

    break;
  }

  case "validation-before": {
    for (let index = 0; index < ROUTES; index++) {
      app.get(
        `/r/${index}`,

        ({ query }) => {
          const validated = query as QueryOutput;

          if (validated.page !== 42 || validated.q !== "gelis") {
            throw new Error("Unexpected validated query");
          }

          return new Response("ok");
        },

        {
          query: querySyncSchema,

          beforeHandle: ({ query }) => {
            const validated = query as QueryOutput;

            if (validated.page !== 42 || validated.q !== "gelis") {
              throw new Error("Unexpected validated query");
            }
          },
        },
      );
    }

    break;
  }

  case "early-return": {
    for (let index = 0; index < ROUTES; index++) {
      app.get(
        `/r/${index}`,

        () => {
          throw new Error("Handler must not run");
        },

        {
          beforeHandle: () => new Response("early"),
        },
      );
    }

    break;
  }

  default:
    throw new Error(`Unknown lifecycle case: ${CASE}`);
}

app.listen(PORT);
