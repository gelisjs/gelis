import type { RuntimeReply } from "./types";

const replyResultBrand = Symbol("gelis.reply.result");

const TEXT_HEADERS = {
  "content-type": "text/plain; charset=utf-8",
};

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

  if (value === undefined) {
    return new Response(null, {
      status: 204,
    });
  }

  if (typeof value === "string") {
    return new Response(value, {
      headers: TEXT_HEADERS,
    });
  }

  if (isReplyResult(value)) {
    return normalizeReplyResult(value);
  }

  return Response.json(value);
}

function normalizeReplyResult(result: RuntimeReplyResult): Response {
  const { status, body } = result;

  if (isBodylessStatus(status)) {
    return new Response(null, {
      status,
    });
  }

  if (body === undefined) {
    return new Response(null, {
      status,
    });
  }

  if (body instanceof Response) {
    return new Response(body.body, {
      status,

      headers: body.headers,
    });
  }

  if (typeof body === "string") {
    return new Response(body, {
      status,

      headers: TEXT_HEADERS,
    });
  }

  return Response.json(body, {
    status,
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
