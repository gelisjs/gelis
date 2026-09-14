import { describe, expect, test } from "bun:test";

import {
  GelisTimeoutError,
  assertTimeoutDuration,
} from "../../src/timeout/error";
import { createTimeoutExecutionCleanup } from "../../src/timeout/cleanup";
import { createTimeoutSignalState } from "../../src/timeout/signal";

describe("P11-G timeout core", () => {
  test("creates a stable GelisTimeoutError identity", () => {
    const error = new GelisTimeoutError(250, "application");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("GelisTimeoutError");
    expect(error.duration).toBe(250);
    expect(error.source).toBe("application");
    expect(error.message).toBe("Gelis application timeout after 250ms");
  });

  test("validates frozen timeout duration grammar", () => {
    for (const value of [1, 250, Number.MAX_SAFE_INTEGER]) {
      expect(() => assertTimeoutDuration(value)).not.toThrow();
    }

    for (const value of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() => assertTimeoutDuration(value)).toThrow(RangeError);
    }
  });

  test("preserves an already-aborted incoming request reason", () => {
    const incoming = new AbortController();
    const reason = new Error("client already aborted");
    incoming.abort(reason);

    const request = new Request("https://example.test/", {
      signal: incoming.signal,
    });
    const state = createTimeoutSignalState(request);

    expect(state.signal.aborted).toBe(true);
    expect(state.signal.reason).toBe(reason);
    expect(
      state.abortDeadline(new GelisTimeoutError(100, "application")),
    ).toBe(false);
    expect(state.signal.reason).toBe(reason);
  });

  test("preserves a later incoming abort reason", () => {
    const incoming = new AbortController();
    const request = new Request("https://example.test/", {
      signal: incoming.signal,
    });
    const state = createTimeoutSignalState(request);
    const reason = new Error("client disconnected");

    expect(state.signal.aborted).toBe(false);

    incoming.abort(reason);

    expect(state.signal.aborted).toBe(true);
    expect(state.signal.reason).toBe(reason);
    expect(
      state.abortDeadline(new GelisTimeoutError(100, "application")),
    ).toBe(false);
    expect(state.signal.reason).toBe(reason);
  });

  test("uses the same GelisTimeoutError as the framework deadline reason", () => {
    const request = new Request("https://example.test/");
    const state = createTimeoutSignalState(request);
    const error = new GelisTimeoutError(100, "route");

    expect(state.abortDeadline(error)).toBe(true);
    expect(state.signal.aborted).toBe(true);
    expect(state.signal.reason).toBe(error);
    expect(state.signal.reason).toBeInstanceOf(GelisTimeoutError);
    expect(state.signal.reason.source).toBe("route");
  });

  test("does not let a later incoming abort replace a winning deadline", () => {
    const incoming = new AbortController();
    const request = new Request("https://example.test/", {
      signal: incoming.signal,
    });
    const state = createTimeoutSignalState(request);
    const timeoutError = new GelisTimeoutError(100, "application");

    expect(state.abortDeadline(timeoutError)).toBe(true);

    incoming.abort(new Error("late client abort"));

    expect(state.signal.reason).toBe(timeoutError);
  });

  test("cleanup detaches the incoming abort bridge", () => {
    const incoming = new AbortController();
    const request = new Request("https://example.test/", {
      signal: incoming.signal,
    });
    const state = createTimeoutSignalState(request);

    state.cleanup.run();
    incoming.abort(new Error("after terminal cleanup"));

    expect(state.cleanup.closed).toBe(true);
    expect(state.signal.aborted).toBe(false);
  });
});

describe("P11-G timeout terminal cleanup", () => {
  test("runs registered cleanup tasks once in reverse registration order", () => {
    const cleanup = createTimeoutExecutionCleanup();
    const events: string[] = [];

    cleanup.add(() => events.push("first"));
    cleanup.add(() => events.push("second"));

    expect(cleanup.closed).toBe(false);

    cleanup.run();
    cleanup.run();

    expect(cleanup.closed).toBe(true);
    expect(events).toEqual(["second", "first"]);
  });

  test("runs a late cleanup registration immediately after terminal cleanup", () => {
    const cleanup = createTimeoutExecutionCleanup();
    let cleaned = 0;

    cleanup.run();
    cleanup.add(() => {
      cleaned++;
    });

    expect(cleaned).toBe(1);
  });
});
