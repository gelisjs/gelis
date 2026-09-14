export type RequestIdGenerator = (request: Request) => string;

export type RequestIdValidator = (value: string, request: Request) => boolean;

export interface RequestIdOptions {
  readonly header?: string;
  readonly generator?: RequestIdGenerator;
  readonly acceptIncoming?: boolean | RequestIdValidator;
  readonly maxLength?: number;
}

export interface CompiledRequestIdPolicy {
  readonly header: string;
  readonly generator: RequestIdGenerator;
  readonly acceptIncoming: boolean | RequestIdValidator;
  readonly maxLength: number;
}

export const DEFAULT_REQUEST_ID_HEADER = "X-Request-Id";
export const DEFAULT_REQUEST_ID_MAX_LENGTH = 255;

const DEFAULT_REQUEST_ID_GENERATOR: RequestIdGenerator = () =>
  crypto.randomUUID();

export function compileRequestIdPolicy(
  options?: RequestIdOptions,
): CompiledRequestIdPolicy {
  if (options !== undefined) {
    assertOptionsObject(options);
  }

  const header = options?.header ?? DEFAULT_REQUEST_ID_HEADER;
  const generator = options?.generator ?? DEFAULT_REQUEST_ID_GENERATOR;
  const acceptIncoming = options?.acceptIncoming ?? false;
  const maxLength = options?.maxLength ?? DEFAULT_REQUEST_ID_MAX_LENGTH;

  assertHeaderName(header);
  assertGenerator(generator);
  assertAcceptIncoming(acceptIncoming);
  assertMaxLength(maxLength);

  return {
    header,
    generator,
    acceptIncoming,
    maxLength,
  };
}

export function resolveRequestId(
  policy: CompiledRequestIdPolicy,
  request: Request,
): string {
  const incoming = readAdoptableIncomingId(policy, request);

  if (incoming !== undefined) {
    return incoming;
  }

  const generated = policy.generator(request);

  if (!isRequestIdValue(generated, policy.maxLength)) {
    throw new TypeError(
      `Request ID generator must return 1-${policy.maxLength} characters from [A-Za-z0-9._:-]`,
    );
  }

  return generated;
}

export function isRequestIdValue(
  value: unknown,
  maxLength: number,
): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxLength
  ) {
    return false;
  }

  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);

    if (
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      code === 46 ||
      code === 58 ||
      code === 95 ||
      code === 45
    ) {
      continue;
    }

    return false;
  }

  return true;
}

function readAdoptableIncomingId(
  policy: CompiledRequestIdPolicy,
  request: Request,
): string | undefined {
  const acceptIncoming = policy.acceptIncoming;

  if (acceptIncoming === false) {
    return undefined;
  }

  const incoming = request.headers.get(policy.header);

  if (incoming === null || !isRequestIdValue(incoming, policy.maxLength)) {
    return undefined;
  }

  if (
    typeof acceptIncoming === "function" &&
    !acceptIncoming(incoming, request)
  ) {
    return undefined;
  }

  return incoming;
}

function assertOptionsObject(options: RequestIdOptions): void {
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options)
  ) {
    throw new TypeError("Request ID options must be an object");
  }
}

function assertGenerator(generator: RequestIdGenerator): void {
  if (typeof generator !== "function") {
    throw new TypeError("Request ID generator must be a function");
  }
}

function assertAcceptIncoming(value: boolean | RequestIdValidator): void {
  if (typeof value !== "boolean" && typeof value !== "function") {
    throw new TypeError(
      "Request ID acceptIncoming must be a boolean or validator function",
    );
  }
}

function assertMaxLength(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(
      "Request ID maxLength must be a positive safe integer",
    );
  }
}

function assertHeaderName(value: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(
      "Request ID header must be a non-empty HTTP field name",
    );
  }

  for (let index = 0; index < value.length; index++) {
    if (!isHttpTokenCode(value.charCodeAt(index))) {
      throw new TypeError(`Invalid request ID header name: ${value}`);
    }
  }
}

function isHttpTokenCode(code: number): boolean {
  if (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  ) {
    return true;
  }

  switch (code) {
    case 33:
    case 35:
    case 36:
    case 37:
    case 38:
    case 39:
    case 42:
    case 43:
    case 45:
    case 46:
    case 94:
    case 95:
    case 96:
    case 124:
    case 126:
      return true;
    default:
      return false;
  }
}
