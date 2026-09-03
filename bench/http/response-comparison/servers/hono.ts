import { Hono } from "hono";

import {
  PAYLOAD,
  TEXT,
  VALIDATION_INPUT,
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

const JSON_INIT: ResponseInit = {
  status: 200,
};

const STATUS_JSON_INIT: ResponseInit = {
  status: 201,
};

const TEXT_INIT: ResponseInit = {
  status: 200,

  headers: {
    "content-type": "text/plain; charset=utf-8",
  },
};

const app = new Hono();

switch (CASE) {
  case "raw-response": {
    for (let index = 0; index < ROUTES; index++) {
      const path = `/r/${index}`;

      app.get(
        path,

        () => RAW_RESPONSE,
      );
    }

    break;
  }

  case "json": {
    for (let index = 0; index < ROUTES; index++) {
      const path = `/r/${index}`;

      app.get(
        path,

        () => Response.json(PAYLOAD, JSON_INIT),
      );
    }

    break;
  }

  case "text": {
    for (let index = 0; index < ROUTES; index++) {
      const path = `/r/${index}`;

      app.get(
        path,

        () => new Response(TEXT, TEXT_INIT),
      );
    }

    break;
  }

  case "validate-json": {
    for (let index = 0; index < ROUTES; index++) {
      const path = `/r/${index}`;

      app.get(
        path,

        () => {
          /*
           * Hand-written equivalent fast path.
           *
           * Hono is not forced through middleware
           * that Gelis does not require. It consumes
           * the same Standard Schema object directly.
           */
          const result =
            validationSchema["~standard"].validate(VALIDATION_INPUT);

          if (isPromiseLike(result)) {
            throw new Error(
              "Response comparison validation schema unexpectedly became asynchronous",
            );
          }

          if (result.issues !== undefined) {
            throw new Error("Unexpected validation issues");
          }

          return Response.json(result.value, JSON_INIT);
        },
      );
    }

    break;
  }

  case "status-json": {
    for (let index = 0; index < ROUTES; index++) {
      const path = `/r/${index}`;

      app.get(
        path,

        () => Response.json(PAYLOAD, STATUS_JSON_INIT),
      );
    }

    break;
  }

  default:
    throw new Error(`Unknown response comparison case: ${CASE}`);
}

Bun.serve({
  port: PORT,

  hostname: "127.0.0.1",

  reusePort: false,

  fetch: app.fetch,
});

function isPromiseLike<Value>(
  value: Value | PromiseLike<Value>,
): value is PromiseLike<Value> {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return false;
  }

  return (
    typeof (
      value as {
        then?: unknown;
      }
    ).then === "function"
  );
}
