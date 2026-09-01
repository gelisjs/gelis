import { Hono } from "hono";

import { sValidator } from "@hono/standard-validator";

import { querySyncSchema } from "../../validation/schemas";

import type { MiddlewareHandler } from "hono";

const PORT = Number(process.env.PORT ?? 3100);

const ROUTES = Number(process.env.ROUTES ?? 5000);

const CASE = process.env.CASE ?? "plain";

let requestSink = 0;

function phaseWork(): void {
  requestSink = (requestSink + 1) | 0;
}

/*
 * Closest Hono native equivalent to a
 * global request hook.
 *
 * Work is done before next().
 */
const syncRequest: MiddlewareHandler = (_context, next) => {
  phaseWork();

  return next();
};

const asyncRequest: MiddlewareHandler = async (_context, next) => {
  await Promise.resolve();

  phaseWork();

  return next();
};

const earlyRequest: MiddlewareHandler = async () => {
  phaseWork();

  return new Response("early");
};

const app = new Hono();

switch (CASE) {
  case "plain":
    registerPlainRoutes();

    break;

  case "on-request-sync":
    app.use(syncRequest);

    registerPlainRoutes();

    break;

  case "two-on-request-sync":
    app.use(syncRequest);

    app.use(syncRequest);

    registerPlainRoutes();

    break;

  case "three-on-request-sync":
    app.use(syncRequest);

    app.use(syncRequest);

    app.use(syncRequest);

    registerPlainRoutes();

    break;

  case "on-request-async":
    app.use(asyncRequest);

    registerPlainRoutes();

    break;

  case "validation-on-request":
    /*
     * Request work first, then validation.
     *
     * A single global Standard Schema validator
     * is intentionally favorable to Hono.
     */
    app.use(syncRequest);

    app.use(sValidator("query", querySyncSchema));

    registerPlainRoutes();

    break;

  case "early-return":
    app.use(earlyRequest);

    registerThrowingRoutes();

    break;

  default:
    throw new Error(`Unknown Hono onRequest benchmark case: ${CASE}`);
}

Bun.serve({
  port: PORT,

  hostname: "127.0.0.1",

  reusePort: false,

  fetch: app.fetch,
});

function registerPlainRoutes(): void {
  for (let index = 0; index < ROUTES; index++) {
    app.get(
      `/r/${index}`,

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
