import type { RouteOptions } from "../route";

import type { StandardSchemaV1 } from "../schema";

export const RUNTIME_INPUT_QUERY = 1;

export const RUNTIME_INPUT_BODY = 2;

export const RUNTIME_INPUT_QUERY_BODY =
  RUNTIME_INPUT_QUERY | RUNTIME_INPUT_BODY;

export type RuntimeInputTarget = "query" | "body";

export type RuntimeBodyReader = (
  request: Request,
) => Response | Promise<unknown>;

export interface RuntimeInputPlan {
  readonly kind: number;

  readonly query: StandardSchemaV1 | undefined;

  readonly body: StandardSchemaV1 | undefined;

  readonly readBody?: RuntimeBodyReader;
}

type RuntimeContentTypeMatcher = (request: Request) => boolean;

const MEDIA_TYPE_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

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

function compileContentTypeMatcher(
  contentTypes: readonly string[],
): RuntimeContentTypeMatcher {
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

    return (request) => requestContentTypeEssence(request) === first;
  }

  if (essences.length === 2) {
    const first = essences[0]!;
    const second = essences[1]!;

    return (request) => {
      const actual = requestContentTypeEssence(request);

      return actual === first || actual === second;
    };
  }

  if (essences.length === 3) {
    const first = essences[0]!;
    const second = essences[1]!;
    const third = essences[2]!;

    return (request) => {
      const actual = requestContentTypeEssence(request);

      return actual === first || actual === second || actual === third;
    };
  }

  const accepted = new Set(essences);

  return (request) => {
    const actual = requestContentTypeEssence(request);

    return actual !== undefined && accepted.has(actual);
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

  if (body === undefined) {
    if (bodyParser !== undefined || bodyContentTypes !== undefined) {
      throw new TypeError("Gelis body parser metadata requires a body schema");
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

  if (parser !== "json") {
    throw new TypeError(
      "Gelis non-JSON request body parsers require P9-E3 runtime support",
    );
  }

  const readBody =
    bodyContentTypes === undefined
      ? readDefaultJsonBody
      : compileJsonBodyReader(bodyContentTypes);

  if (query === undefined) {
    return {
      kind: RUNTIME_INPUT_BODY,
      query: undefined,
      body,
      readBody,
    };
  }

  return {
    kind: RUNTIME_INPUT_QUERY_BODY,
    query,
    body,
    readBody,
  };
}

function readDefaultJsonBody(request: Request): Response | Promise<unknown> {
  if (!isJsonContentType(request)) {
    return unsupportedMediaTypeResponse();
  }

  return request.json().catch(() => malformedJsonResponse());
}

function compileJsonBodyReader(
  contentTypes: readonly string[],
): RuntimeBodyReader {
  const matchesContentType = compileContentTypeMatcher(contentTypes);

  return (request) => {
    if (!matchesContentType(request)) {
      return unsupportedMediaTypeResponse();
    }

    return request.json().catch(() => malformedJsonResponse());
  };
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

  if (hasCombinedContentType(contentType)) {
    return false;
  }

  if (contentType.length === 16 && contentType === "application/json") {
    return true;
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
