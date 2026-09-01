import { Gelis } from "../../../../src";

import { serve } from "../../../../prototype/bun";

import { querySyncSchema } from "../../validation/schemas";

const PORT = Number(process.env.PORT ?? 3100);

const ROUTES = Number(process.env.ROUTES ?? 5000);

const CASE = process.env.CASE ?? "plain";

let requestSink = 0;

function phaseWork(): void {
  requestSink = (requestSink + 1) | 0;
}

function syncRequest(): void {
  phaseWork();
}

async function asyncRequest(): Promise<void> {
  await Promise.resolve();

  phaseWork();
}

function earlyRequest(): Response {
  phaseWork();

  return new Response("early");
}

const app = new Gelis();

switch (CASE) {
  case "plain":
    registerPlainRoutes();

    break;

  case "on-request-sync":
    app.onRequest(syncRequest);

    registerPlainRoutes();

    break;

  case "two-on-request-sync":
    app.onRequest(syncRequest).onRequest(syncRequest);

    registerPlainRoutes();

    break;

  case "three-on-request-sync":
    app.onRequest(syncRequest).onRequest(syncRequest).onRequest(syncRequest);

    registerPlainRoutes();

    break;

  case "on-request-async":
    app.onRequest(asyncRequest);

    registerPlainRoutes();

    break;

  case "validation-on-request":
    app.onRequest(syncRequest);

    registerValidatedRoutes();

    break;

  case "early-return":
    app.onRequest(earlyRequest);

    registerThrowingRoutes();

    break;

  default:
    throw new Error(`Unknown Gelis onRequest benchmark case: ${CASE}`);
}

serve(
  app,

  {
    port: PORT,

    hostname: "127.0.0.1",

    reusePort: false,
  },
);

function registerPlainRoutes(): void {
  for (let index = 0; index < ROUTES; index++) {
    app.get(
      `/r/${index}`,

      () => new Response("ok"),
    );
  }
}

function registerValidatedRoutes(): void {
  for (let index = 0; index < ROUTES; index++) {
    app.get(
      `/r/${index}`,

      {
        query: querySyncSchema,
      },

      () => new Response("ok"),
    );
  }
}

function registerThrowingRoutes(): void {
  for (let index = 0; index < ROUTES; index++) {
    app.get(
      `/r/${index}`,

      () => {
        throw new Error("Handler must not run");
      },
    );
  }
}

void requestSink;
