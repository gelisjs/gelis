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
  if (
    header === null ||
    header.length === 0 ||
    header.indexOf(name) === -1
  ) {
    return undefined;
  }

  return findCookieValue(header, name);
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
    if (
      !COOKIE_NAME_TOKEN.test(name) ||
      header === null ||
      header.length === 0 ||
      header.indexOf(name) === -1
    ) {
      return [];
    }

    return collectCookieValues(header, name);
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
): string;
export function generateCookie(
  name: string,
  value: string,
  options?: CookieOptions,
): string {
  if (options === undefined && !hasSecurityPrefix(name)) {
    if (!COOKIE_NAME_TOKEN.test(name)) {
      throw new TypeError("Invalid cookie name");
    }

    return `${name}=${encodeCookieValue(value)}; Path=/`;
  }

  return generateCookieRuntime(name, value, options);
}

export function setCookie<const Name extends string>(
  headers: Headers,
  name: Name,
  value: string,
  ...options: CookieOptionArguments<Name>
): void;
export function setCookie(
  headers: Headers,
  name: string,
  value: string,
  options?: CookieOptions,
): void {
  if (options === undefined && !hasSecurityPrefix(name)) {
    headers.append("Set-Cookie", generateCookie(name, value));
    return;
  }

  setCookieRuntime(headers, name, value, options);
}

export function deleteCookie<const Name extends string>(
  headers: Headers,
  name: Name,
  ...options: CookieDeleteOptionArguments<Name>
): void;
export function deleteCookie(
  headers: Headers,
  name: string,
  options?: CookieDeleteOptions,
): void {
  deleteCookieRuntime(headers, name, options);
}

export function generateSignedCookie<const Name extends string>(
  name: Name,
  value: string,
  secrets: CookieSecrets,
  ...options: CookieOptionArguments<Name>
): Promise<string>;
export function generateSignedCookie(
  name: string,
  value: string,
  secrets: CookieSecrets,
  options?: CookieOptions,
): Promise<string> {
  return generateSignedCookieRuntime(name, value, secrets, options);
}

export function setSignedCookie<const Name extends string>(
  headers: Headers,
  name: Name,
  value: string,
  secrets: CookieSecrets,
  ...options: CookieOptionArguments<Name>
): Promise<void>;
export function setSignedCookie(
  headers: Headers,
  name: string,
  value: string,
  secrets: CookieSecrets,
  options?: CookieOptions,
): Promise<void> {
  return setSignedCookieRuntime(headers, name, value, secrets, options);
}

function findCookieValue(header: string, name: string): string | undefined {
  let start = 0;

  for (let index = 0; index <= header.length; index++) {
    const char = header.charCodeAt(index);
    if (index !== header.length && char !== 59 && char !== 44) {
      continue;
    }

    const value = parseNamedCookieValue(header, start, index, name);
    start = index + 1;

    if (value !== null) {
      return value;
    }
  }

  return undefined;
}

function collectCookieValues(header: string, name: string): readonly string[] {
  const values: string[] = [];
  let start = 0;

  for (let index = 0; index <= header.length; index++) {
    const char = header.charCodeAt(index);
    if (index !== header.length && char !== 59 && char !== 44) {
      continue;
    }

    const value = parseNamedCookieValue(header, start, index, name);
    start = index + 1;

    if (value !== null) {
      values.push(value);
    }
  }

  return values;
}

function parseNamedCookieValue(
  header: string,
  start: number,
  end: number,
  name: string,
): string | null {
  while (start < end && isOptionalWhitespace(header.charCodeAt(start))) {
    start += 1;
  }
  while (end > start && isOptionalWhitespace(header.charCodeAt(end - 1))) {
    end -= 1;
  }

  if (start >= end) {
    return null;
  }

  const equals = header.indexOf("=", start);
  if (equals === -1 || equals >= end) {
    return null;
  }

  let nameEnd = equals;
  while (nameEnd > start && isOptionalWhitespace(header.charCodeAt(nameEnd - 1))) {
    nameEnd -= 1;
  }

  if (
    nameEnd - start !== name.length ||
    !header.startsWith(name, start)
  ) {
    return null;
  }

  return parseCookieValue(header, equals + 1, end);
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

  let nameEnd = equals;
  while (nameEnd > start && isOptionalWhitespace(header.charCodeAt(nameEnd - 1))) {
    nameEnd -= 1;
  }

  const rawName = header.slice(start, nameEnd);
  if (!COOKIE_NAME_TOKEN.test(rawName)) {
    return undefined;
  }

  const value = parseCookieValue(header, equals + 1, end);
  if (value === null) {
    return undefined;
  }

  return {
    name: rawName,
    value,
  };
}

function parseCookieValue(
  header: string,
  start: number,
  end: number,
): string | null {
  while (start < end && isOptionalWhitespace(header.charCodeAt(start))) {
    start += 1;
  }
  while (end > start && isOptionalWhitespace(header.charCodeAt(end - 1))) {
    end -= 1;
  }

  if (start < end && header.charCodeAt(start) === 34) {
    if (end - start < 2 || header.charCodeAt(end - 1) !== 34) {
      return null;
    }

    start += 1;
    end -= 1;
  }

  const rawValue = header.slice(start, end);
  if (!isValidCookieValue(rawValue)) {
    return null;
  }

  return decodeCookieValue(rawValue);
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

function encodeCookieValue(value: string): string {
  try {
    return encodeURIComponent(value);
  } catch (cause) {
    throw new TypeError(
      `Invalid cookie value: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

function hasSecurityPrefix(name: string): boolean {
  if (
    name.length < 8 ||
    name.charCodeAt(0) !== 95 ||
    name.charCodeAt(1) !== 95
  ) {
    return false;
  }

  const lower = name.toLowerCase();
  return lower.startsWith("__secure-") || lower.startsWith("__host-");
}

function isOptionalWhitespace(code: number): boolean {
  return code === 32 || code === 9;
}
