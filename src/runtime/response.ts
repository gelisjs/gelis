import type { RuntimeReply } from "./types";

const replyResultBrand = Symbol("gelis.reply.result");

interface RuntimeReplyResult {
  readonly [replyResultBrand]: true;

  readonly status: number;

  readonly body: unknown;
}

export const runtimeReply: RuntimeReply = {
  status(status, body): RuntimeReplyResult {
    return {
      [replyResultBrand]: true,

      status,
      body,
    };
  },
};

export function normalizeResponse(value: unknown): Response {
  if (value instanceof Response) {
    return value;
  }

  if (isReplyResult(value)) {
    return normalizeBody(value.body, value.status);
  }

  return normalizeBody(value, undefined);
}

function normalizeBody(value: unknown, status: number | undefined): Response {
  const responseStatus = status ?? 200;

  if (isBodylessStatus(responseStatus)) {
    return new Response(null, {
      status: responseStatus,
    });
  }

  if (value === undefined) {
    return new Response(null, {
      status: status ?? 204,
    });
  }

  if (value instanceof Response) {
    if (status === undefined) {
      return value;
    }

    return new Response(value.body, {
      status,
      headers: value.headers,
    });
  }

  if (typeof value === "string") {
    return new Response(value, {
      status: responseStatus,

      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }

  return Response.json(value, {
    status: responseStatus,
  });
}

function isReplyResult(value: unknown): value is RuntimeReplyResult {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as RuntimeReplyResult)[replyResultBrand] === true
  );
}

function isBodylessStatus(status: number): boolean {
  return status === 204 || status === 205 || status === 304;
}
