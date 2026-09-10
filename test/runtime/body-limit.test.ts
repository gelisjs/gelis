import { describe, expect, test } from "bun:test";

import {
  bodyTooLargeResponse,
  compileRuntimeLimitedBodyReader,
} from "../../src/runtime/body-limit";

describe("Gelis body-limit runtime primitive", () => {
  test("validates maxBytes at compilation time", () => {
    expect(typeof compileRuntimeLimitedBodyReader(0)).toBe("function");
    expect(typeof compileRuntimeLimitedBodyReader(1)).toBe("function");
    expect(typeof compileRuntimeLimitedBodyReader(Number.MAX_SAFE_INTEGER)).toBe(
      "function",
    );

    for (const value of [
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() => compileRuntimeLimitedBodyReader(value)).toThrow(TypeError);
    }
  });

  test("accepts bodies below and exactly at the configured limit", async () => {
    const reader = compileRuntimeLimitedBodyReader(4);

    const below = await reader(createRequest(["ab", "c"]).request);
    const equal = await reader(createRequest(["ab", "cd"]).request);

    expect(readText(below)).toBe("abc");
    expect(readText(equal)).toBe("abcd");
  });

  test("rejects one byte over and cancels the active stream", async () => {
    const reader = compileRuntimeLimitedBodyReader(3);
    const streamed = createRequest(["ab", "cd", "ef"]);

    const result = await reader(streamed.request);

    expect(result.ok).toBe(false);
    expect(streamed.wasCancelled()).toBe(true);
  });

  test("uses a valid oversized Content-Length as a non-consuming fast reject", async () => {
    const reader = compileRuntimeLimitedBodyReader(3);
    const streamed = createRequest(["abc"], "4");

    expect(streamed.request.bodyUsed).toBe(false);

    const result = await reader(streamed.request);

    expect(result.ok).toBe(false);
    expect(streamed.request.bodyUsed).toBe(false);
    expect(streamed.wasCancelled()).toBe(false);
  });

  test("still enforces actual bytes when Content-Length is equal or forged smaller", async () => {
    const reader = compileRuntimeLimitedBodyReader(3);

    const equalHeader = createRequest(["ab", "cd"], "3");
    const forgedSmall = createRequest(["ab", "cd"], "1");

    expect((await reader(equalHeader.request)).ok).toBe(false);
    expect(equalHeader.wasCancelled()).toBe(true);

    expect((await reader(forgedSmall.request)).ok).toBe(false);
    expect(forgedSmall.wasCancelled()).toBe(true);
  });

  test("falls back to actual-byte enforcement for malformed or ambiguous Content-Length", async () => {
    const reader = compileRuntimeLimitedBodyReader(3);

    for (const contentLength of ["invalid", "1, 99"]) {
      const streamed = createRequest(["ab", "cd"], contentLength);
      const result = await reader(streamed.request);

      expect(result.ok).toBe(false);
      expect(streamed.wasCancelled()).toBe(true);
    }
  });

  test("compares very large Content-Length values without unsafe number conversion", async () => {
    const reader = compileRuntimeLimitedBodyReader(Number.MAX_SAFE_INTEGER);
    const streamed = createRequest(["a"], "999999999999999999999999999999999");

    const result = await reader(streamed.request);

    expect(result.ok).toBe(false);
    expect(streamed.request.bodyUsed).toBe(false);
  });

  test("preserves stream read failures", async () => {
    const failure = new Error("body stream failed");
    const reader = compileRuntimeLimitedBodyReader(10);
    const request = new Request("http://gelis.test/body", {
      method: "POST",
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.error(failure);
        },
      }),
    });

    let thrown: unknown;

    try {
      await reader(request);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(failure);
  });

  test("creates the frozen default 413 response", async () => {
    const response = bodyTooLargeResponse();

    expect(response.status).toBe(413);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      error: {
        code: "BODY_TOO_LARGE",
        message: "Request body exceeds the configured limit",
      },
    });
  });
});

function createRequest(
  chunks: readonly string[],
  contentLength?: string,
): {
  readonly request: Request;
  readonly wasCancelled: () => boolean;
} {
  const encoder = new TextEncoder();
  const encoded = chunks.map((chunk) => encoder.encode(chunk));
  let index = 0;
  let cancelled = false;

  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = encoded[index];

      if (chunk === undefined) {
        controller.close();
        return;
      }

      index++;
      controller.enqueue(chunk);
    },
    cancel() {
      cancelled = true;
    },
  });

  const headers = new Headers();

  if (contentLength !== undefined) {
    headers.set("content-length", contentLength);
  }

  return {
    request: new Request("http://gelis.test/body", {
      method: "POST",
      headers,
      body,
    }),
    wasCancelled: () => cancelled,
  };
}

function readText(
  result: Awaited<ReturnType<ReturnType<typeof compileRuntimeLimitedBodyReader>>>,
): string {
  if (!result.ok) {
    throw new Error("Expected body-limit read success");
  }

  return new TextDecoder().decode(result.bytes);
}
