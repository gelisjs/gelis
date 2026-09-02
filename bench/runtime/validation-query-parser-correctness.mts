import assert from "node:assert/strict";

import { parseQueryFromUrl } from "../../src/runtime/input.ts";

const FIXED_CASES = [
  "http://gelis.test/",
  "http://gelis.test/?",
  "http://gelis.test/?&",
  "http://gelis.test/?&&",
  "http://gelis.test/?a",
  "http://gelis.test/?a=",
  "http://gelis.test/?=x",
  "http://gelis.test/?=",
  "http://gelis.test/?a=1",
  "http://gelis.test/?a=1&b=2",
  "http://gelis.test/?a=1&&b=2",
  "http://gelis.test/?a=1&",
  "http://gelis.test/?&a=1",
  "http://gelis.test/?a=1=2",
  "http://gelis.test/?a=b=c=d",

  "http://gelis.test/?tag=a&tag=b",
  "http://gelis.test/?tag=a&tag=b&tag=c",
  "http://gelis.test/?tag=&tag=",
  "http://gelis.test/?=a&=b",

  "http://gelis.test/?q=hello+world",
  "http://gelis.test/?q=hello+beautiful+world",
  "http://gelis.test/?hello+world=value",
  "http://gelis.test/?hello+world=foo+bar",
  "http://gelis.test/?a+b=c+d&e+f=g+h",

  "http://gelis.test/?q=hello%20world",
  "http://gelis.test/?hello%20world=value",
  "http://gelis.test/?hello%20world=foo%20bar",
  "http://gelis.test/?a%20b=c%20d&e%20f=g%20h",

  "http://gelis.test/?q=x%2By",
  "http://gelis.test/?q=x+y%2Bz",
  "http://gelis.test/?q=x%2By+z",
  "http://gelis.test/?a%2Bb=x+y",
  "http://gelis.test/?a+b=x%2By",
  "http://gelis.test/?a+b=x+y%2Bz",

  "http://gelis.test/?q=%25",
  "http://gelis.test/?q=%2520",
  "http://gelis.test/?q=%26",
  "http://gelis.test/?q=%3D",
  "http://gelis.test/?q=%23",
  "http://gelis.test/?q=%3F",

  "http://gelis.test/?q=%E2%82%AC",
  "http://gelis.test/?q=%F0%9F%98%80",
  "http://gelis.test/?caf%C3%A9=cr%C3%A8me",

  "http://gelis.test/?q=hello world",
  "http://gelis.test/?q=こんにちは",
  "http://gelis.test/?emoji=😀",

  "http://gelis.test/?a=1#fragment",
  "http://gelis.test/?a=1&b=2#fragment",
  "http://gelis.test/?q=hello+world#fragment",
  "http://gelis.test/?q=hello%20world#fragment",
  "http://gelis.test/?q=foo?bar",
  "http://gelis.test/?q=foo?bar#fragment",

  "http://gelis.test/?__proto__=x",
  "http://gelis.test/?constructor=x",
  "http://gelis.test/?toString=x",

  "http://gelis.test/?q=%",
  "http://gelis.test/?q=%2",
  "http://gelis.test/?q=%ZZ",
  "http://gelis.test/?q=%E0%A4%A",
  "http://gelis.test/?q=%C3%28",
] as const;

const FUZZ_CASES = 50_000;

let checked = 0;

for (const url of FIXED_CASES) {
  compare(url);

  checked++;
}

const random = createRandom(0x6e656c69);

for (let index = 0; index < FUZZ_CASES; index++) {
  compare(createFuzzUrl(random));

  checked++;
}

console.log("Gelis fused query parser correctness");
console.log(`Fixed cases: ${FIXED_CASES.length}`);
console.log(`Fuzz cases:  ${FUZZ_CASES}`);
console.log(`Checked:     ${checked}`);
console.log("Result:      PASS");

function compare(url: string): void {
  const current = capture(() => parseQueryFromUrl(url));

  const candidate = capture(() => parseQueryFused(url));

  if (!current.ok) {
    if (candidate.ok) {
      fail(url, current, candidate);
    }

    assert.equal(
      candidate.errorName,
      current.errorName,
      `Different thrown error for ${url}`,
    );

    return;
  }

  if (!candidate.ok) {
    fail(url, current, candidate);
  }

  try {
    assert.deepStrictEqual(candidate.value, current.value);
  } catch {
    fail(url, current, candidate);
  }
}

function capture(
  operation: () => Record<string, string | string[]>,
): CaptureResult {
  try {
    return {
      ok: true,
      value: operation(),
    };
  } catch (error) {
    return {
      ok: false,
      errorName: error instanceof Error ? error.name : typeof error,
    };
  }
}

function fail(
  url: string,
  current: CaptureResult,
  candidate: CaptureResult,
): never {
  console.error("\nParser mismatch");
  console.error(`URL: ${url}`);
  console.error("Current:");
  console.dir(current, {
    depth: null,
  });
  console.error("Candidate:");
  console.dir(candidate, {
    depth: null,
  });

  throw new Error("Fused parser does not preserve current semantics");
}

function parseQueryFused(url: string): Record<string, string | string[]> {
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

      // =
      if (code === 61 && equals === -1) {
        equals = index;

        continue;
      }

      // +
      if (code === 43) {
        if (equals === -1) {
          keyHasPlus = true;
        } else {
          valueHasPlus = true;
        }

        continue;
      }

      // %
      if (code === 37) {
        if (equals === -1) {
          keyHasPercent = true;
        } else {
          valueHasPercent = true;
        }

        continue;
      }

      // &
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

type CaptureResult =
  | {
      readonly ok: true;
      readonly value: Record<string, string | string[]>;
    }
  | {
      readonly ok: false;
      readonly errorName: string;
    };

function createRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;

    let value = state;

    value = Math.imul(value ^ (value >>> 15), value | 1);

    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function createFuzzUrl(random: () => number): string {
  const alphabet = "abcXYZ01239=&+%._~-";

  const length = Math.floor(random() * 48);

  let query = "";

  for (let index = 0; index < length; index++) {
    const characterIndex = Math.floor(random() * alphabet.length);

    query += alphabet[characterIndex] ?? "";
  }

  const fragment =
    random() < 0.25 ? `#fragment${Math.floor(random() * 100)}` : "";

  if (random() < 0.05) {
    return `http://gelis.test/path${fragment}`;
  }

  return `http://gelis.test/path?${query}${fragment}`;
}
