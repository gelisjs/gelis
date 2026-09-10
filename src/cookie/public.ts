import {
  deleteCookie as deleteCookieRuntime,
  generateCookie as generateCookieRuntime,
  generateSignedCookie as generateSignedCookieRuntime,
  setCookie as setCookieRuntime,
  setSignedCookie as setSignedCookieRuntime,
} from "./index";

import type {
  CookieDeleteOptions,
  CookieOptions,
  CookieSecrets,
} from "./index";

export {
  getCookie,
  getCookies,
  getSignedCookie,
  verifySignedCookie,
} from "./index";

export type {
  CookieDeleteOptions,
  CookieOptions,
  CookiePriority,
  CookieSameSite,
  CookieSecret,
  CookieSecrets,
  SignedCookieResult,
  SignedCookieVerification,
} from "./index";

type RequiresSecurePrefixOptions<Name extends string> =
  Lowercase<Name> extends `__secure-${string}` | `__host-${string}`
    ? true
    : false;

type CookieOptionArguments<Name extends string> =
  RequiresSecurePrefixOptions<Name> extends true
    ? [options: CookieOptions<Name>]
    : [options?: CookieOptions<Name>];

type CookieDeleteOptionArguments<Name extends string> =
  RequiresSecurePrefixOptions<Name> extends true
    ? [options: CookieDeleteOptions<Name>]
    : [options?: CookieDeleteOptions<Name>];

export function generateCookie<const Name extends string>(
  name: Name,
  value: string,
  ...options: CookieOptionArguments<Name>
): string {
  return generateCookieRuntime(name, value, options[0]);
}

export function setCookie<const Name extends string>(
  headers: Headers,
  name: Name,
  value: string,
  ...options: CookieOptionArguments<Name>
): void {
  setCookieRuntime(headers, name, value, options[0]);
}

export function deleteCookie<const Name extends string>(
  headers: Headers,
  name: Name,
  ...options: CookieDeleteOptionArguments<Name>
): void {
  deleteCookieRuntime(headers, name, options[0]);
}

export function generateSignedCookie<const Name extends string>(
  name: Name,
  value: string,
  secrets: CookieSecrets,
  ...options: CookieOptionArguments<Name>
): Promise<string> {
  return generateSignedCookieRuntime(name, value, secrets, options[0]);
}

export function setSignedCookie<const Name extends string>(
  headers: Headers,
  name: Name,
  value: string,
  secrets: CookieSecrets,
  ...options: CookieOptionArguments<Name>
): Promise<void> {
  return setSignedCookieRuntime(headers, name, value, secrets, options[0]);
}
