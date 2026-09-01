import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";

const VALIDATION_ERROR = new Error("validation exploded");

const ASYNC_VALIDATION_ERROR = new Error("async validation exploded");

const throwingQuerySchema = {
  "~standard": {
    version: 1 as const,

    vendor: "gelis-test",

    validate() {
      throw VALIDATION_ERROR;
    },
  },
};

const rejectingQuerySchema = {
  "~standard": {
    version: 1 as const,

    vendor: "gelis-test",

    validate() {
      return Promise.reject(ASYNC_VALIDATION_ERROR);
    },
  },
};

const invalidQuerySchema = {
  "~standard": {
    version: 1 as const,

    vendor: "gelis-test",

    validate() {
      return {
        issues: [
          {
            message: "invalid query",
          },
        ],
      };
    },
  },
};

describe("Gelis onError runtime", () => {
  test("handles a synchronous handler error", async () => {
    const app = new Gelis();

    const original = new Error("handler failed");

    app.onError(({ request, error }) => {
      expect(request.url).toBe("http://localhost/error");

      expect(error).toBe(original);

      return new Response("handled", {
        status: 500,
      });
    });

    app.get("/error", () => {
      throw original;
    });

    const response = await app.fetch(new Request("http://localhost/error"));

    expect(response.status).toBe(500);

    expect(await response.text()).toBe("handled");
  });

  test("handles an asynchronous handler rejection", async () => {
    const app = new Gelis();

    const original = new Error("async handler failed");

    app.onError(({ error }) => {
      expect(error).toBe(original);

      return new Response("handled", {
        status: 500,
      });
    });

    app.get("/error", async () => {
      throw original;
    });

    const response = await app.fetch(new Request("http://localhost/error"));

    expect(response.status).toBe(500);
  });

  test("handles an onRequest throw", async () => {
    const app = new Gelis();

    const original = new Error("request failed");

    let handlerRan = false;

    app.onRequest(() => {
      throw original;
    });

    app.onError(({ error }) => {
      expect(error).toBe(original);

      return new Response("request handled", {
        status: 500,
      });
    });

    app.get("/", () => {
      handlerRan = true;

      return new Response("must not run");
    });

    const response = await app.fetch(new Request("http://localhost/"));

    expect(response.status).toBe(500);

    expect(handlerRan).toBe(false);
  });

  test("handles an asynchronous onRequest rejection", async () => {
    const app = new Gelis();

    const original = new Error("async request failed");

    app.onRequest(() => Promise.reject(original));

    app.onError(({ error }) => {
      expect(error).toBe(original);

      return new Response("handled", {
        status: 500,
      });
    });

    app.get("/", () => new Response("must not run"));

    const response = await app.fetch(new Request("http://localhost/"));

    expect(response.status).toBe(500);
  });

  test("handles a validator throw", async () => {
    const app = new Gelis();

    app.onError(({ error }) => {
      expect(error).toBe(VALIDATION_ERROR);

      return new Response("validation handled", {
        status: 500,
      });
    });

    app.get(
      "/validated",
      {
        query: throwingQuerySchema,
      },
      () => new Response("must not run"),
    );

    const response = await app.fetch(new Request("http://localhost/validated"));

    expect(response.status).toBe(500);
  });

  test("handles an asynchronous validator rejection", async () => {
    const app = new Gelis();

    app.onError(({ error }) => {
      expect(error).toBe(ASYNC_VALIDATION_ERROR);

      return new Response("validation handled", {
        status: 500,
      });
    });

    app.get(
      "/validated",
      {
        query: rejectingQuerySchema,
      },
      () => new Response("must not run"),
    );

    const response = await app.fetch(new Request("http://localhost/validated"));

    expect(response.status).toBe(500);
  });

  test("handles a beforeHandle throw", async () => {
    const app = new Gelis();

    const original = new Error("before failed");

    app.onError(({ error }) => {
      expect(error).toBe(original);

      return new Response("handled", {
        status: 500,
      });
    });

    app.get("/before", () => new Response("must not run"), {
      beforeHandle() {
        throw original;
      },
    });

    const response = await app.fetch(new Request("http://localhost/before"));

    expect(response.status).toBe(500);
  });

  test("handles an afterHandle throw", async () => {
    const app = new Gelis();

    const original = new Error("after failed");

    app.onError(({ error }) => {
      expect(error).toBe(original);

      return new Response("handled", {
        status: 500,
      });
    });

    app.get("/after", () => new Response("ok"), {
      afterHandle() {
        throw original;
      },
    });

    const response = await app.fetch(new Request("http://localhost/after"));

    expect(response.status).toBe(500);
  });

  test("handles response normalization errors", async () => {
    const app = new Gelis();

    let caught: unknown;

    app.onError(({ error }) => {
      caught = error;

      return new Response("normalization handled", {
        status: 500,
      });
    });

    const circular: Record<string, unknown> = {};

    circular.self = circular;

    app.get("/circular", () => circular);

    const response = await app.fetch(new Request("http://localhost/circular"));

    expect(response.status).toBe(500);

    expect(caught).toBeInstanceOf(Error);
  });

  test("preserves multiple onError registration order", async () => {
    const app = new Gelis();

    const order: string[] = [];

    app.onError(() => {
      order.push("first");

      return undefined;
    });

    app.onError(() => {
      order.push("second");

      return new Response("handled", {
        status: 501,
      });
    });

    app.onError(() => {
      order.push("third");

      return new Response("must not run");
    });

    app.get("/", () => {
      throw new Error("boom");
    });

    const response = await app.fetch(new Request("http://localhost/"));

    expect(response.status).toBe(501);

    expect(order).toEqual(["first", "second"]);
  });

  test("treats falsy non-undefined values as handled", async () => {
    const app = new Gelis();

    let secondRan = false;

    app.onError(() => null);

    app.onError(() => {
      secondRan = true;

      return new Response("must not run");
    });

    app.get("/", () => {
      throw new Error("boom");
    });

    const response = await app.fetch(new Request("http://localhost/"));

    expect(response.status).toBe(200);

    expect(await response.text()).toBe("null");

    expect(secondRan).toBe(false);
  });

  test("rethrows the original error when every handler returns undefined", () => {
    const app = new Gelis();

    const original = new Error("original");

    app.onError(() => undefined);

    app.onError(() => undefined);

    app.get("/", () => {
      throw original;
    });

    let caught: unknown;

    try {
      app.fetch(new Request("http://localhost/"));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(original);
  });

  test("propagates a new error thrown by onError and skips remaining handlers", () => {
    const app = new Gelis();

    const replacement = new Error("error handler failed");

    let secondRan = false;

    app.onError(() => {
      throw replacement;
    });

    app.onError(() => {
      secondRan = true;

      return new Response("must not run");
    });

    app.get("/", () => {
      throw new Error("original");
    });

    let caught: unknown;

    try {
      app.fetch(new Request("http://localhost/"));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(replacement);

    expect(secondRan).toBe(false);
  });

  test("propagates a rejection from onError and skips remaining handlers", async () => {
    const app = new Gelis();

    const replacement = new Error("async error handler failed");

    let secondRan = false;

    app.onError(() => Promise.reject(replacement));

    app.onError(() => {
      secondRan = true;

      return new Response("must not run");
    });

    app.get("/", () => {
      throw new Error("original");
    });

    let caught: unknown;

    try {
      await app.fetch(new Request("http://localhost/"));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(replacement);

    expect(secondRan).toBe(false);
  });

  test("does not run onError for a 404 response", async () => {
    const app = new Gelis();

    let errorRuns = 0;

    app.onError(() => {
      errorRuns++;

      return new Response("must not run");
    });

    const response = await app.fetch(new Request("http://localhost/missing"));

    expect(response.status).toBe(404);

    expect(errorRuns).toBe(0);
  });

  test("does not run onError for a normal validation failure", async () => {
    const app = new Gelis();

    let errorRuns = 0;

    app.onError(() => {
      errorRuns++;

      return new Response("must not run");
    });

    app.get(
      "/validated",
      {
        query: invalidQuerySchema,
      },
      () => new Response("must not run"),
    );

    const response = await app.fetch(new Request("http://localhost/validated"));

    expect(response.status).toBe(422);

    expect(errorRuns).toBe(0);
  });

  test("keeps successful synchronous requests synchronous", () => {
    const app = new Gelis();

    app.onError(() => new Response("handled"));

    app.get("/", () => new Response("ok"));

    const result = app.fetch(new Request("http://localhost/"));

    expect(isPromiseLike(result)).toBe(false);

    expect(result).toBeInstanceOf(Response);
  });

  test("keeps onError outside onRequest regardless of registration order", async () => {
    const first = createRegistrationOrderApp("error-first");

    const second = createRegistrationOrderApp("request-first");

    const firstResponse = await first.fetch(new Request("http://localhost/"));

    const secondResponse = await second.fetch(new Request("http://localhost/"));

    expect(firstResponse.status).toBe(500);

    expect(secondResponse.status).toBe(500);

    expect(await firstResponse.text()).toBe("handled");

    expect(await secondResponse.text()).toBe("handled");
  });
});

function createRegistrationOrderApp(
  order: "error-first" | "request-first",
): Gelis {
  const app = new Gelis();

  const requestError = new Error("request error");

  const requestHook = () => {
    throw requestError;
  };

  const errorHook = ({ error }: { error: unknown }) => {
    expect(error).toBe(requestError);

    return new Response("handled", {
      status: 500,
    });
  };

  if (order === "error-first") {
    app.onError(errorHook);

    app.onRequest(requestHook);
  } else {
    app.onRequest(requestHook);

    app.onError(errorHook);
  }

  app.get("/", () => new Response("must not run"));

  return app;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
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
