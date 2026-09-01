import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";

import type { StandardSchemaV1 } from "../../src";

describe("Gelis onRequest runtime", () => {
  test("runs before validation and route lifecycle", async () => {
    const events: string[] = [];

    const schema = {
      "~standard": {
        version: 1,

        vendor: "gelis-test",

        validate(_value: unknown) {
          events.push("validation");

          return {
            value: {
              ok: true,
            },
          };
        },
      },
    } as StandardSchemaV1<
      unknown,
      {
        readonly ok: boolean;
      }
    >;

    const app = new Gelis();

    app.onRequest(() => {
      events.push("on-request");
    });

    app.onBeforeHandle(() => {
      events.push("global-before");
    });

    app.onAfterHandle(() => {
      events.push("global-after");
    });

    app.get(
      "/ordered",

      {
        query: schema,
      },

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

    const response = await app.fetch(
      new Request("http://gelis.test/ordered?q=1"),
    );

    expect(await response.text()).toBe("ok");

    expect(events).toEqual([
      "on-request",
      "validation",
      "global-before",
      "local-before",
      "handler",
      "local-after",
      "global-after",
    ]);
  });

  test("runs for unmatched routes", async () => {
    const events: string[] = [];

    const app = new Gelis();

    app.onRequest(() => {
      events.push("on-request");
    });

    const result = app.fetch(new Request("http://gelis.test/missing"));

    expect(result).toBeInstanceOf(Response);

    const response = result as Response;

    expect(response.status).toBe(404);

    expect(events).toEqual(["on-request"]);
  });

  test("receives the original Request", () => {
    const app = new Gelis();

    let seen: Request | undefined;

    app.onRequest(({ request }) => {
      seen = request;
    });

    app.get("/request", () => "ok");

    const request = new Request("http://gelis.test/request");

    app.fetch(request);

    expect(seen).toBe(request);
  });

  test("keeps synchronous requests synchronous", () => {
    const app = new Gelis();

    app.onRequest(() => undefined);

    app.get("/sync", () => "ok");

    const result = app.fetch(new Request("http://gelis.test/sync"));

    expect(result).toBeInstanceOf(Response);
  });

  test("preserves multiple hook registration order", () => {
    const events: string[] = [];

    const app = new Gelis();

    app
      .onRequest(() => {
        events.push("first");
      })
      .onRequest(() => {
        events.push("second");
      })
      .onRequest(() => {
        events.push("third");
      });

    app.get("/multiple", () => {
      events.push("handler");

      return "ok";
    });

    app.fetch(new Request("http://gelis.test/multiple"));

    expect(events).toEqual(["first", "second", "third", "handler"]);
  });

  test("short-circuits remaining hooks and routing", async () => {
    const events: string[] = [];

    const app = new Gelis();

    app
      .onRequest(() => {
        events.push("first");
      })
      .onRequest(() => {
        events.push("second");

        return new Response(
          "blocked",

          {
            status: 401,
          },
        );
      })
      .onRequest(() => {
        events.push("third");
      });

    app.get("/blocked", () => {
      events.push("handler");

      return "handler";
    });

    const result = app.fetch(new Request("http://gelis.test/blocked"));

    expect(result).toBeInstanceOf(Response);

    const response = result as Response;

    expect(response.status).toBe(401);

    expect(await response.text()).toBe("blocked");

    expect(events).toEqual(["first", "second"]);
  });

  test("treats falsy non-undefined values as early results", async () => {
    const app = new Gelis();

    app.onRequest(() => false);

    app.get("/falsy", () => "handler");

    const result = app.fetch(new Request("http://gelis.test/falsy"));

    expect(result).toBeInstanceOf(Response);

    const response = result as Response;

    expect(await response.text()).toBe("false");
  });

  test("preserves order through an asynchronous middle hook", async () => {
    const events: string[] = [];

    const app = new Gelis();

    app
      .onRequest(() => {
        events.push("first");
      })
      .onRequest(async () => {
        await Promise.resolve();

        events.push("second");
      })
      .onRequest(() => {
        events.push("third");
      });

    app.get("/async-middle", () => {
      events.push("handler");

      return "ok";
    });

    const result = app.fetch(new Request("http://gelis.test/async-middle"));

    expect(result).toBeInstanceOf(Promise);

    const response = await result;

    expect(await response.text()).toBe("ok");

    expect(events).toEqual(["first", "second", "third", "handler"]);
  });

  test("short-circuits from an asynchronous early result", async () => {
    const events: string[] = [];

    const app = new Gelis();

    app
      .onRequest(() => {
        events.push("first");
      })
      .onRequest(async () => {
        await Promise.resolve();

        events.push("second");

        return new Response(
          "async-blocked",

          {
            status: 403,
          },
        );
      })
      .onRequest(() => {
        events.push("third");
      });

    app.get("/async-early", () => {
      events.push("handler");

      return "handler";
    });

    const response = await app.fetch(
      new Request("http://gelis.test/async-early"),
    );

    expect(response.status).toBe(403);

    expect(await response.text()).toBe("async-blocked");

    expect(events).toEqual(["first", "second"]);
  });

  test("applies a hook added after route registration", () => {
    const events: string[] = [];

    const app = new Gelis();

    app.get("/late", () => {
      events.push("handler");

      return "ok";
    });

    app.onRequest(() => {
      events.push("on-request");
    });

    app.fetch(new Request("http://gelis.test/late"));

    expect(events).toEqual(["on-request", "handler"]);
  });

  test("propagates synchronous hook errors", () => {
    const app = new Gelis();

    app.onRequest(() => {
      throw new Error("sync boom");
    });

    app.get("/sync-error", () => "ok");

    expect(() =>
      app.fetch(new Request("http://gelis.test/sync-error")),
    ).toThrow("sync boom");
  });

  test("propagates asynchronous hook errors", async () => {
    const app = new Gelis();

    app.onRequest(async () => {
      await Promise.resolve();

      throw new Error("async boom");
    });

    app.get("/async-error", () => "ok");

    await expect(
      Promise.resolve(app.fetch(new Request("http://gelis.test/async-error"))),
    ).rejects.toThrow("async boom");
  });
});
