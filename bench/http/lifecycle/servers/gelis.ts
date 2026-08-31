import { Gelis } from "../../../../src";

import { serve } from "../../../../prototype/bun";

import { querySyncSchema } from "../../validation/schemas";

const PORT = Number(process.env.PORT ?? 3100);

const ROUTES = Number(process.env.ROUTES ?? 5000);

const CASE = process.env.CASE ?? "plain";

const app = new Gelis();

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

        {
          query: querySyncSchema,
        },

        () => new Response("ok"),

        {
          beforeHandle: ({ query }) => {
            if (query.page !== 42 || query.q !== "gelis") {
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

serve(app, {
  port: PORT,

  hostname: "127.0.0.1",

  reusePort: false,
});
