import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";
import { bodyLimit } from "../../src/body-limit";

const textDecoder = new TextDecoder();

describe("Gelis body-limit raw reader", () => {
  test("returns bytes below and exactly at the configured limit", async () => {
    const limit = bodyLimit({ maxBytes: 4 });

    const below = await limit.readBody(rawRequest(["ab", "c"]));
    const equal = await limit.readBody(rawRequest(["ab", "cd"]));

    expect(limit.maxBytes).toBe(4);
    expect(readText(below)).toBe("abc");
    expect(readText(equal)).toBe("abcd");
  });

  test("returns the frozen default 413 response on overflow", async () => {
    const limit = bodyLimit({ maxBytes: 3 });
    const result = await limit.readBody(rawRequest(["ab", "cd"]));

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected body-limit read failure");
    }

    expect(result.response.status).toBe(413);
    expect(await result.response.json()).toEqual({
      error: {
        code: "BODY_TOO_LARGE",
        message: "Request body exceeds the configured limit",
      },
    });
  });

  test("preserves Content-Length fast rejection without consuming the body", async () => {
    const limit = bodyLimit({ maxBytes: 3 });
    const request = rawRequest(["abc"], "4");

    expect(request.bodyUsed).toBe(false);

    const result = await limit.readBody(request);

    expect(result.ok).toBe(false);
    expect(request.bodyUsed).toBe(false);
  });

  test("uses a custom overflow response with the configured limit", async () => {
    const seen: Array<[string, number]> = [];
    const limit = bodyLimit({
      maxBytes: 2,
      onExceeded(request, maxBytes) {
        seen.push([new URL(request.url).pathname, maxBytes]);
        return new Response(`limited:${maxBytes}`, { status: 429 });
      },
    });

    const result = await limit.readBody(rawRequest(["abc"], undefined, "/raw"));

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected body-limit read failure");
    }

    expect(result.response.status).toBe(429);
    expect(await result.response.text()).toBe("limited:2");
    expect(seen).toEqual([["/raw", 2]]);
  });

  test("supports asynchronous custom overflow responses", async () => {
    const limit = bodyLimit({
      maxBytes: 1,
      async onExceeded(_request, maxBytes) {
        await Promise.resolve();
        return new Response(`async:${maxBytes}`, { status: 431 });
      },
    });

    const result = await limit.readBody(rawRequest(["ab"]));

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected body-limit read failure");
    }

    expect(result.response.status).toBe(431);
    expect(await result.response.text()).toBe("async:1");
  });

  test("propagates custom overflow failures through application onError", async () => {
    const failure = new Error("raw overflow policy failed");
    const limit = bodyLimit({
      maxBytes: 1,
      onExceeded() {
        throw failure;
      },
    });
    const app = new Gelis();

    app.onError(({ error }) => {
      expect(error).toBe(failure);
      return new Response("handled", { status: 598 });
    });

    app.use(limit);
    app.post("/raw", async ({ request }) => {
      const result = await limit.readBody(request);

      if (!result.ok) {
        return result.response;
      }

      return new Response(Uint8Array.from(result.bytes));
    });

    const response = await app.fetch(rawRequest(["ab"], undefined, "/raw"));

    expect(response.status).toBe(598);
    expect(await response.text()).toBe("handled");
  });

  test("propagates stream read failures instead of converting them to overflow", async () => {
    const failure = new Error("raw body stream failed");
    const limit = bodyLimit({ maxBytes: 10 });
    const request = new Request("http://gelis.test/raw", {
      method: "POST",
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.error(failure);
        },
      }),
    });

    let thrown: unknown;

    try {
      await limit.readBody(request);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(failure);
  });
});

function rawRequest(
  chunks: readonly string[],
  contentLength?: string,
  path = "/body",
): Request {
  const encoder = new TextEncoder();
  const encoded = chunks.map((chunk) => encoder.encode(chunk));
  let index = 0;

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
  });

  const headers = new Headers();

  if (contentLength !== undefined) {
    headers.set("content-length", contentLength);
  }

  return new Request(`http://gelis.test${path}`, {
    method: "POST",
    headers,
    body,
  });
}

function readText(
  result: Awaited<ReturnType<ReturnType<typeof bodyLimit>["readBody"]>>,
): string {
  if (!result.ok) {
    throw new Error("Expected body-limit read success");
  }

  return textDecoder.decode(result.bytes);
}
