import { Gelis } from "../../../../src";

import { serve } from "../../../../prototype/bun";

import { querySyncSchema } from "../../validation/schemas";

const PORT = Number(process.env.PORT ?? 3100);

const ROUTES = Number(process.env.ROUTES ?? 5000);

const CASE = process.env.CASE ?? "plain";

const app = new Gelis();

let lifecycleSink = 0;

function phaseWork(): void {
  lifecycleSink = (lifecycleSink + 1) | 0;
}

function globalBefore(): void {
  phaseWork();
}

function globalAfter(): void {
  phaseWork();
}

switch (CASE) {
  case "plain": {
    registerPlainRoutes();

    break;
  }

  case "global-before-sync": {
    app.onBeforeHandle(globalBefore);

    registerPlainRoutes();

    break;
  }

  case "global-after-sync": {
    app.onAfterHandle(globalAfter);

    registerPlainRoutes();

    break;
  }

  case "global-before-after-sync": {
    app.onBeforeHandle(globalBefore).onAfterHandle(globalAfter);

    registerPlainRoutes();

    break;
  }

  case "three-global-before-sync": {
    app
      .onBeforeHandle(globalBefore)
      .onBeforeHandle(globalBefore)
      .onBeforeHandle(globalBefore);

    registerPlainRoutes();

    break;
  }

  case "three-global-after-sync": {
    app
      .onAfterHandle(globalAfter)
      .onAfterHandle(globalAfter)
      .onAfterHandle(globalAfter);

    registerPlainRoutes();

    break;
  }

  case "validation-global-before": {
    app.onBeforeHandle(globalBefore);

    for (let index = 0; index < ROUTES; index++) {
      const path = `/r/${index}` as const;

      app.get(
        path,

        {
          query: querySyncSchema,
        },

        () => new Response("ok"),
      );
    }

    break;
  }

  case "global-early-return": {
    app.onBeforeHandle(() => {
      phaseWork();

      return new Response("early");
    });

    for (let index = 0; index < ROUTES; index++) {
      const path = `/r/${index}` as const;

      app.get(
        path,

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
    const path = `/r/${index}` as const;

    app.get(
      path,

      () => new Response("ok"),
    );
  }
}

void lifecycleSink;
