import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src/app";
import { cors } from "../../src/cors/index";
import { requestId } from "../../src/request-id/index";
import { secureHeaders } from "../../src/secure-headers/index";
import { TimeoutError, timeout } from "../../src/timeout/index";

import type { StandardSchemaV1 } from "../../src/schema";

const API_URL = "https://api.example";
const ORIGIN = "https://client.example";

const sleep = (duration: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, duration));

describe("P11-G timeout abort/race/cross-capability correctness", () => {
  test("preserves an already-aborted incoming signal without synthesizing a timeout", async () => {
    const controller = new AbortController();
    const incomingReason = new Error("client already disconnected");
    controller.abort(incomingReason);

    const app = new Gelis();
    const deadlines = timeout({ duration: 100 });
    let seenSignal: AbortSignal | undefined;

    app.use(deadlines);
    app.get("/resource", ({ request }) => {
      seenSignal = deadlines.signal(request);
      return new Response("client-aborted", { status: 499 });
    });

    const request = new Request(`${API_URL}/resource`, {
      signal: controller.signal,
    });
    const response = await app.fetch(request);

    expect(response.status).toBe(499);
    expect(await response.text()).toBe("client-aborted");
    expect(seenSignal?.aborted).toBe(true);
    expect(seenSignal?.reason).toBe(incomingReason);
    expect(seenSignal?.reason).not.toBeInstanceOf(TimeoutError);
  });

  test("propagates a later incoming abort without relabeling it as framework timeout", async () => {
    const controller = new AbortController();
    const app = new Gelis();
    const deadlines = timeout({ duration: 100 });
    let seenSignal: AbortSignal | undefined;

    app.use(deadlines);
    app.get("/resource", ({ request }) => {
      const signal = deadlines.signal(request);
      seenSignal = signal;

      return new Promise<Response>((resolve) => {
        signal.addEventListener(
          "abort",
          () => resolve(new Response("cooperative-client-abort", { status: 499 })),
          { once: true },
        );
      });
    });

    const request = new Request(`${API_URL}/resource`, {
      signal: controller.signal,
    });
    const pending = app.fetch(request);

    controller.abort("client-disconnect");

    const response = await pending;
    expect(response.status).toBe(499);
    expect(await response.text()).toBe("cooperative-client-abort");
    expect(seenSignal?.aborted).toBe(true);
    expect(seenSignal?.reason).toBe("client-disconnect");
    expect(seenSignal?.reason).not.toBeInstanceOf(TimeoutError);
  });

  test("ignores late route fulfillment after the timeout outcome wins", async () => {
    const app = new Gelis();
    app.use(timeout());

    let resolveLate!: (response: Response) => void;
    const late = new Promise<Response>((resolve) => {
      resolveLate = resolve;
    });

    app.get("/slow", { timeout: 5 }, () => late);

    const response = await app.fetch(new Request(`${API_URL}/slow`));
    expect(response.status).toBe(504);

    resolveLate(new Response("late-success", { status: 201 }));
    await sleep(10);

    expect(response.status).toBe(504);
    expect((await response.json()).error.code).toBe("REQUEST_TIMEOUT");
  });

  test("observes a late route rejection after timeout without unhandled rejection", async () => {
    const app = new Gelis();
    app.use(timeout());

    let rejectLate!: (error: Error) => void;
    const late = new Promise<Response>((_resolve, reject) => {
      rejectLate = reject;
    });

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };

    process.on("unhandledRejection", onUnhandled);

    try {
      app.get("/slow", { timeout: 5 }, () => late);

      const response = await app.fetch(new Request(`${API_URL}/slow`));
      expect(response.status).toBe(504);

      rejectLate(new Error("late-route-rejection"));
      await sleep(20);

      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  test("finalizes timeout fallback with request ID and secure headers exactly once", async () => {
    for (const timeoutFirst of [false, true]) {
      const app = new Gelis();
      const ids = requestId({ generator: () => "timeout-id" });
      const deadlines = timeout({ duration: 5 });

      if (timeoutFirst) {
        app.use(deadlines);
        app.use(ids);
        app.use(secureHeaders());
      } else {
        app.use(ids);
        app.use(secureHeaders());
        app.use(deadlines);
      }

      app.get("/slow", () => new Promise<Response>(() => {}));

      const response = await app.fetch(new Request(`${API_URL}/slow`));

      expect(response.status).toBe(504);
      expect(response.headers.get("x-request-id")).toBe("timeout-id");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("strict-transport-security")).toBe(
        "max-age=31536000",
      );
    }
  });

  test("finalizes timeout fallback with CORS independent of registration order", async () => {
    for (const timeoutFirst of [false, true]) {
      const app = new Gelis();
      const deadlines = timeout({ duration: 5 });

      if (timeoutFirst) {
        app.use(deadlines);
        app.use(cors({ origin: ORIGIN }));
      } else {
        app.use(cors({ origin: ORIGIN }));
        app.use(deadlines);
      }

      app.get("/slow", () => new Promise<Response>(() => {}));

      const response = await app.fetch(
        new Request(`${API_URL}/slow`, {
          headers: { Origin: ORIGIN },
        }),
      );

      expect(response.status).toBe(504);
      expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    }
  });

  test("suppresses timeout fallback body for HEAD", async () => {
    const app = new Gelis();
    app.use(timeout({ duration: 5 }));
    app.head("/slow", () => new Promise<Response>(() => {}));

    const response = await app.fetch(
      new Request(`${API_URL}/slow`, { method: "HEAD" }),
    );

    expect(response.status).toBe(504);
    expect(await response.text()).toBe("");
  });

  test("route deadline covers asynchronous input validation", async () => {
    const Query = {
      "~standard": {
        version: 1,
        vendor: "gelis-timeout-test",
        validate() {
          return new Promise<never>(() => {});
        },
      },
    } as StandardSchemaV1<unknown, { readonly ready: true }>;

    const app = new Gelis();
    app.use(timeout());

    let handlerCalled = false;
    app.get(
      "/input",
      {
        query: Query,
        timeout: 5,
      },
      () => {
        handlerCalled = true;
        return "unexpected";
      },
    );

    const response = await app.fetch(new Request(`${API_URL}/input?q=1`));

    expect(response.status).toBe(504);
    expect(handlerCalled).toBe(false);
  });

  test("route deadline covers managed asynchronous response validation", async () => {
    const Output = {
      "~standard": {
        version: 1,
        vendor: "gelis-timeout-test",
        validate() {
          return new Promise<never>(() => {});
        },
      },
    } as StandardSchemaV1<{ readonly ok: true }, { readonly ok: true }>;

    const app = new Gelis();
    app.use(timeout());

    const events: string[] = [];
    app.get(
      "/response",
      {
        timeout: 5,
        responses: {
          200: {
            schema: Output,
            validate: true,
          },
        },
      },
      () => {
        events.push("handler");
        return { ok: true } as const;
      },
      {
        beforeHandle: () => {
          events.push("before");
        },
        afterHandle: () => {
          events.push("after");
        },
      },
    );

    const response = await app.fetch(new Request(`${API_URL}/response`));

    expect(response.status).toBe(504);
    expect(events).toEqual(["before", "handler", "after"]);
  });
});
