import { Elysia } from "elysia";

import { querySyncSchema } from "../../validation/schemas";

const PORT = Number(process.env.PORT ?? 3100);

const ROUTES = Number(process.env.ROUTES ?? 5000);

const CASE = process.env.CASE ?? "plain";

const PRECOMPILE = process.env.PRECOMPILE === "true";

const app = new Elysia({
  precompile: PRECOMPILE,

  serve: {
    hostname: "127.0.0.1",

    reusePort: false,
  },
});

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
    app.onBeforeHandle(
      {
        as: "global",
      },

      globalBefore,
    );

    registerPlainRoutes();

    break;
  }

  case "global-after-sync": {
    app.onAfterHandle(
      {
        as: "global",
      },

      globalAfter,
    );

    registerPlainRoutes();

    break;
  }

  case "global-before-after-sync": {
    app.onBeforeHandle(
      {
        as: "global",
      },

      globalBefore,
    );

    app.onAfterHandle(
      {
        as: "global",
      },

      globalAfter,
    );

    registerPlainRoutes();

    break;
  }

  case "three-global-before-sync": {
    app.onBeforeHandle(
      {
        as: "global",
      },

      globalBefore,
    );

    app.onBeforeHandle(
      {
        as: "global",
      },

      globalBefore,
    );

    app.onBeforeHandle(
      {
        as: "global",
      },

      globalBefore,
    );

    registerPlainRoutes();

    break;
  }

  case "three-global-after-sync": {
    app.onAfterHandle(
      {
        as: "global",
      },

      globalAfter,
    );

    app.onAfterHandle(
      {
        as: "global",
      },

      globalAfter,
    );

    app.onAfterHandle(
      {
        as: "global",
      },

      globalAfter,
    );

    registerPlainRoutes();

    break;
  }

  case "validation-global-before": {
    app.onBeforeHandle(
      {
        as: "global",
      },

      globalBefore,
    );

    for (let index = 0; index < ROUTES; index++) {
      app.get(
        `/r/${index}`,

        () => new Response("ok"),

        {
          query: querySyncSchema,
        },
      );
    }

    break;
  }

  case "global-early-return": {
    app.onBeforeHandle(
      {
        as: "global",
      },

      () => {
        phaseWork();

        return new Response("early");
      },
    );

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

app.listen(PORT);

function registerPlainRoutes(): void {
  for (let index = 0; index < ROUTES; index++) {
    app.get(
      `/r/${index}`,

      () => new Response("ok"),
    );
  }
}

void lifecycleSink;
