import { Gelis } from "../../../../src";

import { serve } from "../../../../prototype/bun";

import {
  PAYLOAD,
  TEXT,
  VALIDATION_INPUT,
  payloadSchema,
  textSchema,
  validationSchema,
} from "../../response/schemas";

const PORT = Number(process.env.PORT ?? 3100);

const ROUTES = Number(process.env.ROUTES ?? 5000);

const CASE = process.env.CASE ?? "raw-response";

const RAW_RESPONSE = new Response(
  null,

  {
    status: 204,
  },
);

const app = new Gelis();

switch (CASE) {
  case "raw-response": {
    for (let index = 0; index < ROUTES; index++) {
      const path = `/r/${index}` as const;

      app.get(
        path,

        {
          responses: {
            200: {
              schema: payloadSchema,

              validate: true,
            },
          },
        },

        () => RAW_RESPONSE,
      );
    }

    break;
  }

  case "json": {
    for (let index = 0; index < ROUTES; index++) {
      const path = `/r/${index}` as const;

      app.get(
        path,

        {
          responses: {
            200: {
              schema: payloadSchema,

              serialize: "json",
            },
          },
        },

        () => PAYLOAD,
      );
    }

    break;
  }

  case "text": {
    for (let index = 0; index < ROUTES; index++) {
      const path = `/r/${index}` as const;

      app.get(
        path,

        {
          responses: {
            200: {
              schema: textSchema,

              serialize: "text",
            },
          },
        },

        () => TEXT,
      );
    }

    break;
  }

  case "validate-json": {
    for (let index = 0; index < ROUTES; index++) {
      const path = `/r/${index}` as const;

      app.get(
        path,

        {
          responses: {
            200: {
              schema: validationSchema,

              validate: true,

              serialize: "json",
            },
          },
        },

        () => VALIDATION_INPUT,
      );
    }

    break;
  }

  case "status-json": {
    for (let index = 0; index < ROUTES; index++) {
      const path = `/r/${index}` as const;

      app.get(
        path,

        {
          responses: {
            201: {
              schema: payloadSchema,

              serialize: "json",
            },
          },
        },

        ({ reply }) => reply.status(201, PAYLOAD),
      );
    }

    break;
  }

  default:
    throw new Error(`Unknown response comparison case: ${CASE}`);
}

serve(
  app,

  {
    port: PORT,

    hostname: "127.0.0.1",

    reusePort: false,
  },
);
