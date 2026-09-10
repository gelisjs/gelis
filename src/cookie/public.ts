import {
  deleteCookie as deleteCookieRuntime,
  generateCookie as generateCookieRuntime,
  generateSignedCookie as generateSignedCookieRuntime,
  setCookie as setCookieRuntime,
  setSignedCookie as setSignedCookieRuntime,
  verifySignedCookie as verifySignedCookieRuntime,
} from "./index";

import type {
  CookieDeleteOptions,
  CookieOptions,
  CookieSecrets,
  SignedCookieResult,
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

const COOKIE_NAME_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

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

interface ParsedCookiePair {
  readonly name: string;
  readonly value: string;
}

/**
 * Read the first syntactically valid cookie with the requested name.
 *
 * Only RFC optional whitespace (SP / HTAB) is ignored while parsing.
 * Unicode whitespace is never normalized into a different cookie name.
 * Security-sensitive callers should use `getCookies()` or
 * `getSignedCookie()` when duplicate same-name values matter.
 */
export function getCookie(request: Request, name: string): string | undefined {
  if (!COOKIE_NAME_TOKEN.test(name)) {
    return undefined;
  }

  const header = request.headers.get("cookie");
  if (header === null || header.length === 0) {
    return undefined;
  }

  let result: string | undefined;
  scanCookieHeader(header, (pair) => {
    if (result === undefined && pair.name === name) {
      result = pair.value;
    }
  });

  return result;
}

export function getCookies(
  request: Request,
  name: string,
): readonly string[];
export function getCookies(
  request: Request,
): Readonly<Record<string, readonly string[]>>;
export function getCookies(
  request: Request,
  name?: string,
): readonly string[] | Readonly<Record<string, readonly string[]>> {
  const header = request.headers.get("cookie");

  if (name !== undefined) {
    if (!COOKIE_NAME_TOKEN.test(name) || header === null || header.length === 0) {
      return [];
    }

    const values: string[] = [];
    scanCookieHeader(header, (pair) => {
      if (pair.name === name) {
        values.push(pair.value);
      }
    });
    return values;
  }

  const cookies = Object.create(null) as Record<string, string[]>;
  if (header === null || header.length === 0) {
    return cookies;
  }

  scanCookieHeader(header, (pair) => {
    const existing = cookies[pair.name];
    if (existing === undefined) {
      cookies[pair.name] = [pair.value];
    } else {
      existing.push(pair.value);
    }
  });

  return cookies;
}

export async function getSignedCookie(
  request: Request,
  name: string,
  secrets: CookieSecrets,
): Promise<SignedCookieResult> {
  const values = getCookies(request, name);

  if (values.length === 0) {
    return { status: "missing" };
  }

  if (values.length !== 1) {
    return { status: "ambiguous" };
  }

  return verifySignedCookieRuntime(values[0]!, secrets);
}

export const verifySignedCookie = verifySignedCookieRuntime;

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

function scanCookieHeader(
  header: string,
  visit: (pair: ParsedCookiePair) => void,
): void {
  let start = 0;

  for (let index = 0; index <= header.length; index++) {
    const char = header.charCodeAt(index);
    if (index !== header.length && char !== 59 && char !== 44) {
      continue;
    }

    const pair = parseCookiePair(header, start, index);
    start = index + 1;

    if (pair !== undefined) {
      visit(pair);
    }
  }
}

function parseCookiePair(
  header: string,
  start: number,
  end: number,
): ParsedCookiePair | undefined {
  while (start < end && isOptionalWhitespace(header.charCodeAt(start))) {
    start += 1;
  }
  while (end > start && isOptionalWhitespace(header.charCodeAt(end - 1))) {
    end -= 1;
  }

  if (start >= end) {
    return undefined;
  }

  const equals = header.indexOf("=", start);
  if (equals === -1 || equals >= end) {
    return undefined;
  }

  let nameStart = start;
  let nameEnd = equals;
  while (nameStart < nameEnd && isOptionalWhitespace(header.charCodeAt(nameStart))) {
    nameStart += 1;
  }
  while (nameEnd > nameStart && isOptionalWhitespace(header.charCodeAt(nameEnd - 1))) {
    nameEnd -= 1;
  }

  const rawName = header.slice(nameStart, nameEnd);
  if (!COOKIE_NAME_TOKEN.test(rawName)) {
    return undefined;
  }

  let valueStart = equals + 1;
  let valueEnd = end;
  while (valueStart < valueEnd && isOptionalWhitespace(header.charCodeAt(valueStart))) {
    valueStart += 1;
  }
  while (valueEnd > valueStart && isOptionalWhitespace(header.charCodeAt(valueEnd - 1))) {
    valueEnd -= 1;
  }

  if (valueStart < valueEnd && header.charCodeAt(valueStart) === 34) {
    if (valueEnd - valueStart < 2 || header.charCodeAt(valueEnd - 1) !== 34) {
      return undefined;
    }

    valueStart += 1;
    valueEnd -= 1;
  }

  const rawValue = header.slice(valueStart, valueEnd);
  if (!isValidCookieValue(rawValue)) {
    return undefined;
  }

  return {
    name: rawName,
    value: decodeCookieValue(rawValue),
  };
}

function isValidCookieValue(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);

    if (
      code === 0x21 ||
      (code >= 0x23 && code <= 0x2b) ||
      (code >= 0x2d && code <= 0x3a) ||
      (code >= 0x3c && code <= 0x5b) ||
      (code >= 0x5d && code <= 0x7e)
    ) {
      continue;
    }

    return false;
  }

  return true;
}

function decodeCookieValue(value: string): string {
  if (!value.includes("%")) {
    return value;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isOptionalWhitespace(code: number): boolean {
  return code === 32 || code === 9;
}
