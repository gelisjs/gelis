import { Router } from "../../src/runtime/router.ts";
import { normalizeResponse, runtimeReply } from "../../src/runtime/response.ts";
import { pathnameFromRequestUrl } from "../../src/runtime/url.ts";
import { RUNTIME_ROUTE_PLAIN } from "../../src/runtime/types.ts";

import type {
  RuntimeRouteContext,
  RuntimeRouteHandler,
  RuntimeRouteRecord,
} from "../../src/runtime/types.ts";
import type { RuntimeRouteMatch } from "../../src/runtime/router.ts";

const ROUTES = 5_000;
const LAST = ROUTES - 1;
const MIXED_ROUTES_PER_KIND = ROUTES / 2;
const MIXED_LAST = MIXED_ROUTES_PER_KIND - 1;
const WARMUP = 20_000;
const TARGET_MS = 120;
const MIN_CALIBRATION_MS = 20;
const PARAM_VALUE = "value-42";

const DYNAMIC_PATH = `/r/${LAST}/${PARAM_VALUE}`;
const DYNAMIC_URL = `http://gelis.test${DYNAMIC_PATH}`;
const DYNAMIC_REQUEST = new Request(DYNAMIC_URL);

const MIXED_STATIC_PATH = `/s/${MIXED_LAST}`;
const MIXED_STATIC_URL = `http://gelis.test${MIXED_STATIC_PATH}`;
const MIXED_STATIC_REQUEST = new Request(MIXED_STATIC_URL);

const MIXED_DYNAMIC_PATH = `/d/${MIXED_LAST}/${PARAM_VALUE}`;
const MIXED_DYNAMIC_URL = `http://gelis.test${MIXED_DYNAMIC_PATH}`;
const MIXED_DYNAMIC_REQUEST = new Request(MIXED_DYNAMIC_URL);

const EMPTY_PARAMS = Object.freeze({}) as Record<string, string>;

type Cell =
  | "current-trailing-stable"
  | "radix-trailing-stable"
  | "current-trailing-request"
  | "radix-trailing-request"
  | "current-pipeline-string"
  | "radix-pipeline-string"
  | "current-pipeline-json"
  | "radix-pipeline-json"
  | "current-mixed-static-request"
  | "radix-mixed-static-request"
  | "current-mixed-dynamic-request"
  | "radix-mixed-dynamic-request";

type Implementation = "current" | "radix";
type BodyKind = "string" | "json";
type Operation = () => number;

interface WorkerResult {
  readonly cell: Cell;
  readonly probeOnly: boolean;
  readonly iterations: number;
  readonly warmups: number;
  readonly nsPerOp: number | null;
  readonly sink: number;
}

interface PreparedCell {
  readonly operation: Operation;
  readonly assertCorrectness: () => void | Promise<void>;
}

interface Matcher {
  match(method: string, pathname: string): RuntimeRouteMatch | undefined;
}

interface CandidateMethodRoutes {
  readonly staticRoutes: Map<string, RuntimeRouteRecord>;
  readonly trailing: TrailingPrefixRadix;
}

interface CandidateTrailingRoute {
  readonly route: RuntimeRouteRecord;
  readonly paramName: string;
}

interface RadixNode {
  fragment: string;
  children: Map<number, RadixNode> | undefined;
  value: CandidateTrailingRoute | undefined;
}

const CELLS = new Set<Cell>([
  "current-trailing-stable",
  "radix-trailing-stable",
  "current-trailing-request",
  "radix-trailing-request",
  "current-pipeline-string",
  "radix-pipeline-string",
  "current-pipeline-json",
  "radix-pipeline-json",
  "current-mixed-static-request",
  "radix-mixed-static-request",
  "current-mixed-dynamic-request",
  "radix-mixed-dynamic-request",
]);

const args = readArgs(process.argv.slice(2));
const requestedCell = required(args.cell, "--cell");
assertCell(requestedCell);
const cell = requestedCell;
const probeOnly = args.probeOnly === "true";

assertCandidateSemantics();
const prepared = prepareCell(cell);
await prepared.assertCorrectness();

if (probeOnly) {
  const result: WorkerResult = {
    cell,
    probeOnly: true,
    iterations: 0,
    warmups: 0,
    nsPerOp: null,
    sink: 0,
  };

  console.log(JSON.stringify(result));
} else {
  let sink = 0;
  const operation = () => {
    const value = prepared.operation();
    sink = ((sink << 5) - sink + value) | 0;
  };

  for (let index = 0; index < WARMUP; index++) operation();

  const iterations = calibrate(operation);
  const elapsed = measure(operation, iterations);

  const result: WorkerResult = {
    cell,
    probeOnly: false,
    iterations,
    warmups: WARMUP,
    nsPerOp: (elapsed * 1_000_000) / iterations,
    sink,
  };

  console.log(JSON.stringify(result));
}

function prepareCell(cell: Cell): PreparedCell {
  switch (cell) {
    case "current-trailing-stable":
      return trailingMatchCell("current", false);
    case "radix-trailing-stable":
      return trailingMatchCell("radix", false);
    case "current-trailing-request":
      return trailingMatchCell("current", true);
    case "radix-trailing-request":
      return trailingMatchCell("radix", true);
    case "current-pipeline-string":
      return pipelineCell("current", "string");
    case "radix-pipeline-string":
      return pipelineCell("radix", "string");
    case "current-pipeline-json":
      return pipelineCell("current", "json");
    case "radix-pipeline-json":
      return pipelineCell("radix", "json");
    case "current-mixed-static-request":
      return mixedRequestCell("current", false);
    case "radix-mixed-static-request":
      return mixedRequestCell("radix", false);
    case "current-mixed-dynamic-request":
      return mixedRequestCell("current", true);
    case "radix-mixed-dynamic-request":
      return mixedRequestCell("radix", true);
  }
}

function trailingMatchCell(
  implementation: Implementation,
  requestDerived: boolean,
): PreparedCell {
  const matcher = buildTrailingMatcher(implementation, "string");

  const run = () => {
    const pathname = requestDerived
      ? pathnameFromRequestUrl(DYNAMIC_REQUEST.url)
      : DYNAMIC_PATH;
    const match = matcher.match("GET", pathname);
    if (match === undefined) throw new Error("trailing route miss");
    return match;
  };

  return {
    operation: () => {
      const match = run();
      return match.route.path.length + (match.params.id?.length ?? 0);
    },
    assertCorrectness: () => {
      assertDynamicMatch(run(), `/r/${LAST}/:id`);
    },
  };
}

function pipelineCell(
  implementation: Implementation,
  bodyKind: BodyKind,
): PreparedCell {
  const matcher = buildTrailingMatcher(implementation, bodyKind);
  const expectedBody =
    bodyKind === "json" ? JSON.stringify({ id: PARAM_VALUE }) : PARAM_VALUE;

  const run = (): Response => {
    const pathname = pathnameFromRequestUrl(DYNAMIC_REQUEST.url);
    const match = matcher.match("GET", pathname);
    if (match === undefined) throw new Error("pipeline route miss");

    const value = match.route.handler(
      createContext(DYNAMIC_REQUEST, match.params),
    );
    assertSync(value, "pipeline handler");
    return normalizeResponse(value);
  };

  return {
    operation: () => run().status,
    assertCorrectness: async () => {
      const match = matcher.match(
        "GET",
        pathnameFromRequestUrl(DYNAMIC_REQUEST.url),
      );
      if (match === undefined)
        throw new Error("pipeline correctness route miss");
      assertDynamicMatch(match, `/r/${LAST}/:id`);
      await assertResponse(run(), expectedBody, bodyKind === "json");
    },
  };
}

function mixedRequestCell(
  implementation: Implementation,
  dynamic: boolean,
): PreparedCell {
  const matcher = buildMixedMatcher(implementation);
  const request = dynamic ? MIXED_DYNAMIC_REQUEST : MIXED_STATIC_REQUEST;
  const expectedPath = dynamic ? `/d/${MIXED_LAST}/:id` : `/s/${MIXED_LAST}`;

  const run = () => {
    const pathname = pathnameFromRequestUrl(request.url);
    const match = matcher.match("GET", pathname);
    if (match === undefined) throw new Error("mixed route miss");
    return match;
  };

  return {
    operation: () => {
      const match = run();
      return (
        match.route.path.length +
        (dynamic
          ? (match.params.id?.length ?? 0)
          : Object.keys(match.params).length)
      );
    },
    assertCorrectness: () => {
      const match = run();
      if (match.route.path !== expectedPath) {
        throw new Error(
          `mixed route mismatch: expected ${expectedPath}, got ${match.route.path}`,
        );
      }
      if (dynamic) {
        if (match.params.id !== PARAM_VALUE) {
          throw new Error(`mixed dynamic param mismatch: ${match.params.id}`);
        }
      } else if (Object.keys(match.params).length !== 0) {
        throw new Error("mixed static route unexpectedly produced params");
      }
    },
  };
}

function buildTrailingMatcher(
  implementation: Implementation,
  bodyKind: BodyKind,
): Matcher {
  const matcher: Matcher =
    implementation === "current" ? new Router() : new CandidateRouter();

  for (let index = 0; index < ROUTES; index++) {
    registerMatcher(matcher, createRoute(`/r/${index}/:id`, bodyKind));
  }

  return matcher;
}

function buildMixedMatcher(implementation: Implementation): Matcher {
  const matcher: Matcher =
    implementation === "current" ? new Router() : new CandidateRouter();

  for (let index = 0; index < MIXED_ROUTES_PER_KIND; index++) {
    registerMatcher(matcher, createRoute(`/s/${index}`, "string"));
    registerMatcher(matcher, createRoute(`/d/${index}/:id`, "string"));
  }

  return matcher;
}

function registerMatcher(matcher: Matcher, route: RuntimeRouteRecord): void {
  if (matcher instanceof Router) {
    matcher.register(route);
    return;
  }

  if (matcher instanceof CandidateRouter) {
    matcher.register(route);
    return;
  }

  throw new Error("unknown matcher implementation");
}

function createRoute(path: string, bodyKind: BodyKind): RuntimeRouteRecord {
  const handler: RuntimeRouteHandler =
    bodyKind === "json" ? () => ({ id: PARAM_VALUE }) : () => PARAM_VALUE;

  return {
    method: "GET",
    path,
    handler,
    flags: RUNTIME_ROUTE_PLAIN,
    input: undefined,
    beforeHandle: undefined,
    afterHandle: undefined,
    responses: undefined,
  };
}

function createContext(
  request: Request,
  params: Record<string, string>,
): RuntimeRouteContext {
  return {
    request,
    params,
    query: undefined,
    body: undefined,
    reply: runtimeReply,
  };
}

class CandidateRouter implements Matcher {
  #methods = new Map<string, CandidateMethodRoutes>();

  register(route: RuntimeRouteRecord): void {
    let table = this.#methods.get(route.method);
    if (table === undefined) {
      table = {
        staticRoutes: new Map(),
        trailing: new TrailingPrefixRadix(),
      };
      this.#methods.set(route.method, table);
    }

    const segments = splitPath(route.path);
    let paramCount = 0;
    let paramName: string | undefined;

    for (const segment of segments) {
      if (!segment.startsWith(":")) continue;
      paramCount++;
      paramName = segment.slice(1);
    }

    if (paramCount === 0) {
      if (table.staticRoutes.has(route.path)) {
        throw new Error(`Duplicate route: ${route.method} ${route.path}`);
      }
      table.staticRoutes.set(route.path, route);
      return;
    }

    const finalSegment = segments.at(-1);
    if (
      paramCount !== 1 ||
      paramName === undefined ||
      finalSegment === undefined ||
      !finalSegment.startsWith(":")
    ) {
      throw new Error(
        `CP3-O candidate supports trailing params only: ${route.path}`,
      );
    }

    const slash = route.path.lastIndexOf("/");
    if (slash < 0) {
      throw new Error(`Invalid trailing-param route: ${route.path}`);
    }

    table.trailing.register(route.path.slice(0, slash + 1), {
      route,
      paramName,
    });
  }

  match(method: string, pathname: string): RuntimeRouteMatch | undefined {
    const table = this.#methods.get(method);
    if (table === undefined) return undefined;

    const staticRoute = table.staticRoutes.get(pathname);
    if (staticRoute !== undefined) {
      return {
        route: staticRoute,
        params: EMPTY_PARAMS,
      };
    }

    return table.trailing.match(pathname);
  }
}

class TrailingPrefixRadix {
  readonly #root: RadixNode = {
    fragment: "",
    children: undefined,
    value: undefined,
  };

  register(prefix: string, value: CandidateTrailingRoute): void {
    let node = this.#root;
    let offset = 0;

    while (offset < prefix.length) {
      let children = node.children;
      if (children === undefined) {
        children = new Map();
        node.children = children;
      }

      const key = prefix.charCodeAt(offset);
      let child = children.get(key);

      if (child === undefined) {
        children.set(key, {
          fragment: prefix.slice(offset),
          children: undefined,
          value,
        });
        return;
      }

      const fragment = child.fragment;
      const max = Math.min(fragment.length, prefix.length - offset);
      let common = 0;

      while (
        common < max &&
        fragment.charCodeAt(common) === prefix.charCodeAt(offset + common)
      ) {
        common++;
      }

      if (common === fragment.length) {
        offset += common;
        node = child;
        continue;
      }

      if (common === 0) {
        throw new Error("CP3-O radix invariant failure");
      }

      const previousSuffix = fragment.slice(common);
      const previousNode: RadixNode = {
        fragment: previousSuffix,
        children: child.children,
        value: child.value,
      };

      child.fragment = fragment.slice(0, common);
      child.children = new Map([[previousSuffix.charCodeAt(0), previousNode]]);
      child.value = undefined;

      offset += common;

      if (offset === prefix.length) {
        child.value = value;
        return;
      }

      const newSuffix = prefix.slice(offset);
      child.children.set(newSuffix.charCodeAt(0), {
        fragment: newSuffix,
        children: undefined,
        value,
      });
      return;
    }

    if (node.value !== undefined) {
      throw new Error(`Duplicate trailing prefix: ${prefix}`);
    }
    node.value = value;
  }

  match(pathname: string): RuntimeRouteMatch | undefined {
    let node = this.#root;
    let offset = 0;

    while (offset < pathname.length) {
      const children = node.children;
      if (children === undefined) return undefined;

      const child = children.get(pathname.charCodeAt(offset));
      if (child === undefined) return undefined;

      const fragment = child.fragment;
      if (offset + fragment.length > pathname.length) return undefined;

      for (let index = 0; index < fragment.length; index++) {
        if (
          fragment.charCodeAt(index) !== pathname.charCodeAt(offset + index)
        ) {
          return undefined;
        }
      }

      offset += fragment.length;
      node = child;

      const trailing = node.value;
      if (trailing !== undefined && pathname.indexOf("/", offset) === -1) {
        const encodedValue = pathname.slice(offset);
        return {
          route: trailing.route,
          params: {
            [trailing.paramName]: decodeParam(encodedValue),
          },
        };
      }
    }

    return undefined;
  }
}

function assertCandidateSemantics(): void {
  const candidate = new CandidateRouter();

  candidate.register(createRoute("/collision/:id", "string"));
  candidate.register(createRoute("/collision/fixed", "string"));
  candidate.register(createRoute("/named/:slug", "string"));
  candidate.register(createRoute("/nested/:id", "string"));
  candidate.register(createRoute("/nested/deep/:id", "string"));

  const staticMatch = candidate.match("GET", "/collision/fixed");
  if (staticMatch?.route.path !== "/collision/fixed") {
    throw new Error("candidate static precedence mismatch");
  }

  const dynamicMatch = candidate.match("GET", "/collision/value");
  if (
    dynamicMatch?.route.path !== "/collision/:id" ||
    dynamicMatch.params.id !== "value"
  ) {
    throw new Error("candidate dynamic match mismatch");
  }

  const namedMatch = candidate.match("GET", "/named/a%20b");
  if (
    namedMatch?.route.path !== "/named/:slug" ||
    namedMatch.params.slug !== "a b"
  ) {
    throw new Error("candidate percent-decoding mismatch");
  }

  const nestedMatch = candidate.match("GET", "/nested/deep/value");
  if (
    nestedMatch?.route.path !== "/nested/deep/:id" ||
    nestedMatch.params.id !== "value"
  ) {
    throw new Error("candidate nested-prefix mismatch");
  }

  if (candidate.match("POST", "/collision/value") !== undefined) {
    throw new Error("candidate method isolation mismatch");
  }

  let duplicateRejected = false;
  try {
    candidate.register(createRoute("/collision/:other", "string"));
  } catch {
    duplicateRejected = true;
  }

  if (!duplicateRejected) {
    throw new Error("candidate duplicate trailing prefix was not rejected");
  }
}

function assertDynamicMatch(
  match: RuntimeRouteMatch,
  expectedPath: string,
): void {
  if (match.route.path !== expectedPath) {
    throw new Error(
      `dynamic route mismatch: expected ${expectedPath}, got ${match.route.path}`,
    );
  }
  if (match.params.id !== PARAM_VALUE) {
    throw new Error(`dynamic param mismatch: ${match.params.id}`);
  }
}

async function assertResponse(
  response: Response,
  expectedBody: string,
  expectJson: boolean,
): Promise<void> {
  if (response.status !== 200) {
    throw new Error(`response status mismatch: ${response.status}`);
  }

  const body = await response.text();
  if (body !== expectedBody) {
    throw new Error(
      `response body mismatch: expected ${expectedBody}, got ${body}`,
    );
  }

  if (expectJson) {
    const mediaType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (mediaType !== "application/json") {
      throw new Error(`JSON media type mismatch: ${mediaType}`);
    }
  }
}

function splitPath(path: string): string[] {
  if (path === "/") return [];
  return path.slice(1).split("/");
}

function decodeParam(value: string): string {
  if (!value.includes("%")) return value;
  return decodeURIComponent(value);
}

function calibrate(operation: () => void): number {
  let iterations = 1_000;

  while (true) {
    const elapsed = measure(operation, iterations);
    if (elapsed >= MIN_CALIBRATION_MS) {
      return Math.max(
        1,
        Math.round((iterations * TARGET_MS) / Math.max(elapsed, 0.001)),
      );
    }
    iterations *= 2;
  }
}

function measure(operation: () => void, iterations: number): number {
  const start = performance.now();
  for (let index = 0; index < iterations; index++) operation();
  return performance.now() - start;
}

interface ParsedArgs {
  readonly cell: string | undefined;
  readonly probeOnly: string | undefined;
}

function readArgs(values: readonly string[]): ParsedArgs {
  const entries = new Map<string, string>();

  for (const value of values) {
    if (!value.startsWith("--")) continue;
    const separator = value.indexOf("=");
    if (separator === -1) continue;
    entries.set(value.slice(2, separator), value.slice(separator + 1));
  }

  return {
    cell: entries.get("cell"),
    probeOnly: entries.get("probe-only"),
  };
}

function required(value: string | undefined, flag: string): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing ${flag}`);
  }
  return value;
}

function assertCell(value: string): asserts value is Cell {
  if (!CELLS.has(value as Cell)) {
    throw new Error(`Unknown CP3-O cell: ${value}`);
  }
}

function assertSync<T>(
  value: T | PromiseLike<T>,
  label: string,
): asserts value is T {
  if (isPromiseLike(value)) {
    throw new Error(`unexpected async ${label}`);
  }
}

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return false;
  }

  return typeof (value as { then?: unknown }).then === "function";
}
