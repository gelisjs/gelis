import type { RequestBodyParser, RouteOptions } from "../route";

import type { StandardSchemaV1 } from "../schema";

import {
  bodyTooLargeResponse,
  compileRuntimeLimitedBodyReader,
  type RuntimeLimitedBodyReader,
} from "./body-limit";

import { normalizeMultipartFormData, readMultipartBody } from "./multipart";

export const RUNTIME_INPUT_QUERY = 1;

export const RUNTIME_INPUT_BODY = 2;

export const RUNTIME_INPUT_QUERY_BODY =
  RUNTIME_INPUT_QUERY | RUNTIME_INPUT_BODY;

export type RuntimeInputTarget = "query" | "body";

export type RuntimeBodyReader = (
  request: Request,
) => Response | Promise<unknown>;

export type RuntimeBodyReadError = (error: unknown) => Response;

export interface RuntimeInputPlan {
  readonly kind: number;

  readonly query: StandardSchemaV1 | undefined;

  readonly body: StandardSchemaV1 | undefined;

  readonly readBody?: RuntimeBodyReader;

  readonly readBodyError?: RuntimeBodyReadError;

  /*
   * Declarative body metadata retained for contract/tooling
   * projection. Request execution uses readBody directly.
   */
  readonly bodyParser?: RequestBodyParser;

  /*
   * Undefined means the parser's built-in default media types.
   *
   * Explicit values are normalized/deduplicated registration-time
   * media-type essences.
   */
  readonly bodyContentTypes?: readonly string[];

  /*
   * Route-local body limit retained only when explicitly configured.
   * Request execution uses the already-specialized readBody function.
   */
  readonly bodyLimit?: number;
}

type RuntimeContentTypeMatcher = (request: Request) => boolean;

type RuntimeLimitedBodyParser = (
  bytes: Uint8Array,
  request: Request,
) => unknown | Promise<unknown>;

interface CompiledContentTypes {
  readonly contentTypes: readonly string[];

  readonly matches: RuntimeContentTypeMatcher;
}

const MEDIA_TYPE_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

const BODY_LIMIT_EXCEEDED_ERROR = Symbol("GelisBodyLimitExceeded");

const bodyTextDecoder = new TextDecoder();

function normalizeDeclaredMediaType(value: string): string {
  const separator = value.indexOf(";");

  const essence = (separator === -1 ? value : value.slice(0, separator)).trim();

  const slash = essence.indexOf("/");

  if (
    slash <= 0 ||
    slash !== essence.lastIndexOf("/") ||
    slash === essence.length - 1
  ) {
    throw invalidDeclaredMediaType(value);
  }

  const type = essence.slice(0, slash);

  const subtype = essence.slice(slash + 1);

  if (
    type === "*" ||
    subtype === "*" ||
    !MEDIA_TYPE_TOKEN.test(type) ||
    !MEDIA_TYPE_TOKEN.test(subtype)
  ) {
    throw invalidDeclaredMediaType(value);
  }

  return `${type.toLowerCase()}/${subtype.toLowerCase()}`;
}

function invalidDeclaredMediaType(value: string): TypeError {
  return new TypeError(`Invalid Gelis request body media type: ${value}`);
}

function compileContentTypes(
  contentTypes: readonly string[],
): CompiledContentTypes {
  if (contentTypes.length === 0) {
    throw new TypeError(
      "Gelis bodyContentTypes must contain at least one media type",
    );
  }

  const essences: string[] = [];

  const seen = new Set<string>();

  for (const contentType of contentTypes) {
    const essence = normalizeDeclaredMediaType(contentType);

    if (!seen.has(essence)) {
      seen.add(essence);
      essences.push(essence);
    }
  }

  if (essences.length === 1) {
    const first = essences[0]!;

    return {
      contentTypes: essences,

      matches: (request) => requestContentTypeEssence(request) === first,
    };
  }

  if (essences.length === 2) {
    const first = essences[0]!;
    const second = essences[1]!;

    return {
      contentTypes: essences,

      matches: (request) => {
        const actual = requestContentTypeEssence(request);

        return actual === first || actual === second;
      },
    };
  }

  if (essences.length === 3) {
    const first = essences[0]!;
    const second = essences[1]!;
    const third = essences[2]!;

    return {
      contentTypes: essences,

      matches: (request) => {
        const actual = requestContentTypeEssence(request);

        return actual === first || actual === second || actual === third;
      },
    };
  }

  const accepted = new Set(essences);

  return {
    contentTypes: essences,

    matches: (request) => {
      const actual = requestContentTypeEssence(request);

      return actual !== undefined && accepted.has(actual);
    },
  };
}

function requestContentTypeEssence(request: Request): string | undefined {
  const contentType = request.headers.get("content-type");

  if (contentType === null) {
    return undefined;
  }

  if (hasCombinedContentType(contentType)) {
    return undefined;
  }

  const separator = contentType.indexOf(";");

  const essence = (
    separator === -1 ? contentType : contentType.slice(0, separator)
  )
    .trim()
    .toLowerCase();

  if (essence.length === 0) {
    return undefined;
  }

  return essence;
}

export function createRuntimeInputPlan(
  options: RouteOptions | undefined,
): RuntimeInputPlan | undefined {
  const query = options?.query;

  const body = options?.body;

  const bodyParser = options?.bodyParser;

  const bodyContentTypes = options?.bodyContentTypes;

  const bodyLimit = options?.bodyLimit;

  if (body === undefined) {
    if (bodyParser !== undefined || bodyContentTypes !== undefined) {
      throw new TypeError("Gelis body parser metadata requires a body schema");
    }

    if (bodyLimit !== undefined) {
      throw new TypeError("Gelis bodyLimit requires a body schema");
    }

    if (query === undefined) {
      return undefined;
    }

    return {
      kind: RUNTIME_INPUT_QUERY,
      query,
      body: undefined,
    };
  }

  const parser = bodyParser ?? "json";

  const compiledContentTypes =
    bodyContentTypes === undefined
      ? undefined
      : compileContentTypes(bodyContentTypes);

  const limitedBodyReader =
    bodyLimit === undefined
      ? undefined
      : compileRuntimeLimitedBodyReader(bodyLimit);

  let readBody: RuntimeBodyReader;
  let readBodyError: RuntimeBodyReadError;

  if (parser === "json") {
    if (limitedBodyReader === undefined) {
      readBody =
        compiledContentTypes === undefined
          ? readDefaultJsonBody
          : compileJsonBodyReader(compiledContentTypes.matches);

      readBodyError = handleMalformedJsonBody;
    } else {
      readBody = compileLimitedManagedBodyReader(
        compiledContentTypes === undefined
          ? isJsonContentType
          : compiledContentTypes.matches,
        limitedBodyReader,
        parseLimitedJsonBody,
      );

      readBodyError = compileLimitedBodyReadError(handleMalformedJsonBody);
    }
  } else if (parser === "text") {
    if (limitedBodyReader === undefined) {
      readBody =
        compiledContentTypes === undefined
          ? readDefaultTextBody
          : compileTextBodyReader(compiledContentTypes.matches);

      readBodyError = handleMalformedTextBody;
    } else {
      readBody = compileLimitedManagedBodyReader(
        compiledContentTypes === undefined
          ? isTextContentType
          : compiledContentTypes.matches,
        limitedBodyReader,
        parseLimitedTextBody,
      );

      readBodyError = compileLimitedBodyReadError(handleMalformedTextBody);
    }
  } else if (parser === "arrayBuffer") {
    if (limitedBodyReader === undefined) {
      readBody =
        compiledContentTypes === undefined
          ? readDefaultArrayBufferBody
          : compileArrayBufferBodyReader(compiledContentTypes.matches);

      readBodyError = handleMalformedArrayBufferBody;
    } else {
      readBody = compileLimitedManagedBodyReader(
        compiledContentTypes === undefined
          ? isArrayBufferContentType
          : compiledContentTypes.matches,
        limitedBodyReader,
        parseLimitedArrayBufferBody,
      );

      readBodyError = compileLimitedBodyReadError(
        handleMalformedArrayBufferBody,
      );
    }
  } else if (parser === "urlencoded") {
    if (limitedBodyReader === undefined) {
      readBody =
        compiledContentTypes === undefined
          ? readDefaultUrlEncodedBody
          : compileUrlEncodedBodyReader(compiledContentTypes.matches);

      readBodyError = handleMalformedUrlEncodedBody;
    } else {
      readBody = compileLimitedManagedBodyReader(
        compiledContentTypes === undefined
          ? isUrlEncodedContentType
          : compiledContentTypes.matches,
        limitedBodyReader,
        parseLimitedUrlEncodedBody,
      );

      readBodyError = compileLimitedBodyReadError(
        handleMalformedUrlEncodedBody,
      );
    }
  } else if (parser === "multipart") {
    if (limitedBodyReader === undefined) {
      readBody =
        compiledContentTypes === undefined
          ? readDefaultMultipartBody
          : compileMultipartBodyReader(compiledContentTypes.matches);

      readBodyError = handleMalformedMultipartBody;
    } else {
      readBody = compileLimitedManagedBodyReader(
        compiledContentTypes === undefined
          ? isMultipartContentType
          : compiledContentTypes.matches,
        limitedBodyReader,
        parseLimitedMultipartBody,
      );

      readBodyError = compileLimitedBodyReadError(handleMalformedMultipartBody);
    }
  } else {
    const unsupportedParser: never = parser;

    throw new TypeError(
      `Unsupported Gelis request body parser: ${unsupportedParser}`,
    );
  }

  if (query === undefined) {
    return {
      kind: RUNTIME_INPUT_BODY,
      query: undefined,
      body,
      readBody,
      readBodyError,
      bodyParser: parser,

      ...(compiledContentTypes === undefined
        ? {}
        : {
            bodyContentTypes: compiledContentTypes.contentTypes,
          }),

      ...(bodyLimit === undefined
        ? {}
        : {
            bodyLimit,
          }),
    };
  }

  return {
    kind: RUNTIME_INPUT_QUERY_BODY,
    query,
    body,
    readBody,
    readBodyError,
    bodyParser: parser,

    ...(compiledContentTypes === undefined
      ? {}
      : {
          bodyContentTypes: compiledContentTypes.contentTypes,
        }),

    ...(bodyLimit === undefined
      ? {}
      : {
          bodyLimit,
        }),
  };
}

function compileLimitedManagedBodyReader(
  matchesContentType: RuntimeContentTypeMatcher,
  readLimitedBody: RuntimeLimitedBodyReader,
  parseBody: RuntimeLimitedBodyParser,
): RuntimeBodyReader {
  return (request) => {
    if (!matchesContentType(request)) {
      return unsupportedMediaTypeResponse();
    }

    return readLimitedBody(request).then((result) => {
      if (!result.ok) {
        throw BODY_LIMIT_EXCEEDED_ERROR;
      }

      return parseBody(result.bytes, request);
    });
  };
}

function compileLimitedBodyReadError(
  fallback: RuntimeBodyReadError,
): RuntimeBodyReadError {
  return (error) =>
    error === BODY_LIMIT_EXCEEDED_ERROR
      ? bodyTooLargeResponse()
      : fallback(error);
}

function parseLimitedJsonBody(bytes: Uint8Array): unknown {
  return JSON.parse(bodyTextDecoder.decode(bytes)) as unknown;
}

function parseLimitedTextBody(bytes: Uint8Array): string {
  return bodyTextDecoder.decode(bytes);
}

function parseLimitedArrayBufferBody(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function parseLimitedUrlEncodedBody(
  bytes: Uint8Array,
): Record<string, string | string[]> {
  return parseUrlEncodedBody(bodyTextDecoder.decode(bytes));
}

function parseLimitedMultipartBody(
  bytes: Uint8Array,
  request: Request,
): Promise<unknown> {
  const contentType = request.headers.get("content-type");

  if (contentType === null) {
    throw new TypeError("Multipart request body content type is required");
  }

  const parserContentType = multipartParserContentType(contentType);

  return new Response(Uint8Array.from(bytes), {
    headers: {
      "content-type": parserContentType,
    },
  })
    .formData()
    .then((formData) => normalizeMultipartFormData(formData));
}

function readDefaultJsonBody(request: Request): Response | Promise<unknown> {
  if (!isJsonContentType(request)) {
    return unsupportedMediaTypeResponse();
  }

  /*
   * Do not normalize rejection here.
   *
   * runBodyRoute attaches the compiled error handler
   * as the rejection branch of the same Promise
   * continuation that performs validation.
   */
  return request.json();
}

function handleMalformedJsonBody(_error: unknown): Response {
  return malformedJsonResponse();
}

function compileJsonBodyReader(
  matchesContentType: RuntimeContentTypeMatcher,
): RuntimeBodyReader {
  return (request) => {
    if (!matchesContentType(request)) {
      return unsupportedMediaTypeResponse();
    }

    return request.json();
  };
}

function readDefaultTextBody(request: Request): Response | Promise<unknown> {
  if (!isTextContentType(request)) {
    return unsupportedMediaTypeResponse();
  }

  return request.text();
}

function handleMalformedTextBody(_error: unknown): Response {
  return malformedBodyResponse();
}

function compileTextBodyReader(
  matchesContentType: RuntimeContentTypeMatcher,
): RuntimeBodyReader {
  return (request) => {
    if (!matchesContentType(request)) {
      return unsupportedMediaTypeResponse();
    }

    return request.text();
  };
}

function readDefaultArrayBufferBody(
  request: Request,
): Response | Promise<unknown> {
  if (!isArrayBufferContentType(request)) {
    return unsupportedMediaTypeResponse();
  }

  return request.arrayBuffer();
}

function handleMalformedArrayBufferBody(_error: unknown): Response {
  return malformedBodyResponse();
}

function compileArrayBufferBodyReader(
  matchesContentType: RuntimeContentTypeMatcher,
): RuntimeBodyReader {
  return (request) => {
    if (!matchesContentType(request)) {
      return unsupportedMediaTypeResponse();
    }

    return request.arrayBuffer();
  };
}

function readDefaultUrlEncodedBody(
  request: Request,
): Response | Promise<unknown> {
  if (!isUrlEncodedContentType(request)) {
    return unsupportedMediaTypeResponse();
  }

  return request.text().then(parseUrlEncodedBody);
}

function handleMalformedUrlEncodedBody(_error: unknown): Response {
  return malformedBodyResponse();
}

function compileUrlEncodedBodyReader(
  matchesContentType: RuntimeContentTypeMatcher,
): RuntimeBodyReader {
  return (request) => {
    if (!matchesContentType(request)) {
      return unsupportedMediaTypeResponse();
    }

    return request.text().then(parseUrlEncodedBody);
  };
}

function parseUrlEncodedBody(value: string): Record<string, string | string[]> {
  const result = Object.create(null) as Record<string, string | string[]>;
  const entries = new URLSearchParams(value);

  entries.forEach((entryValue, key) => {
    const existing = result[key];

    if (existing === undefined) {
      result[key] = entryValue;
    } else if (Array.isArray(existing)) {
      existing.push(entryValue);
    } else {
      result[key] = [existing, entryValue];
    }
  });

  return result;
}

function readDefaultMultipartBody(
  request: Request,
): Response | Promise<unknown> {
  if (!isMultipartContentType(request)) {
    return unsupportedMediaTypeResponse();
  }

  const contentType = request.headers.get("content-type");

  if (contentType === null) {
    return unsupportedMediaTypeResponse();
  }

  return readMultipartBody(request, multipartParserContentType(contentType));
}

function handleMalformedMultipartBody(_error: unknown): Response {
  return malformedBodyResponse();
}

function compileMultipartBodyReader(
  matchesContentType: RuntimeContentTypeMatcher,
): RuntimeBodyReader {
  return (request) => {
    if (!matchesContentType(request)) {
      return unsupportedMediaTypeResponse();
    }

    const contentType = request.headers.get("content-type");

    if (contentType === null) {
      return unsupportedMediaTypeResponse();
    }

    return readMultipartBody(request, multipartParserContentType(contentType));
  };
}

function multipartParserContentType(contentType: string): string {
  const separator = contentType.indexOf(";");

  return separator === -1
    ? "multipart/form-data"
    : `multipart/form-data${contentType.slice(separator)}`;
}

export function parseQueryFromUrl(
  url: string,
): Record<string, string | string[]> {
  const result = Object.create(null) as Record<string, string | string[]>;

  const queryStart = url.indexOf("?");

  if (queryStart === -1) {
    return result;
  }

  const hashStart = url.indexOf("#", queryStart + 1);

  const queryEnd = hashStart === -1 ? url.length : hashStart;

  let pairStart = queryStart + 1;

  if (pairStart >= queryEnd) {
    return result;
  }

  let equals = -1;

  let keyHasPlus = false;
  let keyHasPercent = false;

  let valueHasPlus = false;
  let valueHasPercent = false;

  for (let index = pairStart; index <= queryEnd; index++) {
    const atEnd = index === queryEnd;

    if (!atEnd) {
      const code = url.charCodeAt(index);

      if (code === 61 && equals === -1) {
        equals = index;
        continue;
      }

      if (code === 43) {
        if (equals === -1) {
          keyHasPlus = true;
        } else {
          valueHasPlus = true;
        }

        continue;
      }

      if (code === 37) {
        if (equals === -1) {
          keyHasPercent = true;
        } else {
          valueHasPercent = true;
        }

        continue;
      }

      if (code !== 38) {
        continue;
      }
    }

    const pairEnd = index;

    if (pairEnd > pairStart) {
      const actualEquals = equals === -1 ? pairEnd : equals;

      const valueStart = actualEquals < pairEnd ? actualEquals + 1 : pairEnd;

      let key = url.slice(pairStart, actualEquals);

      if (keyHasPlus || keyHasPercent) {
        key = decodeKnownQueryComponent(key, keyHasPlus, keyHasPercent);
      }

      let value = actualEquals < pairEnd ? url.slice(valueStart, pairEnd) : "";

      if (valueHasPlus || valueHasPercent) {
        value = decodeKnownQueryComponent(value, valueHasPlus, valueHasPercent);
      }

      const existing = result[key];

      if (existing === undefined) {
        result[key] = value;
      } else if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        result[key] = [existing, value];
      }
    }

    pairStart = pairEnd + 1;

    equals = -1;

    keyHasPlus = false;
    keyHasPercent = false;

    valueHasPlus = false;
    valueHasPercent = false;
  }

  return result;
}

function hasCombinedContentType(value: string): boolean {
  let quoted = false;
  let escaped = false;

  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);

    if (escaped) {
      escaped = false;
      continue;
    }

    if (quoted && code === 92) {
      escaped = true;
      continue;
    }

    if (code === 34) {
      quoted = !quoted;
      continue;
    }

    if (!quoted && code === 44) {
      return true;
    }
  }

  return false;
}

export function isJsonContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type");

  if (contentType === null) {
    return false;
  }

  /*
   * The canonical JSON media type cannot contain
   * a combined field value. Preserve the critical
   * exact-match fast path before the slower singleton
   * ambiguity scan.
   */
  if (contentType.length === 16 && contentType === "application/json") {
    return true;
  }

  if (hasCombinedContentType(contentType)) {
    return false;
  }

  const separator = contentType.indexOf(";");

  const mediaType = (
    separator === -1 ? contentType : contentType.slice(0, separator)
  )
    .trim()
    .toLowerCase();

  return (
    mediaType === "application/json" ||
    (mediaType.startsWith("application/") && mediaType.endsWith("+json"))
  );
}

function isTextContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type");

  if (contentType === null) {
    return false;
  }

  if (contentType.length === 10 && contentType === "text/plain") {
    return true;
  }

  if (hasCombinedContentType(contentType)) {
    return false;
  }

  const separator = contentType.indexOf(";");

  const mediaType = (
    separator === -1 ? contentType : contentType.slice(0, separator)
  )
    .trim()
    .toLowerCase();

  return mediaType === "text/plain";
}

function isArrayBufferContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type");

  if (contentType === null) {
    return false;
  }

  if (contentType.length === 24 && contentType === "application/octet-stream") {
    return true;
  }

  if (hasCombinedContentType(contentType)) {
    return false;
  }

  const separator = contentType.indexOf(";");

  const mediaType = (
    separator === -1 ? contentType : contentType.slice(0, separator)
  )
    .trim()
    .toLowerCase();

  return mediaType === "application/octet-stream";
}

function isUrlEncodedContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type");

  if (contentType === null) {
    return false;
  }

  if (
    contentType.length === 33 &&
    contentType === "application/x-www-form-urlencoded"
  ) {
    return true;
  }

  if (hasCombinedContentType(contentType)) {
    return false;
  }

  const separator = contentType.indexOf(";");

  const mediaType = (
    separator === -1 ? contentType : contentType.slice(0, separator)
  )
    .trim()
    .toLowerCase();

  return mediaType === "application/x-www-form-urlencoded";
}

function isMultipartContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type");

  if (contentType === null) {
    return false;
  }

  if (contentType.length === 19 && contentType === "multipart/form-data") {
    return true;
  }

  if (hasCombinedContentType(contentType)) {
    return false;
  }

  const separator = contentType.indexOf(";");

  const mediaType = (
    separator === -1 ? contentType : contentType.slice(0, separator)
  )
    .trim()
    .toLowerCase();

  return mediaType === "multipart/form-data";
}

export function validationErrorResponse(
  target: RuntimeInputTarget,

  issues: ReadonlyArray<StandardSchemaV1.Issue>,
): Response {
  return Response.json(
    {
      error: {
        code: "VALIDATION_ERROR",

        target,

        issues: issues.map(serializeIssue),
      },
    },

    {
      status: 422,
    },
  );
}

export function malformedJsonResponse(): Response {
  return Response.json(
    {
      error: {
        code: "MALFORMED_JSON",

        message: "Malformed JSON request body",
      },
    },

    {
      status: 400,
    },
  );
}

function malformedBodyResponse(): Response {
  return Response.json(
    {
      error: {
        code: "MALFORMED_BODY",

        message: "Malformed request body",
      },
    },

    {
      status: 400,
    },
  );
}

export function unsupportedMediaTypeResponse(): Response {
  return Response.json(
    {
      error: {
        code: "UNSUPPORTED_MEDIA_TYPE",

        message: "Unsupported request body media type",
      },
    },

    {
      status: 415,
    },
  );
}

export function invalidQueryEncodingResponse(): Response {
  return Response.json(
    {
      error: {
        code: "INVALID_QUERY_ENCODING",

        message: "Malformed URL query encoding",
      },
    },

    {
      status: 400,
    },
  );
}

function decodeKnownQueryComponent(
  value: string,
  hasPlus: boolean,
  hasPercent: boolean,
): string {
  if (hasPlus) {
    value = value.replace(/\+/g, " ");
  }

  if (hasPercent) {
    value = decodeURIComponent(value);
  }

  return value;
}

function serializeIssue(issue: StandardSchemaV1.Issue): {
  readonly message: string;

  readonly path?: readonly (string | number)[];
} {
  if (!issue.path) {
    return {
      message: issue.message,
    };
  }

  return {
    message: issue.message,

    path: issue.path.map((segment) => {
      const key =
        typeof segment === "object" && segment !== null ? segment.key : segment;

      return typeof key === "symbol" ? String(key) : key;
    }),
  };
}
