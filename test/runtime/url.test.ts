import { describe, expect, test } from "bun:test";

import {
  pathnameFromRequestUrl,
  pathnameFromUrl,
} from "../../src/runtime/url";

describe("runtime URL pathname extraction", () => {
  test("preserves generic absolute URL semantics", () => {
    expect(pathnameFromUrl("http://gelis.test/users/42?tab=profile#bio")).toBe(
      "/users/42",
    );
    expect(pathnameFromUrl("http://gelis.test?next=/users/42")).toBe("/");
    expect(pathnameFromUrl("http://gelis.test#next=/users/42")).toBe("/");
    expect(pathnameFromUrl("custom://gelis.test/users/42#bio")).toBe(
      "/users/42",
    );
  });

  test("extracts normalized HTTP request URLs", () => {
    const request = new Request(
      "http://gelis.test/users/42?tab=profile#client-fragment",
    );

    expect(pathnameFromRequestUrl(request.url)).toBe("/users/42");
  });

  test("extracts normalized HTTPS request URLs", () => {
    const request = new Request("https://gelis.test:8443/users/42?tab=profile");

    expect(pathnameFromRequestUrl(request.url)).toBe("/users/42");
  });

  test("extracts normalized IPv6 request URLs", () => {
    const request = new Request("http://[::1]:3000/users/42?tab=profile");

    expect(pathnameFromRequestUrl(request.url)).toBe("/users/42");
  });

  test("matches normalized root request URLs", () => {
    const request = new Request("http://gelis.test");

    expect(pathnameFromRequestUrl(request.url)).toBe("/");
  });

  test("falls back to generic extraction outside HTTP request URLs", () => {
    expect(pathnameFromRequestUrl("custom://gelis.test/users/42#bio")).toBe(
      "/users/42",
    );
  });
});
