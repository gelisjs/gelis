import { Gelis } from "../../../../src";

import { serve } from "../../../../prototype/bun";

import {
  PAYLOAD,
  TEXT,
  VALIDATION_INPUT,
  payloadSchema,
  validateOutput,
} from "../schemas";

const PORT = Number(process.env.PORT ?? 3100);

const ROUTES = Number(process.env.ROUTES ?? 5000);

const CASE = process.env.CASE ?? "raw-bypass";

const RAW_RESPONSE = new Response(
  null,

  {
    status: 204,
  },
);

const JSON_INIT: ResponseInit = {
  status: 200,
};

const TEXT_INIT: ResponseInit = {
  status: 200,

  headers: {
    "content-type": "text/plain; charset=utf-8",
  },
};

const app = new Gelis();

switch (CASE) {
  case "raw-bypass": {
    for (let index = 0; index < ROUTES; index++) {
      const path = `/r/${index}` as const;

      app.get(
        path,

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

        () => Response.json(PAYLOAD, JSON_INIT),
      );
    }

    break;
  }

  case "text": {
    for (let index = 0; index < ROUTES; index++) {
      const path = `/r/${index}` as const;

      app.get(
        path,

        () => new Response(TEXT, TEXT_INIT),
      );
    }

    break;
  }

  case "validate-auto":
  case "validate-json": {
    for (let index = 0; index < ROUTES; index++) {
      const path = `/r/${index}` as const;

      app.get(
        path,

        () => {
          const result = validateOutput(VALIDATION_INPUT);

          if (result.issues !== undefined) {
            throw new Error("Unexpected validation issues");
          }

          return Response.json(result.value, JSON_INIT);
        },
      );
    }

    break;
  }

  case "reply-status": {
    for (let index = 0; index < ROUTES; index++) {
      const path = `/r/${index}` as const;

      app.get(
        path,

        {
          /*
           * Metadata only.
           *
           * This preserves the exact
           * reply.status() contract without
           * installing an executable
           * response plan.
           */
          responses: {
            201: payloadSchema,
          },
        },

        ({ reply }) => reply.status(201, PAYLOAD),
      );
    }

    break;
  }

  default:
    throw new Error(`Unknown response benchmark case: ${CASE}`);
}

serve(
  app,

  {
    port: PORT,

    hostname: "127.0.0.1",

    reusePort: false,
  },
);
