import { describe, expect, test } from "bun:test";

import { normalizeResponse } from "../../src/runtime/response";

describe("runtime response normalization", () => {
  test("preserves direct string success semantics", async () => {
    const response = normalizeResponse("value-42");

    expect(response.status).toBe(200);
    expect(response.statusText).toBe("");
    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(await response.text()).toBe("value-42");
  });
});
