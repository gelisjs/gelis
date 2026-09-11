import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src/app";
import { TimeoutError, timeout } from "../../src/timeout/index";

const API_URL = "https://api.example";

describe("P11-G timeout lazy cooperative signal", () => {
  test("materializes an already-aborted application signal after timeout wins", async () => {
    const app = new Gelis();
    const deadlines = timeout({ duration: 5 });
    let seenRequest: Request | undefined;

    app.use(deadlines);
    app.get("/slow", ({ request }) => {
      seenRequest = request;
      return new Promise<Response>(() => {});
    });

    const response = await app.fetch(new Request(`${API_URL}/slow`));

    expect(response.status).toBe(504);
    expect(seenRequest).toBeDefined();

    const signal = deadlines.signal(seenRequest!);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBeInstanceOf(TimeoutError);

    const reason = signal.reason as TimeoutError;
    expect(reason.scope).toBe("application");
    expect(reason.duration).toBe(5);
  });

  test("materializes an already-aborted route signal after timeout wins", async () => {
    const app = new Gelis();
    const deadlines = timeout();
    let seenRequest: Request | undefined;

    app.use(deadlines);
    app.get("/slow", { timeout: 5 }, ({ request }) => {
      seenRequest = request;
      return new Promise<Response>(() => {});
    });

    const response = await app.fetch(new Request(`${API_URL}/slow`));

    expect(response.status).toBe(504);
    expect(seenRequest).toBeDefined();

    const signal = deadlines.signal(seenRequest!);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBeInstanceOf(TimeoutError);

    const reason = signal.reason as TimeoutError;
    expect(reason.scope).toBe("route");
    expect(reason.duration).toBe(5);
  });

  test("preserves an earlier incoming abort when the signal is materialized late", async () => {
    const controller = new AbortController();
    const incomingReason = new Error("client disconnected");
    const app = new Gelis();
    const deadlines = timeout({ duration: 10 });
    let seenRequest: Request | undefined;

    app.use(deadlines);
    app.get("/slow", ({ request }) => {
      seenRequest = request;
      return new Promise<Response>(() => {});
    });

    const pending = app.fetch(
      new Request(`${API_URL}/slow`, {
        signal: controller.signal,
      }),
    );

    controller.abort(incomingReason);

    const response = await pending;
    expect(response.status).toBe(504);
    expect(seenRequest).toBeDefined();

    const signal = deadlines.signal(seenRequest!);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe(incomingReason);
    expect(signal.reason).not.toBeInstanceOf(TimeoutError);
  });
});
