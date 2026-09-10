import { describe, expect, test } from "bun:test";

import {
  deleteCookie,
  generateCookie,
  generateSignedCookie,
  getCookie,
  getCookies,
  getSignedCookie,
  setCookie,
  setSignedCookie,
  verifySignedCookie,
} from "../../src/cookie/public";

const CURRENT_SECRET = "current-cookie-secret-0123456789abcdef";
const OLD_SECRET = "previous-cookie-secret-0123456789abcdef";
const WRONG_SECRET = "unrelated-cookie-secret-0123456789abcdef";
const MAX_AGE = 400 * 24 * 60 * 60;

describe("P11-C cookie parsing", () => {
  test("reads a single cookie", () => {
    const request = cookieRequest("theme=dark; locale=id-ID");

    expect(getCookie(request, "theme")).toBe("dark");
    expect(getCookie(request, "locale")).toBe("id-ID");
    expect(getCookie(request, "missing")).toBeUndefined();
  });

  test("reads multiple cookies with optional whitespace", () => {
    const request = cookieRequest("a=1;\tb=2 ; c=3");

    expect(getCookie(request, "b")).toBe("2");
    expect(getCookies(request, "c")).toEqual(["3"]);
  });

  test("preserves empty values", () => {
    const request = cookieRequest("empty=; full=value");

    expect(getCookie(request, "empty")).toBe("");
  });

  test("decodes percent-encoded logical values", () => {
    const request = cookieRequest("message=hello%20world%F0%9F%8C%8D");

    expect(getCookie(request, "message")).toBe("hello world🌍");
  });

  test("preserves invalid percent sequences", () => {
    const request = cookieRequest("broken=%E0%A4%A");

    expect(getCookie(request, "broken")).toBe("%E0%A4%A");
  });

  test("preserves duplicate same-name values", () => {
    const request = cookieRequest("session=first; theme=dark; session=second");

    expect(getCookie(request, "session")).toBe("first");
    expect(getCookies(request, "session")).toEqual(["first", "second"]);
  });

  test("collects all cookie names without collapsing duplicates", () => {
    const request = cookieRequest("a=1; b=2; a=3");
    const cookies = getCookies(request);

    expect(cookies.a).toEqual(["1", "3"]);
    expect(cookies.b).toEqual(["2"]);
  });

  test("accepts quoted valid cookie values", () => {
    const request = cookieRequest('quoted="hello-world"; next=ok');

    expect(getCookie(request, "quoted")).toBe("hello-world");
  });

  test("skips malformed unrelated pairs", () => {
    const request = cookieRequest("broken; =bad; good=ok; also-broken");

    expect(getCookie(request, "good")).toBe("ok");
    expect(getCookies(request, "good")).toEqual(["ok"]);
  });
});

describe("P11-C cookie serialization", () => {
  test("serializes the supported Set-Cookie attributes", () => {
    const expires = new Date(Date.now() + 60_000);
    const value = generateCookie("session", "hello world", {
      domain: "example.com",
      expires,
      httpOnly: true,
      maxAge: 60,
      path: "/api",
      priority: "High",
      sameSite: "None",
      secure: true,
      partitioned: true,
    });

    expect(value).toContain("session=hello%20world");
    expect(value).toContain("Domain=example.com");
    expect(value).toContain("Path=/api");
    expect(value).toContain(`Expires=${expires.toUTCString()}`);
    expect(value).toContain("Max-Age=60");
    expect(value).toContain("HttpOnly");
    expect(value).toContain("Secure");
    expect(value).toContain("SameSite=None");
    expect(value).toContain("Priority=High");
    expect(value).toContain("Partitioned");
  });

  test("defaults Path to root", () => {
    expect(generateCookie("theme", "dark")).toBe("theme=dark; Path=/");
  });

  test("appends rather than replaces Set-Cookie", () => {
    const headers = new Headers();

    setCookie(headers, "first", "1");
    setCookie(headers, "second", "2");

    const value = headers.get("set-cookie");
    expect(value).not.toBeNull();
    expect(value).toContain("first=1");
    expect(value).toContain("second=2");
  });

  test("serializes deletion with matching scope", () => {
    const headers = new Headers();

    deleteCookie(headers, "session", {
      domain: "example.com",
      path: "/api",
      sameSite: "Lax",
      secure: true,
    });

    const value = headers.get("set-cookie")!;
    expect(value).toContain("session=");
    expect(value).toContain("Path=/api");
    expect(value).toContain("Domain=example.com");
    expect(value).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(value).toContain("Max-Age=0");
    expect(value).toContain("Secure");
    expect(value).toContain("SameSite=Lax");
  });

  test("rejects invalid names and attribute injection", () => {
    expect(() => generateCookie("bad name", "value")).toThrow(TypeError);

    expect(() =>
      generateCookie("safe", "value", {
        domain: "example.com\r\nX-Evil: yes",
      }),
    ).toThrow(TypeError);

    expect(() =>
      generateCookie("safe", "value", {
        path: "/ok; injected=yes",
      }),
    ).toThrow(TypeError);
  });

  test("encodes delimiter and unicode values", () => {
    const value = generateCookie("message", "hello; world, 🌍\n");

    expect(value).toContain("hello%3B%20world%2C%20%F0%9F%8C%8D%0A");
  });

  test("accepts the 400-day Max-Age boundary and rejects values above it", () => {
    expect(generateCookie("age", "ok", { maxAge: MAX_AGE })).toContain(
      `Max-Age=${MAX_AGE}`,
    );

    expect(() =>
      generateCookie("age", "bad", { maxAge: MAX_AGE + 1 }),
    ).toThrow(RangeError);
  });

  test("rejects invalid and overlong Expires values", () => {
    expect(() =>
      generateCookie("expires", "bad", { expires: new Date(Number.NaN) }),
    ).toThrow(TypeError);

    expect(() =>
      generateCookie("expires", "bad", {
        expires: new Date(Date.now() + (MAX_AGE + 60) * 1000),
      }),
    ).toThrow(RangeError);

    expect(
      generateCookie("expires", "ok", {
        expires: new Date(Date.now() + (MAX_AGE - 60) * 1000),
      }),
    ).toContain("Expires=");
  });

  test("rejects non-integer and non-finite Max-Age values", () => {
    expect(() =>
      generateCookie("age", "bad", { maxAge: Number.POSITIVE_INFINITY }),
    ).toThrow(TypeError);

    expect(() => generateCookie("age", "bad", { maxAge: 1.5 })).toThrow(
      TypeError,
    );
  });

  test("enforces SameSite=None and Partitioned Secure requirements at runtime", () => {
    expect(() =>
      Reflect.apply(generateCookie, undefined, [
        "session",
        "value",
        { sameSite: "None" },
      ]),
    ).toThrow(TypeError);

    expect(() =>
      Reflect.apply(generateCookie, undefined, [
        "session",
        "value",
        { partitioned: true },
      ]),
    ).toThrow(TypeError);
  });

  test("enforces __Secure- and mixed-case prefix validation", () => {
    const secureName: string = "__Secure-session";
    const mixedName: string = "__sEcUrE-session";

    expect(() => generateCookie(secureName, "value")).toThrow(TypeError);
    expect(() => generateCookie(mixedName, "value")).toThrow(TypeError);

    expect(
      generateCookie("__Secure-session", "value", { secure: true }),
    ).toContain("Secure");
  });

  test("enforces __Host- Secure, Path=/, and no Domain", () => {
    const hostName: string = "__hOsT-session";

    expect(() => generateCookie(hostName, "value")).toThrow(TypeError);

    expect(() =>
      Reflect.apply(generateCookie, undefined, [
        hostName,
        "value",
        { secure: true, path: "/nested" },
      ]),
    ).toThrow(TypeError);

    expect(() =>
      Reflect.apply(generateCookie, undefined, [
        hostName,
        "value",
        { secure: true, domain: "example.com" },
      ]),
    ).toThrow(TypeError);

    expect(
      generateCookie("__Host-session", "value", {
        secure: true,
        path: "/",
      }),
    ).toContain("__Host-session=value; Path=/; Secure");
  });
});

describe("P11-C signed cookies", () => {
  test("generates and verifies a valid signed cookie", async () => {
    const setCookieValue = await generateSignedCookie(
      "session",
      "user-123",
      CURRENT_SECRET,
    );
    const request = requestFromSetCookie(setCookieValue);

    await expect(
      getSignedCookie(request, "session", CURRENT_SECRET),
    ).resolves.toEqual({
      status: "valid",
      value: "user-123",
      secretIndex: 0,
    });
  });

  test("rejects tampered and malformed signed values without throwing", async () => {
    const setCookieValue = await generateSignedCookie(
      "session",
      "user-123",
      CURRENT_SECRET,
    );
    const request = requestFromSetCookie(setCookieValue);
    const signed = getCookie(request, "session")!;
    const tampered = `X${signed.slice(1)}`;

    await expect(verifySignedCookie(tampered, CURRENT_SECRET)).resolves.toEqual({
      status: "invalid",
    });

    await expect(
      verifySignedCookie("not-a-signed-cookie", CURRENT_SECRET),
    ).resolves.toEqual({ status: "invalid" });
  });

  test("rejects the wrong secret", async () => {
    const setCookieValue = await generateSignedCookie(
      "session",
      "user-123",
      CURRENT_SECRET,
    );
    const signed = getCookie(requestFromSetCookie(setCookieValue), "session")!;

    await expect(verifySignedCookie(signed, WRONG_SECRET)).resolves.toEqual({
      status: "invalid",
    });
  });

  test("reports current and previous rotation secret indices", async () => {
    const currentSetCookie = await generateSignedCookie(
      "session",
      "current",
      CURRENT_SECRET,
    );
    const currentSigned = getCookie(
      requestFromSetCookie(currentSetCookie),
      "session",
    )!;

    await expect(
      verifySignedCookie(currentSigned, [CURRENT_SECRET, OLD_SECRET]),
    ).resolves.toEqual({
      status: "valid",
      value: "current",
      secretIndex: 0,
    });

    const oldSetCookie = await generateSignedCookie(
      "session",
      "old",
      OLD_SECRET,
    );
    const oldSigned = getCookie(requestFromSetCookie(oldSetCookie), "session")!;

    await expect(
      verifySignedCookie(oldSigned, [CURRENT_SECRET, OLD_SECRET]),
    ).resolves.toEqual({
      status: "valid",
      value: "old",
      secretIndex: 1,
    });
  });

  test("reports missing and duplicate signed-cookie states", async () => {
    await expect(
      getSignedCookie(cookieRequest("theme=dark"), "session", CURRENT_SECRET),
    ).resolves.toEqual({ status: "missing" });

    const setCookieValue = await generateSignedCookie(
      "session",
      "user-123",
      CURRENT_SECRET,
    );
    const pair = setCookieValue.slice(0, setCookieValue.indexOf(";"));

    await expect(
      getSignedCookie(
        cookieRequest(`${pair}; ${pair}`),
        "session",
        CURRENT_SECRET,
      ),
    ).resolves.toEqual({ status: "ambiguous" });
  });

  test("rejects empty and short secrets", async () => {
    await expect(
      generateSignedCookie("session", "value", []),
    ).rejects.toBeInstanceOf(TypeError);

    await expect(
      generateSignedCookie("session", "value", "too-short"),
    ).rejects.toBeInstanceOf(RangeError);
  });

  test("supports BufferSource secrets", async () => {
    const secret = new Uint8Array(32);
    secret.fill(7);

    const setCookieValue = await generateSignedCookie(
      "session",
      "binary-secret",
      secret,
    );
    const signed = getCookie(requestFromSetCookie(setCookieValue), "session")!;

    await expect(verifySignedCookie(signed, secret)).resolves.toEqual({
      status: "valid",
      value: "binary-secret",
      secretIndex: 0,
    });
  });

  test("round-trips unicode logical values", async () => {
    const logical = "pengguna-🌍-日本語";
    const setCookieValue = await generateSignedCookie(
      "session",
      logical,
      CURRENT_SECRET,
    );

    await expect(
      getSignedCookie(
        requestFromSetCookie(setCookieValue),
        "session",
        CURRENT_SECRET,
      ),
    ).resolves.toEqual({
      status: "valid",
      value: logical,
      secretIndex: 0,
    });
  });

  test("appends signed Set-Cookie fields", async () => {
    const headers = new Headers();

    await setSignedCookie(headers, "session", "user-123", CURRENT_SECRET, {
      httpOnly: true,
      sameSite: "Lax",
      secure: true,
    });

    const value = headers.get("set-cookie")!;
    expect(value).toContain("session=user-123.");
    expect(value).toContain("HttpOnly");
    expect(value).toContain("SameSite=Lax");
    expect(value).toContain("Secure");
  });
});

function cookieRequest(cookie: string): Request {
  return new Request("https://example.test/", {
    headers: {
      Cookie: cookie,
    },
  });
}

function requestFromSetCookie(setCookieValue: string): Request {
  const separator = setCookieValue.indexOf(";");
  const pair = separator === -1 ? setCookieValue : setCookieValue.slice(0, separator);

  return cookieRequest(pair);
}
