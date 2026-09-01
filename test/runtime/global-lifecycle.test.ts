import { describe, expect, test } from "bun:test";

import { Gelis, defineModule } from "../../src";

import type { StandardSchemaV1 } from "../../src";

describe("Gelis global lifecycle runtime", () => {
  test("runs global and local lifecycle in phase order", async () => {
    const events: string[] = [];

    const app = new Gelis();

    app.onBeforeHandle(() => {
      events.push("global-before");
    });

    app.onAfterHandle(() => {
      events.push("global-after");
    });

    app.get(
      "/order",

      () => {
        events.push("handler");

        return "ok";
      },

      {
        beforeHandle: () => {
          events.push("local-before");
        },

        afterHandle: () => {
          events.push("local-after");
        },
      },
    );

    const result = app.fetch(new Request("http://gelis.test/order"));

    expect(result).toBeInstanceOf(Response);

    const response = await result;

    expect(await response.text()).toBe("ok");

    expect(events).toEqual([
      "global-before",
      "local-before",
      "handler",
      "local-after",
      "global-after",
    ]);
  });

  test("applies a global beforeHandle added after route registration", async () => {
    const events: string[] = [];

    const app = new Gelis();

    app.get(
      "/late-before",

      () => {
        events.push("handler");

        return "ok";
      },
    );

    app.onBeforeHandle(() => {
      events.push("global-before");
    });

    const response = await app.fetch(
      new Request("http://gelis.test/late-before"),
    );

    expect(await response.text()).toBe("ok");

    expect(events).toEqual(["global-before", "handler"]);
  });

  test("applies a global afterHandle added after route registration", async () => {
    const events: string[] = [];

    const app = new Gelis();

    app.get(
      "/late-after",

      () => {
        events.push("handler");

        return "ok";
      },
    );

    app.onAfterHandle(() => {
      events.push("global-after");
    });

    const response = await app.fetch(
      new Request("http://gelis.test/late-after"),
    );

    expect(await response.text()).toBe("ok");

    expect(events).toEqual(["handler", "global-after"]);
  });

  test("preserves multiple global beforeHandle registration order", async () => {
    const events: string[] = [];

    const app = new Gelis();

    app.onBeforeHandle(() => {
      events.push("before-1");
    });

    app.onBeforeHandle(() => {
      events.push("before-2");
    });

    app.onBeforeHandle(() => {
      events.push("before-3");
    });

    app.get(
      "/many-before",

      () => {
        events.push("handler");

        return "ok";
      },
    );

    await app.fetch(new Request("http://gelis.test/many-before"));

    expect(events).toEqual(["before-1", "before-2", "before-3", "handler"]);
  });

  test("preserves local then global afterHandle order", async () => {
    const events: string[] = [];

    const app = new Gelis();

    app.onAfterHandle(() => {
      events.push("after-1");
    });

    app.onAfterHandle(() => {
      events.push("after-2");
    });

    app.get(
      "/many-after",

      () => {
        events.push("handler");

        return "ok";
      },

      {
        afterHandle: () => {
          events.push("local-after");
        },
      },
    );

    await app.fetch(new Request("http://gelis.test/many-after"));

    expect(events).toEqual(["handler", "local-after", "after-1", "after-2"]);
  });

  test("short-circuits from a global beforeHandle", async () => {
    const events: string[] = [];

    const app = new Gelis();

    app.onBeforeHandle(() => {
      events.push("global-before");

      return new Response(
        "blocked",

        {
          status: 401,
        },
      );
    });

    app.onAfterHandle(() => {
      events.push("global-after");
    });

    app.get(
      "/blocked",

      () => {
        events.push("handler");

        return "handler";
      },

      {
        beforeHandle: () => {
          events.push("local-before");
        },

        afterHandle: () => {
          events.push("local-after");
        },
      },
    );

    const response = await app.fetch(new Request("http://gelis.test/blocked"));

    expect(response.status).toBe(401);

    expect(await response.text()).toBe("blocked");

    expect(events).toEqual(["global-before"]);
  });

  test("runs validation before global beforeHandle", async () => {
    const events: string[] = [];

    const Query = createSchema<
      Record<string, string | string[]>,
      {
        page: number;
      }
    >((value) => {
      events.push("validate");

      const query = value as Record<string, string | string[]>;

      return {
        value: {
          page: Number(query.page),
        },
      };
    });

    const app = new Gelis();

    app.onBeforeHandle(({ query }) => {
      const validated = query as {
        page: number;
      };

      events.push(`global:${validated.page}`);
    });

    app.get(
      "/validated",

      {
        query: Query,
      },

      ({ query }) => {
        events.push(`handler:${query.page}`);

        return "ok";
      },
    );

    await app.fetch(new Request("http://gelis.test/validated?page=42"));

    expect(events).toEqual(["validate", "global:42", "handler:42"]);
  });

  test("supports mixed synchronous and asynchronous global hooks", async () => {
    const events: string[] = [];

    const app = new Gelis();

    app.onBeforeHandle(() => {
      events.push("before-sync");
    });

    app.onBeforeHandle(async () => {
      await Promise.resolve();

      events.push("before-async");
    });

    app.onAfterHandle(async () => {
      await Promise.resolve();

      events.push("after-async");
    });

    app.onAfterHandle(() => {
      events.push("after-sync");
    });

    app.get(
      "/async",

      () => {
        events.push("handler");

        return "ok";
      },
    );

    const result = app.fetch(new Request("http://gelis.test/async"));

    expect(result).toBeInstanceOf(Promise);

    const response = await result;

    expect(await response.text()).toBe("ok");

    expect(events).toEqual([
      "before-sync",
      "before-async",
      "handler",
      "after-async",
      "after-sync",
    ]);
  });

  test("keeps module lifecycle isolated between applications", async () => {
    let appAGlobalCalls = 0;

    const module = defineModule(
      "/shared",

      (route) => ({
        value: route.get(
          "/value",

          () => "ok",
        ),
      }),
    );

    const appA = new Gelis();

    appA.onBeforeHandle(() => {
      appAGlobalCalls++;
    });

    appA.mount(module);

    const appB = new Gelis();

    appB.mount(module);

    const responseA = await appA.fetch(
      new Request("http://gelis.test/shared/value"),
    );

    expect(await responseA.text()).toBe("ok");

    expect(appAGlobalCalls).toBe(1);

    const responseB = await appB.fetch(
      new Request("http://gelis.test/shared/value"),
    );

    expect(await responseB.text()).toBe("ok");

    expect(appAGlobalCalls).toBe(1);
  });
});

function createSchema<Input = unknown, Output = Input>(
  validate: (
    value: unknown,
  ) =>
    | StandardSchemaV1.Result<Output>
    | Promise<StandardSchemaV1.Result<Output>>,
): StandardSchemaV1<Input, Output> {
  return {
    "~standard": {
      version: 1,

      vendor: "gelis-test",

      validate,
    },
  } as StandardSchemaV1<Input, Output>;
}
