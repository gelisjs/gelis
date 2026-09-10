import {
  deleteCookie,
  generateCookie,
  generateSignedCookie,
  setCookie,
  setSignedCookie,
} from "../../src/cookie/public";

import type {
  CookieOptions,
  SignedCookieResult,
} from "../../src/cookie/public";

import type { Equal, Expect } from "./assert";

const headers = new Headers();
const strongSecret = "0123456789abcdef0123456789abcdef";

generateCookie("theme", "dark");
generateCookie("theme", "dark", { sameSite: "Lax" });
generateCookie("session", "value", {
  secure: true,
  sameSite: "None",
  partitioned: true,
});

generateCookie("__Secure-session", "value", {
  secure: true,
});

generateCookie("__Host-session", "value", {
  secure: true,
});

generateCookie("__Host-session", "value", {
  secure: true,
  path: "/",
});

setCookie(headers, "theme", "dark");
deleteCookie(headers, "theme");

void generateSignedCookie("session", "value", strongSecret);
void setSignedCookie(headers, "session", "value", strongSecret);

// Prefix literals must not silently omit their Secure-bearing options.
// @ts-expect-error __Secure-* requires an options argument with secure: true
generateCookie("__Secure-session", "value");

// @ts-expect-error __Secure-* requires secure: true
generateCookie("__Secure-session", "value", {});

// @ts-expect-error mixed-case secure prefix is validated as well
generateCookie("__sEcUrE-session", "value", {});

// @ts-expect-error __Host-* requires an options argument with secure: true
generateCookie("__Host-session", "value");

// @ts-expect-error __Host-* requires secure: true
generateCookie("__Host-session", "value", {});

// @ts-expect-error __Host-* forbids Domain
generateCookie("__Host-session", "value", {
  secure: true,
  domain: "example.com",
});

// @ts-expect-error __Host-* accepts only Path=/ when Path is specified
generateCookie("__Host-session", "value", {
  secure: true,
  path: "/nested",
});

// @ts-expect-error SameSite=None requires Secure
generateCookie("session", "value", {
  sameSite: "None",
});

// @ts-expect-error Partitioned requires Secure
generateCookie("session", "value", {
  partitioned: true,
});

// Deletion preserves the same prefix/security constraints.
// @ts-expect-error __Host-* deletion requires secure options
deleteCookie(headers, "__Host-session");

deleteCookie(headers, "__Host-session", {
  secure: true,
});

// Signed-cookie serializers preserve the same prefix constraints.
// @ts-expect-error __Secure-* signed cookie requires secure options
generateSignedCookie("__Secure-session", "value", strongSecret);

void generateSignedCookie("__Secure-session", "value", strongSecret, {
  secure: true,
});

// @ts-expect-error __Host-* signed Set-Cookie requires secure options
setSignedCookie(headers, "__Host-session", "value", strongSecret);

void setSignedCookie(headers, "__Host-session", "value", strongSecret, {
  secure: true,
});

const hostOptions: CookieOptions<"__Host-token"> = {
  secure: true,
  path: "/",
};

void hostOptions;

declare const signedResult: SignedCookieResult;

if (signedResult.status === "valid") {
  type _Value = Expect<Equal<typeof signedResult.value, string>>;
  type _SecretIndex = Expect<Equal<typeof signedResult.secretIndex, number>>;
  const valueCheck: _Value = true;
  const indexCheck: _SecretIndex = true;
  void valueCheck;
  void indexCheck;
}

if (signedResult.status === "missing") {
  // @ts-expect-error missing state has no verified value
  signedResult.value;
}
