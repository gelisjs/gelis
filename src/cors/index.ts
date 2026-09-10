import {
  defineCapability,
  definePlugin,
} from "../plugin";

import type {
  Capability,
  Plugin,
} from "../plugin";

import {
  ALL_ROUTE_METHOD,
  assertHttpMethodToken,
} from "../http-method";

import {
  createOfficialApplicationHttpMarker,
} from "../runtime/application-http";

import type {
  RuntimeApplicationHttpPolicy,
  RuntimeApplicationHttpRuntime,
} from "../runtime/application-http";

export type CorsOriginResolver = (
  origin: string,
  request: Request,
) => boolean | PromiseLike<boolean>;

export type CorsOrigin =
  | "*"
  | string
  | readonly string[]
  | CorsOriginResolver;

export interface CorsOptions {
  readonly origin?: CorsOrigin;
  readonly methods?: readonly string[];
  readonly allowHeaders?: readonly string[] | "request";
  readonly exposeHeaders?: readonly string[];
  readonly credentials?: boolean;
  readonly maxAge?: number;
}

type ValidCorsOptions<Options extends CorsOptions> =
  Options extends { readonly credentials: true }
    ? Options extends { readonly origin: infer Origin }
      ? Origin extends "*"
        ? never
        : Options
      : never
    : Options;

interface NormalizedCorsOptions {
  readonly origin:
    | { readonly kind: "wildcard" }
    | { readonly kind: "fixed"; readonly value: string }
    | { readonly kind: "list"; readonly values: ReadonlySet<string> }
    | { readonly kind: "resolver"; readonly resolve: CorsOriginResolver };
  readonly originDependsOnRequest: boolean;
  readonly methods: readonly string[] | undefined;
  readonly allowHeaders: "request" | readonly string[];
  readonly allowHeadersValue: string | undefined;
  readonly exposeHeadersValue: string | undefined;
  readonly credentials: boolean;
  readonly maxAgeValue: string | undefined;
}

interface CorsRequestState {
  readonly allowed: boolean;
  readonly allowOrigin: string | undefined;
  readonly varyOrigin: boolean;
}

const FIELD_NAME_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

const corsCapability = defineCapability(
  "gelis.cors.application-policy",
) as unknown as Capability<true>;

export function cors(): Plugin;
export function cors<const Options extends CorsOptions>(
  options: ValidCorsOptions<Options>,
): Plugin;
export function cors(options?: CorsOptions): Plugin {
  const normalized = normalizeCorsOptions(options);
  const policy = createCorsPolicy(normalized);

  return definePlugin("gelis/cors", (context) => {
    /*
     * Capability ownership makes duplicate installation transactional:
     * the second provider fails before its HTTP marker can be committed.
     */
    corsCapability.provide(context, true);

    context.onRequest(
      createOfficialApplicationHttpMarker({
        kind: "cors",
        policy,
      }),
    );
  });
}

function createCorsPolicy(
  options: NormalizedCorsOptions,
): RuntimeApplicationHttpPolicy {
  const requestStates = new WeakMap<Request, CorsRequestState>();

  return {
    prepare(request, runtime) {
      if (isPreflight(request)) {
        return preparePreflight(request, runtime, options);
      }

      return prepareActualRequest(request, options, requestStates);
    },

    finalize(request, response) {
      const state = requestStates.get(request);

      if (state !== undefined) {
        requestStates.delete(request);

        return applyActualCorsResponse(response, options, state);
      }

      /*
       * A resolver failure can be handled by application onError before a
       * request state exists. Non-wildcard policies still vary by Origin,
       * but must not re-run the resolver merely to decorate the error.
       */
      if (options.originDependsOnRequest) {
        return mutateResponse(response, (headers) => {
          mergeVary(headers, "Origin");
        });
      }

      return response;
    },
  };
}

function prepareActualRequest(
  request: Request,
  options: NormalizedCorsOptions,
  states: WeakMap<Request, CorsRequestState>,
): void | Promise<void> {
  const origin = request.headers.get("origin");

  if (origin === null) {
    return;
  }

  const decision = resolveOrigin(options.origin, origin, request);

  if (isPromiseLike(decision)) {
    return Promise.resolve(decision).then((allowed) => {
      states.set(
        request,
        createRequestState(options, origin, allowed),
      );
    });
  }

  states.set(request, createRequestState(options, origin, decision));
}

function preparePreflight(
  request: Request,
  runtime: RuntimeApplicationHttpRuntime,
  options: NormalizedCorsOptions,
): Response | Promise<Response> {
  const origin = request.headers.get("origin")!;
  const requestedMethod = request.headers.get("access-control-request-method")!;

  if (!isValidRequestedMethod(requestedMethod)) {
    return invalidPreflightResponse(options);
  }

  let requestedHeaders: readonly string[] = [];

  if (options.allowHeaders === "request") {
    const rawHeaders = request.headers.get("access-control-request-headers");

    if (rawHeaders !== null) {
      const parsed = parseRequestedHeaders(rawHeaders);

      if (parsed === undefined) {
        return invalidPreflightResponse(options);
      }

      requestedHeaders = parsed;
    }
  }

  const decision = resolveOrigin(options.origin, origin, request);

  if (isPromiseLike(decision)) {
    return Promise.resolve(decision).then((allowed) =>
      createPreflightResponse(
        request,
        runtime,
        options,
        origin,
        requestedMethod,
        requestedHeaders,
        allowed,
      ),
    );
  }

  return createPreflightResponse(
    request,
    runtime,
    options,
    origin,
    requestedMethod,
    requestedHeaders,
    decision,
  );
}

function createPreflightResponse(
  request: Request,
  runtime: RuntimeApplicationHttpRuntime,
  options: NormalizedCorsOptions,
  origin: string,
  requestedMethod: string,
  requestedHeaders: readonly string[],
  originAllowed: boolean,
): Response {
  const headers = new Headers();
  const state = createRequestState(options, origin, originAllowed);

  if (state.varyOrigin) {
    mergeVary(headers, "Origin");
  }

  if (options.allowHeaders === "request") {
    mergeVary(headers, "Access-Control-Request-Headers");
  }

  if (!state.allowed || state.allowOrigin === undefined) {
    return new Response(null, {
      status: 204,
      headers,
    });
  }

  headers.set("Access-Control-Allow-Origin", state.allowOrigin);

  if (options.credentials) {
    headers.set("Access-Control-Allow-Credentials", "true");
  }

  const actualMethods = runtime.matchingMethods(request);
  const methods = resolvePreflightMethods(
    actualMethods,
    requestedMethod,
    options.methods,
  );

  if (methods.dependsOnRequestedMethod) {
    mergeVary(headers, "Access-Control-Request-Method");
  }

  if (methods.values.length !== 0) {
    headers.set("Access-Control-Allow-Methods", methods.values.join(", "));
  }

  const allowHeaders =
    options.allowHeaders === "request"
      ? requestedHeaders.length === 0
        ? undefined
        : requestedHeaders.join(", ")
      : options.allowHeadersValue;

  if (allowHeaders !== undefined) {
    headers.set("Access-Control-Allow-Headers", allowHeaders);
  }

  if (options.maxAgeValue !== undefined) {
    headers.set("Access-Control-Max-Age", options.maxAgeValue);
  }

  return new Response(null, {
    status: 204,
    headers,
  });
}

function resolvePreflightMethods(
  actualMethods: readonly string[],
  requestedMethod: string,
  configuredMethods: readonly string[] | undefined,
): {
  readonly values: readonly string[];
  readonly dependsOnRequestedMethod: boolean;
} {
  let hasAll = false;
  const actual = new Set<string>();

  for (let index = 0; index < actualMethods.length; index++) {
    const method = actualMethods[index]!;

    if (method === ALL_ROUTE_METHOD) {
      hasAll = true;
      continue;
    }

    actual.add(method);
  }

  if (configuredMethods !== undefined) {
    const values: string[] = [];

    for (let index = 0; index < configuredMethods.length; index++) {
      const method = configuredMethods[index]!;

      if (hasAll || actual.has(method)) {
        values.push(method);
      }
    }

    return {
      values,
      dependsOnRequestedMethod: false,
    };
  }

  const values = [...actual];

  if (hasAll && !actual.has(requestedMethod)) {
    values.push(requestedMethod);
  }

  return {
    values,
    dependsOnRequestedMethod: hasAll,
  };
}

function applyActualCorsResponse(
  response: Response,
  options: NormalizedCorsOptions,
  state: CorsRequestState,
): Response {
  return mutateResponse(response, (headers) => {
    if (state.varyOrigin) {
      mergeVary(headers, "Origin");
    }

    if (!state.allowed || state.allowOrigin === undefined) {
      return;
    }

    headers.set("Access-Control-Allow-Origin", state.allowOrigin);

    if (options.credentials) {
      headers.set("Access-Control-Allow-Credentials", "true");
    }

    if (options.exposeHeadersValue !== undefined) {
      headers.set(
        "Access-Control-Expose-Headers",
        options.exposeHeadersValue,
      );
    }
  });
}

function createRequestState(
  options: NormalizedCorsOptions,
  incomingOrigin: string,
  allowed: boolean,
): CorsRequestState {
  const validOrigin = isSerializedOrigin(incomingOrigin);

  if (!validOrigin) {
    return {
      allowed: false,
      allowOrigin: undefined,
      varyOrigin: true,
    };
  }

  if (options.origin.kind === "wildcard") {
    /*
     * The opaque serialized origin `null` is intentionally not granted by
     * wildcard policy. Applications must name/resolve it explicitly.
     */
    if (incomingOrigin === "null") {
      return {
        allowed: false,
        allowOrigin: undefined,
        varyOrigin: true,
      };
    }

    return {
      allowed,
      allowOrigin: allowed ? "*" : undefined,
      varyOrigin: false,
    };
  }

  return {
    allowed,
    allowOrigin: allowed ? incomingOrigin : undefined,
    varyOrigin: true,
  };
}

function resolveOrigin(
  policy: NormalizedCorsOptions["origin"],
  incomingOrigin: string,
  request: Request,
): boolean | PromiseLike<boolean> {
  if (!isSerializedOrigin(incomingOrigin)) {
    return false;
  }

  switch (policy.kind) {
    case "wildcard":
      return incomingOrigin !== "null";

    case "fixed":
      return incomingOrigin === policy.value;

    case "list":
      return policy.values.has(incomingOrigin);

    case "resolver": {
      const result = policy.resolve(incomingOrigin, request);

      if (isPromiseLike(result)) {
        return Promise.resolve(result).then((allowed) => allowed === true);
      }

      return result === true;
    }
  }
}

function normalizeCorsOptions(options?: CorsOptions): NormalizedCorsOptions {
  const credentials = options?.credentials ?? false;
  const originOption = options?.origin ?? "*";

  if (originOption === "*" && credentials) {
    throw new TypeError(
      "Gelis CORS does not allow wildcard origin with credentials",
    );
  }

  const origin = normalizeOrigin(originOption);
  const methods = normalizeMethods(options?.methods);
  const allowHeaders = normalizeAllowHeaders(options?.allowHeaders);
  const exposeHeaders = normalizeFieldNameList(
    options?.exposeHeaders,
    "exposeHeaders",
  );
  const maxAgeValue = normalizeMaxAge(options?.maxAge);

  return {
    origin,
    originDependsOnRequest: origin.kind !== "wildcard",
    methods,
    allowHeaders: allowHeaders.values,
    allowHeadersValue: allowHeaders.headerValue,
    exposeHeadersValue:
      exposeHeaders.length === 0
        ? undefined
        : exposeHeaders.join(", "),
    credentials,
    maxAgeValue,
  };
}

function normalizeOrigin(origin: CorsOrigin): NormalizedCorsOptions["origin"] {
  if (typeof origin === "function") {
    return {
      kind: "resolver",
      resolve: origin,
    };
  }

  if (typeof origin === "string") {
    if (origin === "*") {
      return { kind: "wildcard" };
    }

    assertConfiguredOrigin(origin);

    return {
      kind: "fixed",
      value: origin,
    };
  }

  const values = new Set<string>();

  for (let index = 0; index < origin.length; index++) {
    const value = origin[index]!;

    if (value === "*") {
      throw new TypeError(
        'Gelis CORS origin arrays cannot contain "*"; use origin: "*"',
      );
    }

    assertConfiguredOrigin(value);
    values.add(value);
  }

  return {
    kind: "list",
    values,
  };
}

function normalizeMethods(
  methods: readonly string[] | undefined,
): readonly string[] | undefined {
  if (methods === undefined) {
    return undefined;
  }

  const values: string[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < methods.length; index++) {
    const method = methods[index]!;

    assertHttpMethodToken(method);

    if (seen.has(method)) {
      continue;
    }

    seen.add(method);
    values.push(method);
  }

  return values;
}

function normalizeAllowHeaders(
  value: CorsOptions["allowHeaders"],
): {
  readonly values: "request" | readonly string[];
  readonly headerValue: string | undefined;
} {
  if (value === undefined || value === "request") {
    return {
      values: "request",
      headerValue: undefined,
    };
  }

  const values = normalizeFieldNameList(value, "allowHeaders");

  return {
    values,
    headerValue: values.length === 0 ? undefined : values.join(", "),
  };
}

function normalizeFieldNameList(
  values: readonly string[] | undefined,
  optionName: string,
): readonly string[] {
  if (values === undefined) {
    return [];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < values.length; index++) {
    const value = values[index]!;

    if (!FIELD_NAME_TOKEN.test(value)) {
      throw new TypeError(
        `Invalid Gelis CORS ${optionName} field name: ${JSON.stringify(value)}`,
      );
    }

    const key = value.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(value);
  }

  return normalized;
}

function normalizeMaxAge(value: number | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new TypeError("Gelis CORS maxAge must be a finite non-negative integer");
  }

  return String(value);
}

function parseRequestedHeaders(value: string): readonly string[] | undefined {
  if (value.length === 0) {
    return undefined;
  }

  const parts = value.split(",");
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < parts.length; index++) {
    const part = trimOws(parts[index]!);

    if (part.length === 0 || !FIELD_NAME_TOKEN.test(part)) {
      return undefined;
    }

    const key = part.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(key);
  }

  return normalized;
}

function isValidRequestedMethod(method: string): boolean {
  try {
    assertHttpMethodToken(method);
    return true;
  } catch {
    return false;
  }
}

function assertConfiguredOrigin(origin: string): void {
  if (!isSerializedOrigin(origin)) {
    throw new TypeError(`Invalid serialized CORS origin: ${JSON.stringify(origin)}`);
  }
}

function isSerializedOrigin(origin: string): boolean {
  if (origin === "null") {
    return true;
  }

  try {
    const url = new URL(origin);

    return url.origin !== "null" && url.origin === origin;
  } catch {
    return false;
  }
}

function isPreflight(request: Request): boolean {
  return (
    request.method === "OPTIONS" &&
    request.headers.has("origin") &&
    request.headers.has("access-control-request-method")
  );
}

function invalidPreflightResponse(options: NormalizedCorsOptions): Response {
  const headers = new Headers();

  if (options.originDependsOnRequest) {
    mergeVary(headers, "Origin");
  }

  if (options.allowHeaders === "request") {
    mergeVary(headers, "Access-Control-Request-Headers");
  }

  return new Response("Invalid CORS Preflight Request", {
    status: 400,
    headers,
  });
}

function mutateResponse(
  response: Response,
  mutate: (headers: Headers) => void,
): Response {
  try {
    mutate(response.headers);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    mutate(headers);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

function mergeVary(headers: Headers, token: string): void {
  const current = headers.get("vary");

  if (current === null || current.length === 0) {
    headers.set("Vary", token);
    return;
  }

  const values = current.split(",");
  const target = token.toLowerCase();

  for (let index = 0; index < values.length; index++) {
    const value = trimOws(values[index]!);

    if (value === "*") {
      return;
    }

    if (value.toLowerCase() === target) {
      return;
    }
  }

  headers.set("Vary", `${current}, ${token}`);
}

function trimOws(value: string): string {
  let start = 0;
  let end = value.length;

  while (start < end) {
    const code = value.charCodeAt(start);
    if (code !== 32 && code !== 9) {
      break;
    }
    start++;
  }

  while (end > start) {
    const code = value.charCodeAt(end - 1);
    if (code !== 32 && code !== 9) {
      break;
    }
    end--;
  }

  return value.slice(start, end);
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
