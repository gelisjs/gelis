import type { RouteOptions } from "../route";

import type { StandardSchemaV1 } from "../schema";

export const RUNTIME_INPUT_QUERY = 1;

export const RUNTIME_INPUT_BODY = 2;

export const RUNTIME_INPUT_QUERY_BODY =
  RUNTIME_INPUT_QUERY | RUNTIME_INPUT_BODY;

export type RuntimeInputTarget = "query" | "body";

export interface RuntimeInputPlan {
  readonly kind: number;

  readonly query: StandardSchemaV1 | undefined;

  readonly body: StandardSchemaV1 | undefined;
}

export function createRuntimeInputPlan(
  options: RouteOptions | undefined,
): RuntimeInputPlan | undefined {
  const query = options?.query;

  const body = options?.body;

  if (query === undefined && body === undefined) {
    return undefined;
  }

  let kind = 0;

  if (query !== undefined) {
    kind |= RUNTIME_INPUT_QUERY;
  }

  if (body !== undefined) {
    kind |= RUNTIME_INPUT_BODY;
  }

  return {
    kind,
    query,
    body,
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

  while (pairStart < queryEnd) {
    let pairEnd = url.indexOf("&", pairStart);

    if (pairEnd === -1 || pairEnd > queryEnd) {
      pairEnd = queryEnd;
    }

    if (pairEnd > pairStart) {
      let equals = url.indexOf("=", pairStart);

      if (equals === -1 || equals > pairEnd) {
        equals = pairEnd;
      }

      const rawKey = url.slice(pairStart, equals);

      const rawValue = equals < pairEnd ? url.slice(equals + 1, pairEnd) : "";

      const key = decodeQueryComponent(rawKey);

      const value = decodeQueryComponent(rawValue);

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
  }

  return result;
}

export function isJsonContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type");

  if (!contentType) {
    return false;
  }

  const separator = contentType.indexOf(";");

  const mediaType = (
    separator === -1 ? contentType : contentType.slice(0, separator)
  )
    .trim()
    .toLowerCase();

  if (mediaType === "application/json") {
    return true;
  }

  return mediaType.startsWith("application/") && mediaType.endsWith("+json");
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

        message: "Expected application/json request body",
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

function decodeQueryComponent(value: string): string {
  let decoded = value;

  if (decoded.includes("+")) {
    decoded = decoded.replace(/\+/g, " ");
  }

  if (decoded.includes("%")) {
    decoded = decodeURIComponent(decoded);
  }

  return decoded;
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
