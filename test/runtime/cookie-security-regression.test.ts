import { describe, expect, test } from "bun:test";

import {
  getCookie,
  getCookies,
  getSignedCookie,
} from "../../src/cookie/public";

const SECRET = "cookie-security-regression-secret-0123456789";

describe("P11-C cookie parser security regressions", () => {
  test("does not normalize NBSP into a different cookie name", () => {
    const request = new Request("https://example.test/", {
      headers: {
        Cookie: "\u00A0session=attacker; session=legitimate",
      },
    });

    expect(getCookie(request, "session")).toBe("legitimate");
    expect(getCookies(request, "session")).toEqual(["legitimate"]);
  });

  test("does not normalize Unicode whitespace around names", () => {
    const request = new Request("https://example.test/", {
      headers: {
        Cookie: "\u2003token=attacker; token=legitimate",
      },
    });

    expect(getCookie(request, "token")).toBe("legitimate");
  });

  test("skips malformed cookie values instead of selecting them", () => {
    const request = new Request("https://example.test/", {
      headers: {
        Cookie: 'session="unterminated; session=good',
      },
    });

    expect(getCookie(request, "session")).toBe("good");
    expect(getCookies(request, "session")).toEqual(["good"]);
  });

  test("signed lookup does not accept a Unicode-whitespace-confused name", async () => {
    const request = new Request("https://example.test/", {
      headers: {
        Cookie: "\u00A0session=attacker",
      },
    });

    await expect(getSignedCookie(request, "session", SECRET)).resolves.toEqual({
      status: "missing",
    });
  });
});
