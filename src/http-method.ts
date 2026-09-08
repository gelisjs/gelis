/*
 * HTTP method vocabulary and validation.
 *
 * HttpMethod is deliberately the small first-class Gelis convenience-method
 * surface. Generic route() may accept other HTTP method tokens while
 * preserving their literal identity.
 */

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD"
  | "QUERY";

/*
 * Reserved by Gelis for the P9-C ALL pseudo-method.
 *
 * It is not accepted by generic route().
 */
export const ALL_ROUTE_METHOD = "*" as const;

type FetchForbiddenMethod = "CONNECT" | "TRACE" | "TRACK";

type FetchNormalizedMethod =
  | "DELETE"
  | "GET"
  | "HEAD"
  | "OPTIONS"
  | "POST"
  | "PUT";

type HttpTokenCharacter =
  | "!"
  | "#"
  | "$"
  | "%"
  | "&"
  | "'"
  | "*"
  | "+"
  | "-"
  | "."
  | "^"
  | "_"
  | "`"
  | "|"
  | "~"
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | "L"
  | "M"
  | "N"
  | "O"
  | "P"
  | "Q"
  | "R"
  | "S"
  | "T"
  | "U"
  | "V"
  | "W"
  | "X"
  | "Y"
  | "Z"
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z";

type IsHttpToken<Value extends string> = Value extends ""
  ? true
  : Value extends `${infer Head}${infer Tail}`
    ? Head extends HttpTokenCharacter
      ? IsHttpToken<Tail>
      : false
    : false;

/*
 * Lightweight literal validation for generic route().
 *
 * Dynamic strings remain accepted because runtime validation is authoritative.
 */
export type ValidHttpMethodLiteral<Method extends string> =
  string extends Method
    ? unknown
    : Method extends ""
      ? never
      : Method extends typeof ALL_ROUTE_METHOD
        ? never
        : IsHttpToken<Method> extends true
          ? Uppercase<Method> extends FetchForbiddenMethod
            ? never
            : Uppercase<Method> extends FetchNormalizedMethod
              ? Method extends Uppercase<Method>
                ? unknown
                : never
              : unknown
          : never;

const HTTP_METHOD_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

const FETCH_FORBIDDEN_METHODS = new Set<string>(["CONNECT", "TRACE", "TRACK"]);

const FETCH_NORMALIZED_METHODS = new Set<string>([
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "POST",
  "PUT",
]);

export function assertHttpMethodToken(method: string): void {
  if (method === ALL_ROUTE_METHOD) {
    throw new TypeError(
      'HTTP method "*" is reserved for Gelis all-route matching',
    );
  }

  if (!HTTP_METHOD_TOKEN.test(method)) {
    throw new TypeError(`Invalid HTTP method token: ${JSON.stringify(method)}`);
  }

  const upper = method.toUpperCase();

  if (FETCH_FORBIDDEN_METHODS.has(upper)) {
    throw new TypeError(`Forbidden Fetch HTTP method: ${method}`);
  }

  if (FETCH_NORMALIZED_METHODS.has(upper) && method !== upper) {
    throw new TypeError(
      `Non-canonical Fetch-normalized HTTP method: ${method}`,
    );
  }
}

export function assertRouteMethod(method: string): void {
  if (method === ALL_ROUTE_METHOD) {
    return;
  }

  assertHttpMethodToken(method);
}
