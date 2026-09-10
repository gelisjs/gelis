export interface RuntimeLimitedBodyReadSuccess {
  readonly ok: true;
  readonly bytes: Uint8Array;
}

export interface RuntimeLimitedBodyReadExceeded {
  readonly ok: false;
}

export type RuntimeLimitedBodyReadResult =
  RuntimeLimitedBodyReadSuccess | RuntimeLimitedBodyReadExceeded;

export type RuntimeLimitedBodyReader = (
  request: Request,
) => Promise<RuntimeLimitedBodyReadResult>;

export type RuntimeBodyLimitExceededHandler = (
  request: Request,
  maxBytes: number,
) => Response | PromiseLike<Response>;

export interface RuntimeApplicationBodyLimitPolicy {
  readonly maxBytes: number;
  readonly onExceeded?: RuntimeBodyLimitExceededHandler;
}

type RuntimePromisePeek = {
  <T>(promise: Promise<T>): T | Promise<T>;
  status(promise: Promise<unknown>): string;
};

type RuntimeLimitedBodyReadMaybePromise =
  RuntimeLimitedBodyReadResult | Promise<RuntimeLimitedBodyReadResult>;

const BODY_LIMIT_EXCEEDED: RuntimeLimitedBodyReadExceeded = {
  ok: false,
};

const EMPTY_BODY = new Uint8Array(0);

export function assertBodyLimitMaxBytes(maxBytes: number): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new TypeError(
      "Gelis body limit maxBytes must be a finite safe non-negative integer",
    );
  }
}

export function compileRuntimeLimitedBodyReader(
  maxBytes: number,
): RuntimeLimitedBodyReader {
  assertBodyLimitMaxBytes(maxBytes);

  const maxBytesText = String(maxBytes);
  const promisePeek = resolveRuntimePromisePeek();

  return function readRequest(request) {
    return readLimitedBody(request, maxBytes, maxBytesText, promisePeek);
  };
}

export function bodyTooLargeResponse(): Response {
  return Response.json(
    {
      error: {
        code: "BODY_TOO_LARGE",
        message: "Request body exceeds the configured limit",
      },
    },
    {
      status: 413,
    },
  );
}

function readLimitedBody(
  request: Request,
  maxBytes: number,
  maxBytesText: string,
  promisePeek: RuntimePromisePeek | undefined,
): Promise<RuntimeLimitedBodyReadResult> {
  const contentLength = request.headers.get("content-length");

  if (
    contentLength !== null &&
    contentLengthExceedsLimit(contentLength, maxBytesText)
  ) {
    return Promise.resolve(BODY_LIMIT_EXCEEDED);
  }

  const body = request.body;

  if (body === null) {
    return Promise.resolve({
      ok: true,
      bytes: EMPTY_BODY,
    });
  }

  const reader = body.getReader();

  return promisePeek === undefined
    ? readLimitedBodyStandard(reader, maxBytes)
    : readLimitedBodyPeek(reader, maxBytes, promisePeek);
}

async function readLimitedBodyStandard(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  maxBytes: number,
): Promise<RuntimeLimitedBodyReadResult> {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const result = await reader.read();

      if (result.done) {
        break;
      }

      const chunk = result.value;

      if (chunk.byteLength > maxBytes - totalBytes) {
        cancelReaderAfterOverflow(reader);
        return BODY_LIMIT_EXCEEDED;
      }

      totalBytes += chunk.byteLength;
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  return {
    ok: true,
    bytes: concatenateChunks(chunks, totalBytes),
  };
}

function readLimitedBodyPeek(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  maxBytes: number,
  promisePeek: RuntimePromisePeek,
): Promise<RuntimeLimitedBodyReadResult> {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  const consume = (
    result: ReadableStreamReadResult<Uint8Array>,
  ): RuntimeLimitedBodyReadResult | undefined => {
    if (result.done) {
      return {
        ok: true,
        bytes: concatenateChunks(chunks, totalBytes),
      };
    }

    const chunk = result.value;

    if (chunk.byteLength > maxBytes - totalBytes) {
      cancelReaderAfterOverflow(reader);
      return BODY_LIMIT_EXCEEDED;
    }

    totalBytes += chunk.byteLength;
    chunks.push(chunk);
    return undefined;
  };

  const next = (): RuntimeLimitedBodyReadMaybePromise => {
    while (true) {
      const pending = reader.read();

      if (promisePeek.status(pending) === "fulfilled") {
        const peeked = promisePeek(pending);
        const result = peeked as ReadableStreamReadResult<Uint8Array>;
        const consumed = consume(result);

        if (consumed !== undefined) {
          return consumed;
        }

        continue;
      }

      return pending.then((result) => consume(result) ?? next());
    }
  };

  try {
    const result = next();

    if (result instanceof Promise) {
      return result.finally(() => reader.releaseLock());
    }

    reader.releaseLock();
    return Promise.resolve(result);
  } catch (error) {
    reader.releaseLock();
    return Promise.reject(error);
  }
}

function cancelReaderAfterOverflow(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): void {
  try {
    void reader.cancel().catch(() => undefined);
  } catch {
    // A confirmed overflow remains authoritative even if cancellation fails.
  }
}

function resolveRuntimePromisePeek(): RuntimePromisePeek | undefined {
  const runtime = globalThis as {
    Bun?: {
      peek?: RuntimePromisePeek;
    };
  };

  const peek = runtime.Bun?.peek;

  return typeof peek === "function" && typeof peek.status === "function"
    ? peek
    : undefined;
}

function concatenateChunks(
  chunks: readonly Uint8Array[],
  totalBytes: number,
): Uint8Array {
  if (chunks.length === 0) {
    return EMPTY_BODY;
  }

  if (chunks.length === 1) {
    return chunks[0]!;
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

function contentLengthExceedsLimit(
  contentLength: string,
  maxBytesText: string,
): boolean {
  const value = contentLength.trim();

  if (value.length === 0) {
    return false;
  }

  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);

    if (code < 48 || code > 57) {
      return false;
    }
  }

  let significantStart = 0;

  while (
    significantStart < value.length - 1 &&
    value.charCodeAt(significantStart) === 48
  ) {
    significantStart++;
  }

  const significantLength = value.length - significantStart;

  if (significantLength !== maxBytesText.length) {
    return significantLength > maxBytesText.length;
  }

  for (let index = 0; index < significantLength; index++) {
    const contentLengthCode = value.charCodeAt(significantStart + index);
    const maxBytesCode = maxBytesText.charCodeAt(index);

    if (contentLengthCode !== maxBytesCode) {
      return contentLengthCode > maxBytesCode;
    }
  }

  return false;
}
