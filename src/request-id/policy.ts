export type RequestIdTrustIncoming =
  boolean | ((value: string, request: Request) => boolean);

export interface RequestIdOptions {
  readonly headerName?: string;
  readonly maxLength?: number;
  readonly trustIncoming?: RequestIdTrustIncoming;
  readonly generator?: (request: Request) => string;
}

export interface CompiledRequestIdPolicy {
  readonly headerName: string;
  readonly maxLength: number;
  resolve(request: Request): string;
}

const DEFAULT_HEADER_NAME = "X-Request-Id";
const DEFAULT_MAX_LENGTH = 255;
const HTTP_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export function compileRequestIdPolicy(
  options?: RequestIdOptions,
): CompiledRequestIdPolicy {
  assertOptionsObject(options);

  const headerName =
    options?.headerName === undefined ? DEFAULT_HEADER_NAME : options.headerName;
  assertHeaderName(headerName);

  const maxLength =
    options?.maxLength === undefined ? DEFAULT_MAX_LENGTH : options.maxLength;
  assertMaxLength(maxLength);

  const trustIncoming =
    options?.trustIncoming === undefined ? false : options.trustIncoming;
  if (
    typeof trustIncoming !== "boolean" &&
    typeof trustIncoming !== "function"
  ) {
    throw new TypeError(
      "Gelis request ID trustIncoming must be a boolean or function",
    );
  }

  const generator =
    options?.generator === undefined
      ? defaultRequestIdGenerator
      : options.generator;
  if (typeof generator !== "function") {
    throw new TypeError("Gelis request ID generator must be a function");
  }

  const generate = (request: Request): string => {
    const value = generator(request);
    assertResolvedRequestId(value, maxLength, "generated");
    return value;
  };

  if (trustIncoming === false) {
    return {
      headerName,
      maxLength,
      resolve: generate,
    };
  }

  if (trustIncoming === true) {
    return {
      headerName,
      maxLength,
      resolve(request) {
        const incoming = request.headers.get(headerName);
        if (
          incoming !== null &&
          isSafeRequestId(incoming, maxLength) &&
          HTTP_TOKEN.test(incoming)
        ) {
          return incoming;
        }

        return generate(request);
      },
    };
  }

  return {
    headerName,
    maxLength,
    resolve(request) {
      const incoming = request.headers.get(headerName);
      if (
        incoming !== null &&
        isSafeRequestId(incoming, maxLength) &&
        trustIncoming(incoming, request)
      ) {
        return incoming;
      }

      return generate(request);
    },
  };
}

function defaultRequestIdGenerator(): string {
  return crypto.randomUUID();
}

function assertOptionsObject(options: RequestIdOptions | undefined): void {
  if (
    options !== undefined &&
    (typeof options !== "object" || options === null || Array.isArray(options))
  ) {
    throw new TypeError("Gelis request ID options must be an object");
  }
}

function assertHeaderName(value: unknown): asserts value is string {
  if (typeof value !== "string" || !HTTP_TOKEN.test(value)) {
    throw new TypeError(
      "Gelis request ID headerName must be a non-empty HTTP field-name token",
    );
  }
}

function assertMaxLength(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new TypeError(
      "Gelis request ID maxLength must be a positive finite safe integer",
    );
  }
}

function assertResolvedRequestId(
  value: unknown,
  maxLength: number,
  source: "generated",
): asserts value is string {
  if (!isSafeRequestId(value, maxLength)) {
    throw new TypeError(
      `Gelis request ID ${source} value must be a non-empty legal HTTP header value within maxLength`,
    );
  }
}

function isSafeRequestId(value: unknown, maxLength: number): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxLength
  ) {
    return false;
  }

  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) {
      return false;
    }
  }

  try {
    const headers = new Headers();
    headers.set("X-Gelis-Request-Id-Validation", value);
    return headers.get("X-Gelis-Request-Id-Validation") === value;
  } catch {
    return false;
  }
}
