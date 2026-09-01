import { Gelis } from "../../../../src";

import { serve } from "../../../../prototype/bun";

const PORT = Number(process.env.PORT ?? 3100);

const ROUTES = Number(process.env.ROUTES ?? 5000);

const CASE = process.env.CASE ?? "plain";

const BENCH_ERROR = new Error("benchmark error");

let errorSink = 0;

function phaseWork(): void {
  errorSink = (errorSink + 1) | 0;
}

function syncError(): Response {
  phaseWork();

  return new Response("handled");
}

async function asyncError(): Promise<Response> {
  await Promise.resolve();

  phaseWork();

  return new Response("handled");
}

function requestError(): never {
  phaseWork();

  throw BENCH_ERROR;
}

const app = new Gelis();

switch (CASE) {
  case "plain":
    registerPlainRoutes();

    break;

  case "on-error-unused":
    app.onError(syncError);

    registerPlainRoutes();

    break;

  case "handler-error-sync":
    app.onError(syncError);

    registerSyncThrowingRoutes();

    break;

  case "handler-error-async":
    app.onError(syncError);

    registerAsyncThrowingRoutes();

    break;

  case "async-on-error":
    app.onError(asyncError);

    registerSyncThrowingRoutes();

    break;

  case "request-phase-error":
    /*
     * Register error handling first
     * intentionally.
     *
     * Application composition must
     * still become:
     *
     * onError
     * -> onRequest
     * -> routed fetch
     */
    app.onError(syncError).onRequest(requestError);

    registerPlainRoutes();

    break;

  default:
    throw new Error(`Unknown Gelis onError benchmark case: ${CASE}`);
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

function registerSyncThrowingRoutes(): void {
  for (let index = 0; index < ROUTES; index++) {
    app.get(
      `/r/${index}`,

      () => {
        throw BENCH_ERROR;
      },
    );
  }
}

function registerAsyncThrowingRoutes(): void {
  for (let index = 0; index < ROUTES; index++) {
    app.get(
      `/r/${index}`,

      async () => {
        throw BENCH_ERROR;
      },
    );
  }
}

void errorSink;
