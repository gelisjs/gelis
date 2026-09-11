import { describe, expect, test } from "bun:test";

import {
  compileRequestIdPolicy,
  type RequestIdOptions,
} from "../../src/request-id/policy";
import { createRequestIdState } from "../../src/request-id/state";

describe("P11-G request-ID policy compiler", () => {
  test("compiles the frozen defaults and ignores inbound identity by default", () => {
    const policy = compileRequestIdPolicy();
    const request = new Request("http://localhost/default", {
      headers: {
        "X-Request-Id": "attacker-controlled",
      },
    });

    expect(policy.headerName).toBe("X-Request-Id");
    expect(policy.maxLength).toBe(255);

    const requestId = policy.resolve(request);
    expect(requestId).not.toBe("attacker-controlled");
    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(request.headers.get("X-Request-Id")).toBe("attacker-controlled");
  });

  test("adopts a valid token-compatible inbound ID only when trust is enabled", () => {
    const policy = compileRequestIdPolicy({
      trustIncoming: true,
      generator: () => "generated-fallback",
    });
    const request = new Request("http://localhost/trusted", {
      headers: {
        "X-Request-Id": "upstream_123-abc",
      },
    });

    expect(policy.resolve(request)).toBe("upstream_123-abc");
  });

  test("falls back to generation for invalid built-in trusted candidates", () => {
    const policy = compileRequestIdPolicy({
      maxLength: 12,
      trustIncoming: true,
      generator: () => "fallback-id",
    });

    const invalidToken = new Request("http://localhost/invalid-token", {
      headers: {
        "X-Request-Id": "trace id",
      },
    });
    const tooLong = new Request("http://localhost/too-long", {
      headers: {
        "X-Request-Id": "1234567890123",
      },
    });
    const empty = new Request("http://localhost/empty", {
      headers: {
        "X-Request-Id": "",
      },
    });

    expect(policy.resolve(invalidToken)).toBe("fallback-id");
    expect(policy.resolve(tooLong)).toBe("fallback-id");
    expect(policy.resolve(empty)).toBe("fallback-id");
  });

  test("supports an explicit synchronous trust predicate after baseline checks", () => {
    const seen: Array<[string, Request]> = [];
    const policy = compileRequestIdPolicy({
      maxLength: 32,
      trustIncoming(value, request) {
        seen.push([value, request]);
        return value.startsWith("trusted ");
      },
      generator: () => "generated",
    });
    const accepted = new Request("http://localhost/predicate", {
      headers: {
        "X-Request-Id": "trusted tenant-a",
      },
    });
    const rejected = new Request("http://localhost/predicate-rejected", {
      headers: {
        "X-Request-Id": "external tenant-a",
      },
    });

    expect(policy.resolve(accepted)).toBe("trusted tenant-a");
    expect(policy.resolve(rejected)).toBe("generated");
    expect(seen).toEqual([
      ["trusted tenant-a", accepted],
      ["external tenant-a", rejected],
    ]);
  });

  test("does not invoke a trust predicate for a candidate that fails baseline checks", () => {
    let calls = 0;
    const policy = compileRequestIdPolicy({
      maxLength: 4,
      trustIncoming() {
        calls++;
        return true;
      },
      generator: () => "safe",
    });
    const request = new Request("http://localhost/predicate-baseline", {
      headers: {
        "X-Request-Id": "too-long",
      },
    });

    expect(policy.resolve(request)).toBe("safe");
    expect(calls).toBe(0);
  });

  test("passes the original Request to a custom generator without mutating it", () => {
    let seenRequest: Request | undefined;
    const policy = compileRequestIdPolicy({
      headerName: "X-Correlation-Id",
      generator(request) {
        seenRequest = request;
        return "generated id";
      },
    });
    const request = new Request("http://localhost/generator", {
      headers: {
        "X-Correlation-Id": "incoming",
        "X-Other": "preserved",
      },
    });

    expect(policy.resolve(request)).toBe("generated id");
    expect(seenRequest).toBe(request);
    expect(request.headers.get("X-Correlation-Id")).toBe("incoming");
    expect(request.headers.get("X-Other")).toBe("preserved");
  });

  test("rejects invalid generated values instead of repairing them", () => {
    const invalidValues = [
      "",
      "   ",
      " padded",
      "padded ",
      "line\nbreak",
      `nul${String.fromCharCode(0)}byte`,
    ];

    for (const value of invalidValues) {
      const policy = compileRequestIdPolicy({ generator: () => value });
      expect(() => policy.resolve(new Request("http://localhost/invalid"))).toThrow(
        TypeError,
      );
    }

    const overLength = compileRequestIdPolicy({
      maxLength: 4,
      generator: () => "12345",
    });
    expect(() =>
      overLength.resolve(new Request("http://localhost/over-length")),
    ).toThrow(TypeError);
  });

  test("propagates trust-predicate and generator failures as request errors", () => {
    const predicateFailure = compileRequestIdPolicy({
      trustIncoming() {
        throw new Error("trust failed");
      },
    });
    const generatorFailure = compileRequestIdPolicy({
      generator() {
        throw new Error("generator failed");
      },
    });

    expect(() =>
      predicateFailure.resolve(
        new Request("http://localhost/trust-failure", {
          headers: { "X-Request-Id": "valid-token" },
        }),
      ),
    ).toThrow("trust failed");
    expect(() =>
      generatorFailure.resolve(new Request("http://localhost/generator-failure")),
    ).toThrow("generator failed");
  });

  test("rejects invalid configuration synchronously", () => {
    const invalidOptions: unknown[] = [
      null,
      [],
      { headerName: "" },
      { headerName: "bad header" },
      { headerName: "bad\nheader" },
      { maxLength: 0 },
      { maxLength: -1 },
      { maxLength: 1.5 },
      { maxLength: Number.POSITIVE_INFINITY },
      { trustIncoming: null },
      { trustIncoming: "yes" },
      { generator: null },
      { generator: "uuid" },
    ];

    for (const options of invalidOptions) {
      expect(() => compileRuntimeOptions(options)).toThrow(TypeError);
    }
  });
});

describe("P11-G request-ID request-local state", () => {
  test("stores resolved identity per original Request", () => {
    const state = createRequestIdState(
      compileRequestIdPolicy({ generator: () => "request-a" }),
    );
    const request = new Request("http://localhost/state");
    const untouched = new Request("http://localhost/untouched");

    expect(state.get(request)).toBeUndefined();
    expect(state.prepare(request)).toBe("request-a");
    expect(state.get(request)).toBe("request-a");
    expect(state.get(untouched)).toBeUndefined();
  });

  test("keeps state isolated between capability instances", () => {
    const stateA = createRequestIdState(
      compileRequestIdPolicy({ generator: () => "capability-a" }),
    );
    const stateB = createRequestIdState(
      compileRequestIdPolicy({ generator: () => "capability-b" }),
    );
    const request = new Request("http://localhost/isolation");

    expect(stateA.prepare(request)).toBe("capability-a");
    expect(stateA.get(request)).toBe("capability-a");
    expect(stateB.get(request)).toBeUndefined();

    expect(stateB.prepare(request)).toBe("capability-b");
    expect(stateA.get(request)).toBe("capability-a");
    expect(stateB.get(request)).toBe("capability-b");
  });

  test("does not record state when policy resolution throws", () => {
    const state = createRequestIdState(
      compileRequestIdPolicy({ generator: () => "" }),
    );
    const request = new Request("http://localhost/state-error");

    expect(() => state.prepare(request)).toThrow(TypeError);
    expect(state.get(request)).toBeUndefined();
  });
});

function compileRuntimeOptions(options: unknown) {
  return compileRequestIdPolicy(options as RequestIdOptions);
}
