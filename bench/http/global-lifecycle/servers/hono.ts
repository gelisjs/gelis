import { Hono } from "hono";

import { sValidator } from "@hono/standard-validator";

import { querySyncSchema } from "../../validation/schemas";

import type { MiddlewareHandler } from "hono";

const PORT = Number(process.env.PORT ?? 3100);

const ROUTES = Number(process.env.ROUTES ?? 5000);

const CASE = process.env.CASE ?? "plain";

const app = new Hono();

let lifecycleSink = 0;

function phaseWork(): void {
  lifecycleSink = (lifecycleSink + 1) | 0;
}

/*
 * Best-case before-only middleware:
 * perform user work, then directly return next().
 *
 * No unnecessary async wrapper is added here.
 */
const globalBefore: MiddlewareHandler = (_context, next) => {
  phaseWork();

  return next();
};

/*
 * Hono's after phase naturally requires
 * continuation through next().
 */
const globalAfter: MiddlewareHandler = async (_context, next) => {
  await next();

  phaseWork();
};

/*
 * Hono can idiomatically represent both phases
 * in one onion middleware. We intentionally use
 * that native advantage rather than forcing two
 * middleware callbacks.
 */
const globalBeforeAfter: MiddlewareHandler = async (_context, next) => {
  phaseWork();

  await next();

  phaseWork();
};

const globalEarlyReturn: MiddlewareHandler = async () => {
  phaseWork();

  return new Response("early");
};

switch (CASE) {
  case "plain": {
    registerPlainRoutes();

    break;
  }

  case "global-before-sync": {
    app.use(globalBefore);

    registerPlainRoutes();

    break;
  }

  case "global-after-sync": {
    app.use(globalAfter);

    registerPlainRoutes();

    break;
  }

  case "global-before-after-sync": {
    app.use(globalBeforeAfter);

    registerPlainRoutes();

    break;
  }

  case "three-global-before-sync": {
    app.use(globalBefore);

    app.use(globalBefore);

    app.use(globalBefore);

    registerPlainRoutes();

    break;
  }

  case "three-global-after-sync": {
    app.use(globalAfter);

    app.use(globalAfter);

    app.use(globalAfter);

    registerPlainRoutes();

    break;
  }

  case "validation-global-before": {
    /*
     * Register Standard Schema validation before
     * the user global before phase.
     *
     * This gives the same logical ordering as
     * Gelis:
     *
     * validation -> global before -> handler
     *
     * The validator itself is global here, which
     * is a conservative setup for Gelis because
     * Hono doesn't need 5000 validator handlers.
     */
    app.use(sValidator("query", querySyncSchema));

    app.use(globalBefore);

    registerPlainRoutes();

    break;
  }

  case "global-early-return": {
    app.use(globalEarlyReturn);

    for (let index = 0; index < ROUTES; index++) {
      app.get(
        `/r/${index}`,

        () => {
          throw new Error("Handler must not run");
        },
      );
    }

    break;
  }

  default:
    throw new Error(`Unknown global lifecycle case: ${CASE}`);
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

void lifecycleSink;
