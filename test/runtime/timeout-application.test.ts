import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src/app";
import { cors } from "../../src/cors/index";
import { TimeoutError, timeout } from "../../src/timeout/index";

const API_URL = "https://api.example";
const ORIGIN = "https://client.example";

describe("P11-G application timeout", () => {
  test("validates application timeout configuration fail-closed", () => {
    expect(() => timeout({ duration: 0 })).toThrow(TypeError);
    expect(() => timeout({ duration: -1 })).toThrow(TypeError);
    expect(() => timeout({ duration: 1.5 })).toThrow(TypeError);
    expect(() => timeout({ duration: Number.NaN })).toThrow(TypeError);
    expect(() => timeout({ duration: Number.POSITIVE_INFINITY })).toThrow(
      TypeError,
    );
    expect(() => timeout({ duration: 2_147_483_648 })).toThrow(TypeError);
    expect(() => timeout(null as never)).toThrow(TypeError);
    expect(() => timeout({ duration: null as never })).toThrow(TypeError);
  });

  test("keeps synchronous completion synchronous", async () => {
    const app = new Gelis();
    app.use(timeout({ duration: 1_000 }));
    app.get("/resource", () => "ok");

    const result = app.fetch(new Request(`${API_URL}/resource`));

    expect(result).toBeInstanceOf(Response);
    expect(await (result as Response).text()).toBe("ok");
  });

  test("allows asynchronous completion before the deadline", async () => {
    const app = new Gelis();
    app.use(timeout({ duration: 1_000 }));
    app.get("/resource", async () => new Response("ok"));

    const response = await app.fetch(new Request(`${API_URL}/resource`));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  test("returns the frozen default 504 fallback when the deadline wins", async () => {
    const app = new Gelis();
    app.use(timeout({ duration: 5 }));
    app.get("/slow", () => new Promise<Response>(() => {}));

    const response = await app.fetch(new Request(`${API_URL}/slow`));

    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({
      error: {
        code: "REQUEST_TIMEOUT",
        message: "Request exceeded the configured timeout",
      },
    });
  });

  test("aborts the cooperative signal with the winning TimeoutError", async () => {
    const app = new Gelis();
    const deadlines = timeout({ duration: 5 });
    let signal: AbortSignal | undefined;

    app.use(deadlines);
    app.get("/slow", ({ request }) => {
      signal = deadlines.signal(request);
      return new Promise<Response>(() => {});
    });

    const response = await app.fetch(new Request(`${API_URL}/slow`));

    expect(response.status).toBe(504);
    expect(signal?.aborted).toBe(true);
    expect(signal?.reason).toBeInstanceOf(TimeoutError);

    const reason = signal?.reason as TimeoutError;
    expect(reason.code).toBe("REQUEST_TIMEOUT");
    expect(reason.duration).toBe(5);
    expect(reason.scope).toBe("application");
    expect(reason.message).toBe("Request exceeded the configured timeout");
  });

  test("lets user onError handle TimeoutError before the default fallback", async () => {
    const app = new Gelis();
    app.use(timeout({ duration: 5 }));

    let seen: unknown;
    app.onError(({ error }) => {
      seen = error;

      if (error instanceof TimeoutError) {
        return new Response("custom timeout", { status: 598 });
      }

      return undefined;
    });

    app.get("/slow", () => new Promise<Response>(() => {}));

    const response = await app.fetch(new Request(`${API_URL}/slow`));

    expect(seen).toBeInstanceOf(TimeoutError);
    expect(response.status).toBe(598);
    expect(await response.text()).toBe("custom timeout");
  });

  test("supports signal access without an application duration", async () => {
    const app = new Gelis();
    const deadlines = timeout();
    let sameSignal = false;

    app.use(deadlines);
    app.get("/resource", ({ request }) => {
      sameSignal = deadlines.signal(request) === request.signal;
      return "ok";
    });

    const response = await app.fetch(new Request(`${API_URL}/resource`));

    expect(response.status).toBe(200);
    expect(sameSignal).toBe(true);
  });

  test("does not start the application deadline for CORS preflight", async () => {
    const app = new Gelis();
    const deadlines = timeout({ duration: 1 });

    app.use(deadlines);
    app.use(cors({ origin: ORIGIN }));
    app.post("/resource", () => new Promise<Response>(() => {}));

    const request = new Request(`${API_URL}/resource`, {
      method: "OPTIONS",
      headers: {
        Origin: ORIGIN,
        "Access-Control-Request-Method": "POST",
      },
    });

    const response = await app.fetch(request);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(deadlines.signal(request).aborted).toBe(false);
  });

  test("rejects duplicate timeout installation transactionally", async () => {
    const app = new Gelis();
    app.use(timeout({ duration: 1_000 }));

    expect(() => app.use(timeout())).toThrow();

    app.get("/resource", () => "ok");
    const response = await app.fetch(new Request(`${API_URL}/resource`));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });
});
