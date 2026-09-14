import { describe, expect, test } from "bun:test";

import {
  DEFAULT_REQUEST_ID_HEADER,
  DEFAULT_REQUEST_ID_MAX_LENGTH,
  compileRequestIdPolicy,
  isRequestIdValue,
  resolveRequestId,
} from "../../src/request-id/policy";
import { createRequestIdState } from "../../src/request-id/state";

describe("P11-G request ID policy", () => {
  test("compiles the frozen defaults", () => {
    const policy = compileRequestIdPolicy();

    expect(policy.header).toBe(DEFAULT_REQUEST_ID_HEADER);
    expect(policy.maxLength).toBe(DEFAULT_REQUEST_ID_MAX_LENGTH);
    expect(policy.acceptIncoming).toBe(false);

    const value = resolveRequestId(
      policy,
      new Request("https://example.test/"),
    );

    expect(isRequestIdValue(value, policy.maxLength)).toBe(true);
    expect(value.length).toBe(36);
  });

  test("ignores inbound IDs by default", () => {
    const request = new Request("https://example.test/", {
      headers: {
        "X-Request-Id": "caller-controlled",
      },
    });
    const policy = compileRequestIdPolicy({
      generator: () => "generated-id",
    });

    expect(resolveRequestId(policy, request)).toBe("generated-id");
  });

  test("adopts a valid inbound ID only when explicitly enabled", () => {
    const request = new Request("https://example.test/", {
      headers: {
        "X-Request-Id": "trusted.upstream:42_A-B",
      },
    });
    const policy = compileRequestIdPolicy({
      acceptIncoming: true,
      generator: () => "fallback",
    });

    expect(resolveRequestId(policy, request)).toBe(
      "trusted.upstream:42_A-B",
    );
  });

  test("replaces malformed, ambiguous, unicode and overlong inbound IDs", () => {
    const malformed = [
      "contains space",
      "contains\tcontrol",
      "unicode-é",
      "first, second",
      "x".repeat(9),
    ];

    for (const value of malformed) {
      const request = new Request("https://example.test/", {
        headers: {
          "X-Request-Id": value,
        },
      });
      const policy = compileRequestIdPolicy({
        acceptIncoming: true,
        maxLength: 8,
        generator: () => "fallback",
      });

      expect(resolveRequestId(policy, request)).toBe("fallback");
    }
  });

  test("treats duplicated request-ID fields as ambiguous input", () => {
    const headers = new Headers();
    headers.append("X-Request-Id", "first");
    headers.append("X-Request-Id", "second");

    const request = new Request("https://example.test/", { headers });
    const policy = compileRequestIdPolicy({
      acceptIncoming: true,
      generator: () => "fallback",
    });

    expect(request.headers.get("X-Request-Id")).toContain(",");
    expect(resolveRequestId(policy, request)).toBe("fallback");
  });

  test("runs the custom validator only after baseline validation", () => {
    const seen: string[] = [];
    const policy = compileRequestIdPolicy({
      acceptIncoming(value) {
        seen.push(value);
        return value.startsWith("edge-");
      },
      generator: () => "fallback",
    });

    const accepted = new Request("https://example.test/", {
      headers: { "X-Request-Id": "edge-42" },
    });
    const rejected = new Request("https://example.test/", {
      headers: { "X-Request-Id": "other-42" },
    });
    const malformed = new Request("https://example.test/", {
      headers: { "X-Request-Id": "edge 42" },
    });

    expect(resolveRequestId(policy, accepted)).toBe("edge-42");
    expect(resolveRequestId(policy, rejected)).toBe("fallback");
    expect(resolveRequestId(policy, malformed)).toBe("fallback");
    expect(seen).toEqual(["edge-42", "other-42"]);
  });

  test("preserves custom validator failures", () => {
    const failure = new Error("validator failed");
    const request = new Request("https://example.test/", {
      headers: { "X-Request-Id": "edge-42" },
    });
    const policy = compileRequestIdPolicy({
      acceptIncoming() {
        throw failure;
      },
    });

    expect(() => resolveRequestId(policy, request)).toThrow(failure);
  });

  test("passes the original Request to the custom generator", () => {
    const request = new Request("https://example.test/path");
    let received: Request | undefined;
    const policy = compileRequestIdPolicy({
      generator(value) {
        received = value;
        return "generated-42";
      },
    });

    expect(resolveRequestId(policy, request)).toBe("generated-42");
    expect(received).toBe(request);
  });

  test("rejects unsafe custom generator output instead of repairing it", () => {
    for (const generated of ["", "bad value", "é", "x".repeat(5)]) {
      const policy = compileRequestIdPolicy({
        generator: () => generated,
        maxLength: 4,
      });

      expect(() =>
        resolveRequestId(policy, new Request("https://example.test/")),
      ).toThrow(TypeError);
    }
  });

  test("accepts exactly the frozen request-ID character grammar", () => {
    expect(isRequestIdValue("Az09._:-", 8)).toBe(true);

    for (const value of [
      "with space",
      "slash/value",
      "plus+value",
      "comma,value",
      "quote\"value",
      "unicode-é",
    ]) {
      expect(isRequestIdValue(value, 255)).toBe(false);
    }
  });

  test("validates header names and maxLength at compilation", () => {
    for (const header of ["", "X Request Id", "X:Request-Id", "é"]) {
      expect(() => compileRequestIdPolicy({ header })).toThrow(TypeError);
    }

    for (const maxLength of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => compileRequestIdPolicy({ maxLength })).toThrow(RangeError);
    }
  });

  test("validates runtime option shapes for untyped callers", () => {
    expect(() =>
      compileRequestIdPolicy(null as unknown as Parameters<
        typeof compileRequestIdPolicy
      >[0]),
    ).toThrow(TypeError);

    expect(() =>
      compileRequestIdPolicy({
        generator: "invalid" as unknown as () => string,
      }),
    ).toThrow(TypeError);

    expect(() =>
      compileRequestIdPolicy({
        acceptIncoming: "yes" as unknown as boolean,
      }),
    ).toThrow(TypeError);
  });
});

describe("P11-G request ID instance state", () => {
  test("stores only prepared requests and returns the resolved value", () => {
    const state = createRequestIdState(
      compileRequestIdPolicy({ generator: () => "generated-id" }),
    );
    const request = new Request("https://example.test/");

    expect(state.get(request)).toBeUndefined();
    expect(state.prepare(request)).toBe("generated-id");
    expect(state.get(request)).toBe("generated-id");
  });

  test("keeps separate capability state isolated for the same Request", () => {
    const request = new Request("https://example.test/");
    const first = createRequestIdState(
      compileRequestIdPolicy({ generator: () => "first-id" }),
    );
    const second = createRequestIdState(
      compileRequestIdPolicy({ generator: () => "second-id" }),
    );

    expect(first.prepare(request)).toBe("first-id");
    expect(second.prepare(request)).toBe("second-id");
    expect(first.get(request)).toBe("first-id");
    expect(second.get(request)).toBe("second-id");
  });

  test("re-resolving the same Request replaces only that instance entry", () => {
    let sequence = 0;
    const state = createRequestIdState(
      compileRequestIdPolicy({
        generator: () => `id-${++sequence}`,
      }),
    );
    const request = new Request("https://example.test/");

    expect(state.prepare(request)).toBe("id-1");
    expect(state.prepare(request)).toBe("id-2");
    expect(state.get(request)).toBe("id-2");
  });
});
