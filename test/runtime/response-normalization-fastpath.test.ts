import { describe, expect, test } from "bun:test";

import {
  normalizeResponse,
  runtimeReply,
} from "../../src/runtime/response";

describe("ordinary response normalization", () => {
  test("preserves raw Response identity", () => {
    const response = new Response("raw");

    expect(normalizeResponse(response)).toBe(response);
  });

  test("keeps direct undefined as implicit 204", async () => {
    const response = normalizeResponse(undefined);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  test("keeps ordinary string semantics", async () => {
    const response = normalizeResponse("hello");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(await response.text()).toBe("hello");
  });

  test("serializes ordinary object success as JSON", async () => {
    const response = normalizeResponse({ ok: true });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")?.split(";", 1)[0]).toBe(
      "application/json",
    );
    expect(await response.json()).toEqual({ ok: true });
  });

  test("keeps explicit reply.status on the explicit-status path", async () => {
    const response = normalizeResponse(runtimeReply.status(201, { ok: true }));

    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")?.split(";", 1)[0]).toBe(
      "application/json",
    );
    expect(await response.json()).toEqual({ ok: true });
  });

  test("keeps bodyless explicit statuses bodyless", async () => {
    for (const status of [204, 205, 304] as const) {
      const response = normalizeResponse(
        runtimeReply.status(status, { ignored: true }),
      );

      expect(response.status).toBe(status);
      expect(await response.text()).toBe("");
    }
  });
});
