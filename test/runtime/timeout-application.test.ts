import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src/app";
import { cors } from "../../src/cors/index";
import { requestId } from "../../src/request-id/index";
import { secureHeaders } from "../../src/secure-headers/index";
import {
  GelisTimeoutError,
  timeout,
} from "../../src/timeout/index";

const ORIGIN = "https://client.example";

function neverResponse(): Promise<Response> {
  return new Promise<Response>(() => undefined);
}

describe("P11-G5 application timeout boundary", () => {
  test("keeps synchronous success synchronous and clears its deadline state", async () => {
    let timeoutCalls = 0;
    const deadlines = timeout({
      duration: 5,
      onTimeout() {
        timeoutCalls++;
        return new Response("timed out", { status: 503 });
      },
    });

    const app = new Gelis();
    app.use(deadlines);

    const request = new Request("https://api.example/sync");
    let observedSignal: AbortSignal | undefined;

    app.onRequest(({ request: current }) => {
      observedSignal = deadlines.signal(current);
      expect(observedSignal).toBeDefined();
      expect(observedSignal!.aborted).toBe(false);
    });

    app.get("/sync", ({ request: current }) => {
      expect(deadlines.signal(current)).toBe(observedSignal);
      return "ok";
    });

    const result = app.fetch(request);

    expect(result).toBeInstanceOf(Response);

    const response = await result;
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(deadlines.signal(request)).toBeUndefined();

    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(timeoutCalls).toBe(0);
  });

  test("returns the frozen default 503 and aborts with the same application timeout error", async () => {
    const deadlines = timeout({ duration: 5 });
    const app = new Gelis();
    app.use(deadlines);

    let observedReason: unknown;

    app.get("/slow", async ({ request }) => {
      const signal = deadlines.signal(request)!;

      await new Promise<void>((resolve) => {
        signal.addEventListener(
          "abort",
          () => {
            observedReason = signal.reason;
            resolve();
          },
          { once: true },
        );
      });

      return new Response("late execution result");
    });

    const request = new Request("https://api.example/slow");
    const response = await app.fetch(request);

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("Service Unavailable");
    expect(observedReason).toBeInstanceOf(GelisTimeoutError);
    expect((observedReason as GelisTimeoutError).duration).toBe(5);
    expect((observedReason as GelisTimeoutError).source).toBe("application");
    expect(deadlines.signal(request)).toBeUndefined();
  });

  test("locks timeout response selection before an asynchronous onTimeout completes", async () => {
    let timeoutError: GelisTimeoutError | undefined;

    const deadlines = timeout({
      duration: 5,
      async onTimeout(_request, error) {
        timeoutError = error;
        await new Promise((resolve) => setTimeout(resolve, 15));
        return new Response("deadline won", { status: 503 });
      },
    });

    const app = new Gelis();
    app.use(deadlines);

    app.get("/race", async ({ request }) => {
      const signal = deadlines.signal(request)!;

      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve(), { once: true });
      });

      return new Response("late execution won incorrectly");
    });

    const response = await app.fetch(new Request("https://api.example/race"));

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("deadline won");
    expect(timeoutError).toBeInstanceOf(GelisTimeoutError);
    expect(timeoutError!.source).toBe("application");
  });

  test("preserves an already-aborted incoming reason without manufacturing a timeout response", async () => {
    const incoming = new AbortController();
    const reason = new Error("client already left");
    incoming.abort(reason);

    const deadlines = timeout({ duration: 50 });
    const app = new Gelis();
    app.use(deadlines);

    app.get("/aborted", ({ request }) => {
      const signal = deadlines.signal(request)!;
      expect(signal.aborted).toBe(true);
      expect(signal.reason).toBe(reason);
      return "handled";
    });

    const response = await app.fetch(
      new Request("https://api.example/aborted", {
        signal: incoming.signal,
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("handled");
  });

  test("preserves a later incoming abort reason when user work cooperates", async () => {
    const incoming = new AbortController();
    const reason = new Error("client disconnected");
    const deadlines = timeout({ duration: 100 });
    const app = new Gelis();
    app.use(deadlines);

    app.get("/cooperative", async ({ request }) => {
      const signal = deadlines.signal(request)!;

      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve(), { once: true });
      });

      expect(signal.reason).toBe(reason);
      return "cooperative completion";
    });

    const request = new Request("https://api.example/cooperative", {
      signal: incoming.signal,
    });

    const pending = app.fetch(request);
    setTimeout(() => incoming.abort(reason), 5);

    const response = await pending;
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("cooperative completion");
  });

  test("routes onTimeout failures through application onError", async () => {
    const failure = new Error("timeout handler failed");
    const deadlines = timeout({
      duration: 5,
      onTimeout() {
        throw failure;
      },
    });

    const app = new Gelis();
    app.use(deadlines);

    app.onError(({ error }) => {
      expect(error).toBe(failure);
      return new Response("handled timeout failure", { status: 500 });
    });

    app.get("/slow", neverResponse);

    const response = await app.fetch(new Request("https://api.example/slow"));

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("handled timeout failure");
  });

  test("applies CORS, secure headers, and request ID after timeout response selection regardless of install order", async () => {
    const ids = requestId({ generator: () => "g5-timeout-id" });
    const deadlines = timeout({ duration: 5 });
    const app = new Gelis();

    app.use(ids);
    app.use(deadlines);
    app.use(cors({ origin: ORIGIN }));
    app.use(secureHeaders());

    app.get("/slow", neverResponse);

    const response = await app.fetch(
      new Request("https://api.example/slow", {
        headers: { Origin: ORIGIN },
      }),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-request-id")).toBe("g5-timeout-id");
  });

  test("keeps application timeout behind the CORS preflight guard", async () => {
    let onRequestCalls = 0;
    let timeoutCalls = 0;

    const deadlines = timeout({
      duration: 5,
      onTimeout() {
        timeoutCalls++;
        return new Response("must not run", { status: 503 });
      },
    });

    const app = new Gelis();
    app.use(deadlines);
    app.use(cors({ origin: ORIGIN }));
    app.onRequest(() => {
      onRequestCalls++;
    });
    app.get("/resource", () => "ok");

    const response = await app.fetch(
      new Request("https://api.example/resource", {
        method: "OPTIONS",
        headers: {
          Origin: ORIGIN,
          "Access-Control-Request-Method": "GET",
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(onRequestCalls).toBe(0);
    expect(timeoutCalls).toBe(0);
  });

  test("suppresses the timeout body for HEAD", async () => {
    const deadlines = timeout({ duration: 5 });
    const app = new Gelis();
    app.use(deadlines);
    app.head("/slow", neverResponse);

    const response = await app.fetch(
      new Request("https://api.example/slow", { method: "HEAD" }),
    );

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("");
  });

  test("does not establish application state when duration is omitted", async () => {
    const deadlines = timeout();
    const app = new Gelis();
    app.use(deadlines);

    app.get("/plain", ({ request }) => {
      expect(deadlines.signal(request)).toBeUndefined();
      return "plain";
    });

    const response = await app.fetch(new Request("https://api.example/plain"));
    expect(response.status).toBe(200);
  });

  test("validates application and route durations synchronously", () => {
    expect(() => timeout({ duration: 0 })).toThrow(RangeError);
    expect(() => timeout({ duration: Number.POSITIVE_INFINITY })).toThrow(
      RangeError,
    );

    const deadlines = timeout();
    expect(() => deadlines.route(0)).toThrow(RangeError);
    expect(() => deadlines.route(1.5)).toThrow(RangeError);
    expect(deadlines.route(1)).toBeDefined();
  });

  test("rejects distinct timeout capability owners transactionally", async () => {
    const first = timeout();
    const second = timeout();
    const app = new Gelis();

    app.use(first);
    expect(() => app.use(second)).toThrow();

    app.get("/resource", () => "ok");
    const response = await app.fetch(
      new Request("https://api.example/resource"),
    );

    expect(response.status).toBe(200);
  });
});
