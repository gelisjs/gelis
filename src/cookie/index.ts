const COOKIE_NAME_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const UNSAFE_ATTRIBUTE = /[;\u0000-\u001F\u007F]/;
const MAX_COOKIE_AGE_SECONDS = 400 * 24 * 60 * 60;
const MAX_COOKIE_AGE_MS = MAX_COOKIE_AGE_SECONDS * 1000;
const HMAC_ALGORITHM = {
  name: "HMAC",
  hash: "SHA-256",
} as const;

const encoder = new TextEncoder();

export type CookieSameSite = "Strict" | "Lax" | "None";
export type CookiePriority = "Low" | "Medium" | "High";

interface CookieCommonOptions {
  readonly domain?: string;
  readonly expires?: Date;
  readonly httpOnly?: boolean;
  readonly maxAge?: number;
  readonly path?: string;
  readonly priority?: CookiePriority;
}

type CookieSecurityOptions =
  | {
      readonly secure: true;
      readonly sameSite?: CookieSameSite;
      readonly partitioned?: boolean;
    }
  | {
      readonly secure?: false;
      readonly sameSite?: Exclude<CookieSameSite, "None">;
      readonly partitioned?: false;
    };

type CookieOptionCore = CookieCommonOptions & CookieSecurityOptions;

type SecureCookieOptions = Extract<CookieOptionCore, { readonly secure: true }>;

type ApplyCookiePrefix<Name extends string> = Lowercase<Name> extends `__host-${string}`
  ? Omit<SecureCookieOptions, "domain" | "path"> & {
      readonly domain?: never;
      readonly path?: "/";
    }
  : Lowercase<Name> extends `__secure-${string}`
    ? SecureCookieOptions
    : CookieOptionCore;

/**
 * Cookie serialization options.
 *
 * Literal `__Secure-` / `__Host-` names and modern Secure-dependent
 * attributes receive compile-time constraints. Runtime validation remains
 * authoritative for dynamic names and values.
 */
export type CookieOptions<Name extends string = string> =
  ApplyCookiePrefix<Name>;

interface CookieDeleteCommonOptions {
  readonly domain?: string;
  readonly httpOnly?: boolean;
  readonly path?: string;
  readonly priority?: CookiePriority;
}

type CookieDeleteCore = CookieDeleteCommonOptions & CookieSecurityOptions;

type SecureCookieDeleteOptions = Extract<
  CookieDeleteCore,
  { readonly secure: true }
>;

type ApplyDeletePrefix<Name extends string> = Lowercase<Name> extends `__host-${string}`
  ? Omit<SecureCookieDeleteOptions, "domain" | "path"> & {
      readonly domain?: never;
      readonly path?: "/";
    }
  : Lowercase<Name> extends `__secure-${string}`
    ? SecureCookieDeleteOptions
    : CookieDeleteCore;

export type CookieDeleteOptions<Name extends string = string> =
  ApplyDeletePrefix<Name>;

export type CookieSecret = string | BufferSource;
export type CookieSecrets = CookieSecret | readonly CookieSecret[];

export type SignedCookieVerification =
  | {
      readonly status: "valid";
      readonly value: string;
      readonly secretIndex: number;
    }
  | {
      readonly status: "invalid";
    };

export type SignedCookieResult =
  | SignedCookieVerification
  | {
      readonly status: "missing";
    }
  | {
      readonly status: "ambiguous";
    };

/**
 * Read the first syntactically valid cookie with the requested name.
 *
 * Security-sensitive callers that need duplicate detection should use
 * `getCookies(request, name)` or `getSignedCookie()` instead.
 */
export function getCookie(request: Request, name: string): string | undefined {
  if (!COOKIE_NAME_TOKEN.test(name)) {
    return undefined;
  }

  const header = request.headers.get("cookie");
  if (header === null || header.length === 0) {
    return undefined;
  }

  let start = 0;

  for (let index = 0; index <= header.length; index++) {
    const char = header.charCodeAt(index);
    if (index !== header.length && char !== 59 && char !== 44) {
      continue;
    }

    const pair = parseCookiePair(header, start, index);
    start = index + 1;

    if (pair !== undefined && pair.name === name) {
      return pair.value;
    }
  }

  return undefined;
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

export function generateCookie<const Name extends string>(
  name: Name,
  value: string,
  options: CookieOptions<Name> = {} as CookieOptions<Name>,
): string {
  assertCookieName(name);

  const encodedValue = encodeCookieValue(value);
  const normalized = normalizeCookieOptions(name, options);

  let cookie = `${name}=${encodedValue}`;

  if (normalized.domain !== undefined) {
    cookie += `; Domain=${normalized.domain}`;
  }

  cookie += `; Path=${normalized.path}`;

  if (normalized.expires !== undefined) {
    cookie += `; Expires=${normalized.expires.toUTCString()}`;
  }

  if (normalized.maxAge !== undefined) {
    cookie += `; Max-Age=${normalized.maxAge}`;
  }

  if (normalized.httpOnly) {
    cookie += "; HttpOnly";
  }

  if (normalized.secure) {
    cookie += "; Secure";
  }

  if (normalized.sameSite !== undefined) {
    cookie += `; SameSite=${normalized.sameSite}`;
  }

  if (normalized.priority !== undefined) {
    cookie += `; Priority=${normalized.priority}`;
  }

  if (normalized.partitioned) {
    cookie += "; Partitioned";
  }

  return cookie;
}

export function setCookie<const Name extends string>(
  headers: Headers,
  name: Name,
  value: string,
  options: CookieOptions<Name> = {} as CookieOptions<Name>,
): void {
  headers.append("Set-Cookie", generateCookie(name, value, options));
}

export function deleteCookie<const Name extends string>(
  headers: Headers,
  name: Name,
  options: CookieDeleteOptions<Name> = {} as CookieDeleteOptions<Name>,
): void {
  const normalized = normalizeDeleteOptions(name, options);

  let cookie = `${name}=; Path=${normalized.path}; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0`;

  if (normalized.domain !== undefined) {
    cookie += `; Domain=${normalized.domain}`;
  }

  if (normalized.httpOnly) {
    cookie += "; HttpOnly";
  }

  if (normalized.secure) {
    cookie += "; Secure";
  }

  if (normalized.sameSite !== undefined) {
    cookie += `; SameSite=${normalized.sameSite}`;
  }

  if (normalized.priority !== undefined) {
    cookie += `; Priority=${normalized.priority}`;
  }

  if (normalized.partitioned) {
    cookie += "; Partitioned";
  }

  headers.append("Set-Cookie", cookie);
}

export async function verifySignedCookie(
  signedValue: string,
  secrets: CookieSecrets,
): Promise<SignedCookieVerification> {
  const separator = signedValue.lastIndexOf(".");
  if (separator <= 0 || separator === signedValue.length - 1) {
    return { status: "invalid" };
  }

  const value = signedValue.slice(0, separator);
  const signature = decodeBase64(signedValue.slice(separator + 1));
  if (signature === undefined || signature.byteLength !== 32) {
    return { status: "invalid" };
  }

  const normalizedSecrets = normalizeSecrets(secrets);
  const data = encoder.encode(value);

  for (let index = 0; index < normalizedSecrets.length; index++) {
    const secret = normalizedSecrets[index]!;
    const key = await importHmacKey(secret, ["verify"]);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      data,
    );

    if (valid) {
      return {
        status: "valid",
        value,
        secretIndex: index,
      };
    }
  }

  return { status: "invalid" };
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

  return verifySignedCookie(values[0]!, secrets);
}

export async function generateSignedCookie<const Name extends string>(
  name: Name,
  value: string,
  secrets: CookieSecrets,
  options: CookieOptions<Name> = {} as CookieOptions<Name>,
): Promise<string> {
  const normalizedSecrets = normalizeSecrets(secrets);
  const key = await importHmacKey(normalizedSecrets[0]!, ["sign"]);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(value),
  );

  const signedValue = `${value}.${encodeBase64(new Uint8Array(signature))}`;
  return generateCookie(name, signedValue, options);
}

export async function setSignedCookie<const Name extends string>(
  headers: Headers,
  name: Name,
  value: string,
  secrets: CookieSecrets,
  options: CookieOptions<Name> = {} as CookieOptions<Name>,
): Promise<void> {
  headers.append(
    "Set-Cookie",
    await generateSignedCookie(name, value, secrets, options),
  );
}

interface ParsedCookiePair {
  readonly name: string;
  readonly value: string;
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

  const rawName = header.slice(start, equals).trim();
  if (!COOKIE_NAME_TOKEN.test(rawName)) {
    return undefined;
  }

  let rawValue = header.slice(equals + 1, end).trim();
  if (
    rawValue.length >= 2 &&
    rawValue.charCodeAt(0) === 34 &&
    rawValue.charCodeAt(rawValue.length - 1) === 34
  ) {
    rawValue = rawValue.slice(1, -1);
  }

  return {
    name: rawName,
    value: decodeCookieValue(rawValue),
  };
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

function isOptionalWhitespace(code: number): boolean {
  return code === 32 || code === 9;
}

interface NormalizedCookieOptions {
  readonly domain?: string;
  readonly expires?: Date;
  readonly httpOnly: boolean;
  readonly maxAge?: number;
  readonly path: string;
  readonly secure: boolean;
  readonly sameSite?: CookieSameSite;
  readonly priority?: CookiePriority;
  readonly partitioned: boolean;
}

function normalizeCookieOptions<Name extends string>(
  name: Name,
  options: CookieOptions<Name>,
): NormalizedCookieOptions {
  const path = options.path ?? "/";
  const secure = options.secure === true;
  const partitioned = options.partitioned === true;

  assertCookieAttribute("Path", path);
  if (!path.startsWith("/")) {
    throw new TypeError("Cookie Path must start with '/'");
  }

  if (options.domain !== undefined) {
    assertCookieAttribute("Domain", options.domain);
    if (options.domain.length === 0) {
      throw new TypeError("Cookie Domain must not be empty");
    }
  }

  if (options.maxAge !== undefined) {
    if (!Number.isFinite(options.maxAge) || !Number.isInteger(options.maxAge)) {
      throw new TypeError("Cookie Max-Age must be a finite integer");
    }
    if (options.maxAge > MAX_COOKIE_AGE_SECONDS) {
      throw new RangeError("Cookie Max-Age must not exceed 400 days");
    }
  }

  if (options.expires !== undefined) {
    const time = options.expires.getTime();
    if (!Number.isFinite(time)) {
      throw new TypeError("Cookie Expires must be a valid Date");
    }
    if (time > Date.now() + MAX_COOKIE_AGE_MS) {
      throw new RangeError("Cookie Expires must not exceed 400 days");
    }
  }

  if (options.sameSite === "None" && !secure) {
    throw new TypeError("SameSite=None cookies require Secure");
  }

  if (partitioned && !secure) {
    throw new TypeError("Partitioned cookies require Secure");
  }

  assertCookiePrefix(name, secure, path, options.domain);

  return {
    ...(options.domain === undefined ? {} : { domain: options.domain }),
    ...(options.expires === undefined ? {} : { expires: options.expires }),
    httpOnly: options.httpOnly === true,
    ...(options.maxAge === undefined ? {} : { maxAge: options.maxAge }),
    path,
    secure,
    ...(options.sameSite === undefined ? {} : { sameSite: options.sameSite }),
    ...(options.priority === undefined ? {} : { priority: options.priority }),
    partitioned,
  };
}

function normalizeDeleteOptions<Name extends string>(
  name: Name,
  options: CookieDeleteOptions<Name>,
): Omit<NormalizedCookieOptions, "expires" | "maxAge"> {
  const path = options.path ?? "/";
  const secure = options.secure === true;
  const partitioned = options.partitioned === true;

  assertCookieName(name);
  assertCookieAttribute("Path", path);
  if (!path.startsWith("/")) {
    throw new TypeError("Cookie Path must start with '/'");
  }

  if (options.domain !== undefined) {
    assertCookieAttribute("Domain", options.domain);
    if (options.domain.length === 0) {
      throw new TypeError("Cookie Domain must not be empty");
    }
  }

  if (options.sameSite === "None" && !secure) {
    throw new TypeError("SameSite=None cookies require Secure");
  }

  if (partitioned && !secure) {
    throw new TypeError("Partitioned cookies require Secure");
  }

  assertCookiePrefix(name, secure, path, options.domain);

  return {
    ...(options.domain === undefined ? {} : { domain: options.domain }),
    httpOnly: options.httpOnly === true,
    path,
    secure,
    ...(options.sameSite === undefined ? {} : { sameSite: options.sameSite }),
    ...(options.priority === undefined ? {} : { priority: options.priority }),
    partitioned,
  };
}

function assertCookieName(name: string): void {
  if (!COOKIE_NAME_TOKEN.test(name)) {
    throw new TypeError("Invalid cookie name");
  }
}

function assertCookieAttribute(label: string, value: string): void {
  if (UNSAFE_ATTRIBUTE.test(value)) {
    throw new TypeError(`Invalid Cookie ${label} attribute`);
  }
}

function assertCookiePrefix(
  name: string,
  secure: boolean,
  path: string,
  domain: string | undefined,
): void {
  const lowerName = name.toLowerCase();

  if (lowerName.startsWith("__secure-") && !secure) {
    throw new TypeError("__Secure- cookies require Secure");
  }

  if (lowerName.startsWith("__host-")) {
    if (!secure) {
      throw new TypeError("__Host- cookies require Secure");
    }
    if (path !== "/") {
      throw new TypeError("__Host- cookies require Path=/");
    }
    if (domain !== undefined) {
      throw new TypeError("__Host- cookies must not set Domain");
    }
  }
}

function normalizeSecrets(secrets: CookieSecrets): readonly CookieSecret[] {
  const list = Array.isArray(secrets) ? secrets : [secrets];
  if (list.length === 0) {
    throw new TypeError("Signed cookie secrets must contain at least one secret");
  }

  for (const secret of list) {
    if (secretByteLength(secret) < 32) {
      throw new RangeError("Signed cookie secrets must be at least 32 bytes");
    }
  }

  return list;
}

function secretByteLength(secret: CookieSecret): number {
  if (typeof secret === "string") {
    return encoder.encode(secret).byteLength;
  }

  if (secret instanceof ArrayBuffer) {
    return secret.byteLength;
  }

  return secret.byteLength;
}

async function importHmacKey(
  secret: CookieSecret,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const bytes = secretBytes(secret);
  return crypto.subtle.importKey(
    "raw",
    bytes,
    HMAC_ALGORITHM,
    false,
    usages,
  );
}

function secretBytes(secret: CookieSecret): Uint8Array<ArrayBuffer> {
  if (typeof secret === "string") {
    return encoder.encode(secret);
  }

  if (secret instanceof ArrayBuffer) {
    return new Uint8Array(secret);
  }

  const copy = new Uint8Array(secret.byteLength);
  copy.set(new Uint8Array(secret.buffer, secret.byteOffset, secret.byteLength));
  return copy;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index++) {
    binary += String.fromCharCode(bytes[index]!);
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> | undefined {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return undefined;
  }
}
