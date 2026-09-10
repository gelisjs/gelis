export type RuntimeMultipartValue = string | File | Array<string | File>;

export type RuntimeMultipartBody = Record<string, RuntimeMultipartValue>;

interface PreparedMultipartBody {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly emptyNameSentinel: string | undefined;
}

const CR = 13;
const LF = 10;
const DASH = 45;
const SEMICOLON = 59;
const EQUALS = 61;
const QUOTE = 34;
const BACKSLASH = 92;
const SPACE = 32;
const TAB = 9;
const COLON = 58;

const EMPTY_NAME_SENTINEL_BASE = "__gelis_multipart_empty_name__";
const textEncoder = new TextEncoder();

export function readMultipartBody(
  request: Request,
  parserContentType: string,
): Promise<RuntimeMultipartBody> {
  return request
    .arrayBuffer()
    .then((body) =>
      parseMultipartBody(new Uint8Array(body), parserContentType),
    );
}

export function parseMultipartBody(
  bytes: Uint8Array<ArrayBuffer>,
  parserContentType: string,
): Promise<RuntimeMultipartBody> {
  /*
   * Boundary parsing intentionally happens inside the body-consumption
   * continuation. Any malformed accepted representation therefore rejects
   * the reader Promise and is normalized by RuntimeBodyReadError to 400.
   */
  const boundary = readMultipartBoundary(parserContentType);
  const prepared = prepareMultipartBody(bytes, boundary);

  return new Response(prepared.bytes, {
    headers: {
      "content-type": parserContentType,
    },
  })
    .formData()
    .then((formData) =>
      normalizeMultipartFormData(formData, prepared.emptyNameSentinel),
    );
}

export function normalizeMultipartFormData(
  formData: FormData,
  emptyNameSentinel?: string,
): RuntimeMultipartBody {
  const result = Object.create(null) as RuntimeMultipartBody;

  formData.forEach((entryValue, rawKey) => {
    const key = rawKey === emptyNameSentinel ? "" : rawKey;
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

function readMultipartBoundary(contentType: string): string {
  let index = contentType.indexOf(";");

  if (index === -1) {
    throw new TypeError("Multipart request body boundary is required");
  }

  index++;

  while (index < contentType.length) {
    while (
      index < contentType.length &&
      (isAsciiWhitespace(contentType.charCodeAt(index)) ||
        contentType.charCodeAt(index) === SEMICOLON)
    ) {
      index++;
    }

    if (index >= contentType.length) {
      break;
    }

    const nameStart = index;

    while (
      index < contentType.length &&
      contentType.charCodeAt(index) !== EQUALS &&
      contentType.charCodeAt(index) !== SEMICOLON
    ) {
      index++;
    }

    const nameEnd = trimStringEnd(contentType, nameStart, index);

    if (
      index >= contentType.length ||
      contentType.charCodeAt(index) !== EQUALS
    ) {
      while (
        index < contentType.length &&
        contentType.charCodeAt(index) !== SEMICOLON
      ) {
        index++;
      }
      continue;
    }

    const parameterName = contentType
      .slice(nameStart, nameEnd)
      .trimStart()
      .toLowerCase();

    index++;

    while (
      index < contentType.length &&
      isAsciiWhitespace(contentType.charCodeAt(index))
    ) {
      index++;
    }

    let value: string;

    if (index < contentType.length && contentType.charCodeAt(index) === QUOTE) {
      index++;
      let decoded = "";
      let closed = false;

      while (index < contentType.length) {
        const code = contentType.charCodeAt(index++);

        if (code === QUOTE) {
          closed = true;
          break;
        }

        if (code === BACKSLASH && index < contentType.length) {
          decoded += contentType[index++]!;
        } else {
          decoded += String.fromCharCode(code);
        }
      }

      if (!closed) {
        throw new TypeError("Malformed multipart request body boundary");
      }

      value = decoded;

      while (
        index < contentType.length &&
        contentType.charCodeAt(index) !== SEMICOLON
      ) {
        if (!isAsciiWhitespace(contentType.charCodeAt(index))) {
          throw new TypeError("Malformed multipart request body boundary");
        }
        index++;
      }
    } else {
      const valueStart = index;

      while (
        index < contentType.length &&
        contentType.charCodeAt(index) !== SEMICOLON
      ) {
        index++;
      }

      value = contentType.slice(valueStart, index).trim();
    }

    if (parameterName === "boundary") {
      validateMultipartBoundary(value);
      return value;
    }
  }

  throw new TypeError("Multipart request body boundary is required");
}

function validateMultipartBoundary(value: string): void {
  if (value.length === 0 || value.length > 70) {
    throw new TypeError("Malformed multipart request body boundary");
  }

  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);

    if (code < 32 || code > 126 || code === CR || code === LF) {
      throw new TypeError("Malformed multipart request body boundary");
    }
  }
}

function prepareMultipartBody(
  bytes: Uint8Array<ArrayBuffer>,
  boundary: string,
): PreparedMultipartBody {
  const delimiter = textEncoder.encode(`--${boundary}`);
  const headerRanges = collectMultipartHeaderRanges(bytes, delimiter);
  const insertionOffsets: number[] = [];

  for (const [start, end] of headerRanges) {
    const insertion = findEmptyNameInsertion(bytes, start, end);

    if (insertion !== -1) {
      insertionOffsets.push(insertion);
    }
  }

  if (insertionOffsets.length === 0) {
    return {
      bytes,
      emptyNameSentinel: undefined,
    };
  }

  let emptyNameSentinel = EMPTY_NAME_SENTINEL_BASE;

  while (
    headerRanges.some(([start, end]) =>
      containsAscii(bytes, start, end, emptyNameSentinel),
    )
  ) {
    emptyNameSentinel += "_";
  }

  const sentinelBytes = textEncoder.encode(emptyNameSentinel);
  const rewritten = new Uint8Array(
    bytes.length + insertionOffsets.length * sentinelBytes.length,
  );

  let sourceOffset = 0;
  let targetOffset = 0;

  for (const insertionOffset of insertionOffsets) {
    rewritten.set(bytes.subarray(sourceOffset, insertionOffset), targetOffset);
    targetOffset += insertionOffset - sourceOffset;

    rewritten.set(sentinelBytes, targetOffset);
    targetOffset += sentinelBytes.length;
    sourceOffset = insertionOffset;
  }

  rewritten.set(bytes.subarray(sourceOffset), targetOffset);

  return {
    bytes: rewritten,
    emptyNameSentinel,
  };
}

function collectMultipartHeaderRanges(
  bytes: Uint8Array,
  delimiter: Uint8Array,
): Array<readonly [number, number]> {
  const ranges: Array<readonly [number, number]> = [];
  let searchFrom = 0;
  let foundClosingBoundary = false;

  while (searchFrom < bytes.length) {
    const boundaryStart = findBoundary(bytes, delimiter, searchFrom);

    if (boundaryStart === -1) {
      break;
    }

    let cursor = boundaryStart + delimiter.length;

    if (
      cursor + 1 < bytes.length &&
      bytes[cursor] === DASH &&
      bytes[cursor + 1] === DASH
    ) {
      foundClosingBoundary = true;
      break;
    }

    if (
      cursor + 1 >= bytes.length ||
      bytes[cursor] !== CR ||
      bytes[cursor + 1] !== LF
    ) {
      throw new TypeError("Malformed multipart request body");
    }

    cursor += 2;
    const headerEnd = findHeaderEnd(bytes, cursor);

    if (headerEnd === -1) {
      throw new TypeError("Malformed multipart request body");
    }

    ranges.push([cursor, headerEnd]);
    searchFrom = headerEnd + 4;
  }

  if (ranges.length === 0 || !foundClosingBoundary) {
    throw new TypeError("Malformed multipart request body");
  }

  return ranges;
}

function findBoundary(
  bytes: Uint8Array,
  delimiter: Uint8Array,
  start: number,
): number {
  for (let index = start; index <= bytes.length - delimiter.length; index++) {
    if (
      index !== 0 &&
      !(index >= 2 && bytes[index - 2] === CR && bytes[index - 1] === LF)
    ) {
      continue;
    }

    if (!matchesBytes(bytes, index, delimiter)) {
      continue;
    }

    const after = index + delimiter.length;

    if (
      after + 1 < bytes.length &&
      ((bytes[after] === CR && bytes[after + 1] === LF) ||
        (bytes[after] === DASH && bytes[after + 1] === DASH))
    ) {
      return index;
    }
  }

  return -1;
}

function findHeaderEnd(bytes: Uint8Array, start: number): number {
  for (let index = start; index + 3 < bytes.length; index++) {
    if (
      bytes[index] === CR &&
      bytes[index + 1] === LF &&
      bytes[index + 2] === CR &&
      bytes[index + 3] === LF
    ) {
      return index;
    }
  }

  return -1;
}

function findEmptyNameInsertion(
  bytes: Uint8Array,
  start: number,
  end: number,
): number {
  let lineStart = start;

  while (lineStart < end) {
    let lineEnd = lineStart;

    while (
      lineEnd < end &&
      !(
        lineEnd + 1 < bytes.length &&
        bytes[lineEnd] === CR &&
        bytes[lineEnd + 1] === LF
      )
    ) {
      lineEnd++;
    }

    const colon = findByte(bytes, lineStart, lineEnd, COLON);

    if (
      colon !== -1 &&
      asciiEqualsIgnoreCase(
        bytes,
        lineStart,
        trimBytesEnd(bytes, lineStart, colon),
        "content-disposition",
      )
    ) {
      return findEmptyNameParameter(bytes, colon + 1, lineEnd);
    }

    lineStart = lineEnd + 2;
  }

  return -1;
}

function findEmptyNameParameter(
  bytes: Uint8Array,
  start: number,
  end: number,
): number {
  let segmentStart = start;
  let quoted = false;
  let escaped = false;

  for (let index = start; index <= end; index++) {
    const atEnd = index === end;
    const code = atEnd ? SEMICOLON : bytes[index]!;

    if (!atEnd) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (quoted && code === BACKSLASH) {
        escaped = true;
        continue;
      }

      if (code === QUOTE) {
        quoted = !quoted;
        continue;
      }

      if (quoted || code !== SEMICOLON) {
        continue;
      }
    }

    const insertion = inspectDispositionParameter(bytes, segmentStart, index);

    if (insertion !== -1) {
      return insertion;
    }

    segmentStart = index + 1;
  }

  return -1;
}

function inspectDispositionParameter(
  bytes: Uint8Array,
  start: number,
  end: number,
): number {
  start = trimBytesStart(bytes, start, end);
  end = trimBytesEnd(bytes, start, end);

  const equals = findByte(bytes, start, end, EQUALS);

  if (equals === -1) {
    return -1;
  }

  const nameEnd = trimBytesEnd(bytes, start, equals);

  if (!asciiEqualsIgnoreCase(bytes, start, nameEnd, "name")) {
    return -1;
  }

  const valueStart = trimBytesStart(bytes, equals + 1, end);
  const valueEnd = trimBytesEnd(bytes, valueStart, end);

  return valueEnd - valueStart === 2 &&
    bytes[valueStart] === QUOTE &&
    bytes[valueStart + 1] === QUOTE
    ? valueStart + 1
    : -1;
}

function isAsciiWhitespace(code: number): boolean {
  return code === SPACE || code === TAB;
}

function trimStringEnd(value: string, start: number, end: number): number {
  while (end > start && isAsciiWhitespace(value.charCodeAt(end - 1))) {
    end--;
  }

  return end;
}

function trimBytesStart(bytes: Uint8Array, start: number, end: number): number {
  while (start < end && isAsciiWhitespace(bytes[start]!)) {
    start++;
  }

  return start;
}

function trimBytesEnd(bytes: Uint8Array, start: number, end: number): number {
  while (end > start && isAsciiWhitespace(bytes[end - 1]!)) {
    end--;
  }

  return end;
}

function findByte(
  bytes: Uint8Array,
  start: number,
  end: number,
  target: number,
): number {
  for (let index = start; index < end; index++) {
    if (bytes[index] === target) {
      return index;
    }
  }

  return -1;
}

function asciiEqualsIgnoreCase(
  bytes: Uint8Array,
  start: number,
  end: number,
  expected: string,
): boolean {
  if (end - start !== expected.length) {
    return false;
  }

  for (let index = 0; index < expected.length; index++) {
    let actual = bytes[start + index]!;

    if (actual >= 65 && actual <= 90) {
      actual += 32;
    }

    if (actual !== expected.charCodeAt(index)) {
      return false;
    }
  }

  return true;
}

function containsAscii(
  bytes: Uint8Array,
  start: number,
  end: number,
  value: string,
): boolean {
  const expected = textEncoder.encode(value);

  for (let index = start; index <= end - expected.length; index++) {
    if (matchesBytes(bytes, index, expected)) {
      return true;
    }
  }

  return false;
}

function matchesBytes(
  bytes: Uint8Array,
  start: number,
  expected: Uint8Array,
): boolean {
  for (let index = 0; index < expected.length; index++) {
    if (bytes[start + index] !== expected[index]) {
      return false;
    }
  }

  return true;
}
