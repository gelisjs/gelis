import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src/app";
import { TimeoutError, timeout } from "../../src/timeout/index";

const API_URL = "https://api.example";

describe("P11-G route timeout specialization", () => {
  test("fails invalid route durations synchronously", () => {
    const app = new Gelis();

    expect(() => app.get("/zero", { timeout: 0 }, () => "never")).toThrow(
      TypeError,
    );
    expect(() => app.get("/fraction", { timeout: 1.5 }, () => "never")).toThrow(
      TypeError,
    );
    expect(() =>
      app.get("/too-large", { timeout: 2_147_483_648 }, () => "never"),
    ).toThrow(TypeError);
  });

  test("never silently executes a timed route without timeout capability", () => {
    const app = new Gelis();
    let called = false;

    app.get("/timed", { timeout: 10 }, () => {
      called = true;
      return "unexpected";
    });

    expect(() => app.fetch(new Request(`${API_URL}/timed`))).toThrow(
      "Timed route requires gelis/timeout",
    );
    expect(called).toBe(false);
  });

  test("supports route declaration before timeout capability installation", async () => {
    const app = new Gelis();
    app.get("/timed", { timeout: 100 }, () => "ok");

    app.use(timeout());

    const response = await app.fetch(new Request(`${API_URL}/timed`));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  test("route-only timeout wins with route-scoped TimeoutError", async () => {
    const app = new Gelis();
    const deadlines = timeout();
    let signal: AbortSignal | undefined;

    app.use(deadlines);
    app.get("/slow", { timeout: 5 }, ({ request }) => {
      signal = deadlines.signal(request);
      return new Promise<Response>(() => {});
    });

    const response = await app.fetch(new Request(`${API_URL}/slow`));

    expect(response.status).toBe(504);
    expect(signal?.aborted).toBe(true);
    expect(signal?.reason).toBeInstanceOf(TimeoutError);

    const reason = signal?.reason as TimeoutError;
    expect(reason.scope).toBe("route");
    expect(reason.duration).toBe(5);
  });

  test("shorter route timeout tightens application deadline", async () => {
    const app = new Gelis();
    const deadlines = timeout({ duration: 100 });
    let seen: TimeoutError | undefined;

    app.use(deadlines);
    app.onError(({ error }) => {
      if (error instanceof TimeoutError) {
        seen = error;
      }
      return undefined;
    });
    app.get("/slow", { timeout: 5 }, () => new Promise<Response>(() => {}));

    const response = await app.fetch(new Request(`${API_URL}/slow`));

    expect(response.status).toBe(504);
    expect(seen?.scope).toBe("route");
    expect(seen?.duration).toBe(5);
  });

  test("longer route timeout never extends application deadline", async () => {
    const app = new Gelis();
    const deadlines = timeout({ duration: 5 });
    let seen: TimeoutError | undefined;

    app.use(deadlines);
    app.onError(({ error }) => {
      if (error instanceof TimeoutError) {
        seen = error;
      }
      return undefined;
    });
    app.get("/slow", { timeout: 100 }, () => new Promise<Response>(() => {}));

    const response = await app.fetch(new Request(`${API_URL}/slow`));

    expect(response.status).toBe(504);
    expect(seen?.scope).toBe("application");
    expect(seen?.duration).toBe(5);
  });

  test("route deadline wraps lifecycle before the handler", async () => {
    const app = new Gelis();
    app.use(timeout());

    let handlerCalled = false;
    app.get(
      "/slow-before",
      { timeout: 5 },
      () => {
        handlerCalled = true;
        return "unexpected";
      },
      {
        beforeHandle: () => new Promise<void>(() => {}),
      },
    );

    const response = await app.fetch(new Request(`${API_URL}/slow-before`));

    expect(response.status).toBe(504);
    expect(handlerCalled).toBe(false);
  });

  test("synchronous timed route can retain synchronous completion", async () => {
    const app = new Gelis();
    app.use(timeout());
    app.get("/sync", { timeout: 100 }, () => "ok");

    const result = app.fetch(new Request(`${API_URL}/sync`));

    expect(result).toBeInstanceOf(Response);
    expect(await (result as Response).text()).toBe("ok");
  });
});
