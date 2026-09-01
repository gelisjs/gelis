import { Elysia } from "elysia";

const PORT = Number(process.env.PORT ?? 3100);

const ROUTES = Number(process.env.ROUTES ?? 5000);

const CASE = process.env.CASE ?? "plain";

const PRECOMPILE = process.env.PRECOMPILE === "true";

const BENCH_ERROR = new Error("benchmark error");

let errorSink = 0;

function phaseWork(): void {
  errorSink = (errorSink + 1) | 0;
}

function requestError(): never {
  phaseWork();

  throw BENCH_ERROR;
}

const app = new Elysia({
  precompile: PRECOMPILE,
});

switch (CASE) {
  case "plain":
    registerPlainRoutes();

    break;

  case "on-error-unused":
    app.onError(({ set }) => {
      set.status = 200;

      phaseWork();

      return new Response("handled", {
        status: 200,
      });
    });

    registerPlainRoutes();

    break;

  case "handler-error-sync":
    app.onError(({ set }) => {
      set.status = 200;

      phaseWork();

      return new Response("handled", {
        status: 200,
      });
    });

    registerSyncThrowingRoutes();

    break;

  case "handler-error-async":
    app.onError(({ set }) => {
      set.status = 200;

      phaseWork();

      return new Response("handled", {
        status: 200,
      });
    });

    registerAsyncThrowingRoutes();

    break;

  case "async-on-error":
    app.onError(async ({ set }) => {
      set.status = 200;

      await Promise.resolve();

      phaseWork();

      return new Response("handled", {
        status: 200,
      });
    });

    registerSyncThrowingRoutes();

    break;

  case "request-phase-error":
    app.onError(({ set }) => {
      set.status = 200;

      phaseWork();

      return new Response("handled", {
        status: 200,
      });
    });

    app.onRequest(requestError);

    registerPlainRoutes();

    break;

  default:
    throw new Error(`Unknown Elysia onError benchmark case: ${CASE}`);
}

app.listen({
  port: PORT,

  hostname: "127.0.0.1",

  reusePort: false,
});

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
