import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src/app";
import { GelisTimeoutError, timeout } from "../../src/timeout/index";

function neverResponse(): Promise<Response> {
  return new Promise<Response>(() => undefined);
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

const blockingQuerySchema = {
  "~standard": {
    version: 1 as const,
    vendor: "gelis-timeout-test",
    validate() {
      return new Promise<never>(() => undefined);
    },
  },
};

describe("P11-G6 route timeout boundary", () => {
  test("runs route-only timeout after onRequest and exposes a route-scoped signal", async () => {
    const deadlines = timeout();
    const routeDeadline = deadlines.route(5);
    const app = new Gelis();

    let observedReason: unknown;

    app.onRequest(({ request }) => {
      expect(deadlines.signal(request)).toBeUndefined();
    });

    app.get("/slow", { timeout: routeDeadline }, async ({ request }) => {
      const signal = deadlines.signal(request);
      expect(signal).toBeDefined();

      await waitForAbort(signal!);
      observedReason = signal!.reason;

      return new Response("late route result");
    });

    const request = new Request("https://api.example/slow");
    const response = await app.fetch(request);

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("Service Unavailable");
    expect(observedReason).toBeInstanceOf(GelisTimeoutError);
    expect((observedReason as GelisTimeoutError).duration).toBe(5);
    expect((observedReason as GelisTimeoutError).source).toBe("route");
    expect(deadlines.signal(request)).toBeUndefined();
  });

  test("keeps a non-firing timed route synchronous and clears route state", async () => {
    let timeoutCalls = 0;
    const deadlines = timeout({
      onTimeout() {
        timeoutCalls++;
        return new Response("timed out", { status: 503 });
      },
    });
    const app = new Gelis();
    const request = new Request("https://api.example/fast");

    app.get(
      "/fast",
      { timeout: deadlines.route(20) },
      ({ request: current }) => {
        expect(deadlines.signal(current)?.aborted).toBe(false);
        return "ok";
      },
    );

    const result = app.fetch(request);
    expect(result).toBeInstanceOf(Response);

    const response = await result;
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(deadlines.signal(request)).toBeUndefined();

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(timeoutCalls).toBe(0);
  });

  test("route deadline tightens an application deadline while preserving one signal", async () => {
    let winningError: GelisTimeoutError | undefined;
    let applicationSignal: AbortSignal | undefined;

    const deadlines = timeout({
      duration: 50,
      onTimeout(_request, error) {
        winningError = error;
        return new Response("deadline", { status: 503 });
      },
    });

    const app = new Gelis();
    app.use(deadlines);

    app.onRequest(({ request }) => {
      applicationSignal = deadlines.signal(request);
      expect(applicationSignal).toBeDefined();
    });

    app.get("/tight", { timeout: deadlines.route(5) }, ({ request }) => {
      expect(deadlines.signal(request)).toBe(applicationSignal);
      return neverResponse();
    });

    const response = await app.fetch(new Request("https://api.example/tight"));

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("deadline");
    expect(winningError).toBeInstanceOf(GelisTimeoutError);
    expect(winningError!.source).toBe("route");
    expect(winningError!.duration).toBe(5);
  });

  test("route deadline cannot extend an earlier application deadline", async () => {
    let winningError: GelisTimeoutError | undefined;

    const deadlines = timeout({
      duration: 5,
      onTimeout(_request, error) {
        winningError = error;
        return new Response("application deadline", { status: 503 });
      },
    });

    const app = new Gelis();
    app.use(deadlines);

    app.get("/cannot-extend", { timeout: deadlines.route(50) }, neverResponse);

    const response = await app.fetch(
      new Request("https://api.example/cannot-extend"),
    );

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("application deadline");
    expect(winningError).toBeInstanceOf(GelisTimeoutError);
    expect(winningError!.source).toBe("application");
    expect(winningError!.duration).toBe(5);
  });

  test("covers managed input validation after route selection", async () => {
    const deadlines = timeout();
    const app = new Gelis();
    let handlerRan = false;

    app.get(
      "/validated",
      {
        timeout: deadlines.route(5),
        query: blockingQuerySchema,
      },
      () => {
        handlerRan = true;
        return "must not run";
      },
    );

    const response = await app.fetch(
      new Request("https://api.example/validated?value=1"),
    );

    expect(response.status).toBe(503);
    expect(handlerRan).toBe(false);
  });

  test("covers a never-resolving beforeHandle without claiming forcible cancellation", async () => {
    const deadlines = timeout();
    const app = new Gelis();
    let handlerRan = false;

    app.get(
      "/before",
      { timeout: deadlines.route(5) },
      () => {
        handlerRan = true;
        return "must not run";
      },
      {
        beforeHandle({ request }) {
          expect(deadlines.signal(request)).toBeDefined();
          return new Promise<never>(() => undefined);
        },
      },
    );

    const response = await app.fetch(new Request("https://api.example/before"));

    expect(response.status).toBe(503);
    expect(handlerRan).toBe(false);
  });

  test("covers a never-resolving afterHandle under the route deadline", async () => {
    const deadlines = timeout();
    const app = new Gelis();
    let afterStarted = false;

    app.get(
      "/after",
      { timeout: deadlines.route(5) },
      () => "handler completed",
      {
        afterHandle({ request }) {
          expect(deadlines.signal(request)).toBeDefined();
          afterStarted = true;
          return new Promise<never>(() => undefined);
        },
      },
    );

    const response = await app.fetch(new Request("https://api.example/after"));

    expect(response.status).toBe(503);
    expect(afterStarted).toBe(true);
  });

  test("covers never-resolving asynchronous request-scope derivation", async () => {
    const deadlines = timeout();
    const app = new Gelis();
    let handlerRan = false;

    const scoped = app.requestScope(({ request }) => {
      expect(deadlines.signal(request)).toBeDefined();
      return new Promise<{ ready: boolean }>(() => undefined);
    });

    scoped.get("/scope", { timeout: deadlines.route(5) }, () => {
      handlerRan = true;
      return "must not run";
    });

    const response = await app.fetch(new Request("https://api.example/scope"));

    expect(response.status).toBe(503);
    expect(handlerRan).toBe(false);
  });

  test("uses custom timeout policy for route-only deadlines", async () => {
    let observedError: GelisTimeoutError | undefined;

    const deadlines = timeout({
      async onTimeout(_request, error) {
        observedError = error;
        await Promise.resolve();
        return new Response("custom route timeout", { status: 504 });
      },
    });

    const app = new Gelis();
    app.get("/custom", { timeout: deadlines.route(5) }, neverResponse);

    const response = await app.fetch(new Request("https://api.example/custom"));

    expect(response.status).toBe(504);
    expect(await response.text()).toBe("custom route timeout");
    expect(observedError?.source).toBe("route");
  });

  test("rejects a route policy owned by a different installed timeout capability", () => {
    const installed = timeout({ duration: 100 });
    const foreign = timeout();
    const app = new Gelis();

    app.use(installed);

    expect(() =>
      app.get(
        "/mixed-owner",
        { timeout: foreign.route(5) },
        () => "must not register",
      ),
    ).toThrow("distinct timeout capability owners");
  });
});
