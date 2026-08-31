import { getModuleRuntimeRoutes } from "./module";

import { pathnameFromUrl } from "./runtime/url";

import { RouteBuilder } from "./route-builder";

import { Router } from "./runtime/router";

import { normalizeResponse, runtimeReply } from "./runtime/response";

import {
  RUNTIME_INPUT_BODY,
  RUNTIME_INPUT_QUERY,
  RUNTIME_INPUT_QUERY_BODY,
  invalidQueryEncodingResponse,
  isJsonContentType,
  malformedJsonResponse,
  parseQueryFromUrl,
  unsupportedMediaTypeResponse,
  validationErrorResponse,
} from "./runtime/input";

import {
  RUNTIME_ROUTE_BEFORE_HANDLE,
  RUNTIME_ROUTE_INPUT,
  RUNTIME_ROUTE_INPUT_BEFORE_HANDLE,
  RUNTIME_ROUTE_PLAIN,
} from "./runtime/types";

import type { ModuleRef, ModuleRoutes } from "./module";

import type { RuntimeInputPlan } from "./runtime/input";

import type {
  RuntimeRouteContext,
  RuntimeRouteHandler,
  RuntimeRouteRecord,
} from "./runtime/types";

type RuntimeRouteInvoker = (
  route: RuntimeRouteRecord,

  request: Request,

  params: Record<string, string>,

  query: unknown,

  body: unknown,
) => Response | Promise<Response>;

export class Gelis extends RouteBuilder<""> {
  readonly #router: Router;

  constructor() {
    const router = new Router();

    super(
      "",

      (route) => {
        router.register(route);
      },
    );

    this.#router = router;
  }

  mount<const Prefix extends string, const Routes extends ModuleRoutes>(
    module: ModuleRef<Prefix, Routes>,
  ): void {
    const routes = getModuleRuntimeRoutes(module);

    for (const route of routes) {
      this.#router.register(route);
    }
  }

  fetch(request: Request): Response | Promise<Response> {
    const pathname = pathnameFromUrl(request.url);

    const matched = this.#router.match(request.method, pathname);

    if (!matched) {
      return new Response(
        "Not Found",

        {
          status: 404,
        },
      );
    }

    const { route, params } = matched;

    /*
     * Critical fast path.
     *
     * Plain routes retain a single
     * execution-plan comparison before
     * direct handler invocation.
     */
    if (route.flags === RUNTIME_ROUTE_PLAIN) {
      const result = route.handler({
        request,
        params,

        query: undefined,

        body: undefined,

        reply: runtimeReply,
      });

      if (isPromiseLike(result)) {
        return Promise.resolve(result).then(normalizeResponse);
      }

      return normalizeResponse(result);
    }

    switch (route.flags) {
      case RUNTIME_ROUTE_INPUT: {
        if (route.input === undefined) {
          throw new Error("Missing Gelis runtime input plan");
        }

        return runInputRoute(
          route,
          route.input,
          request,
          params,
          invokeHandlerRoute,
        );
      }

      case RUNTIME_ROUTE_BEFORE_HANDLE: {
        if (route.beforeHandle === undefined) {
          throw new Error("Missing Gelis beforeHandle hook");
        }

        return invokeBeforeHandleRoute(
          route,
          request,
          params,
          undefined,
          undefined,
        );
      }

      case RUNTIME_ROUTE_INPUT_BEFORE_HANDLE: {
        if (route.input === undefined) {
          throw new Error("Missing Gelis runtime input plan");
        }

        if (route.beforeHandle === undefined) {
          throw new Error("Missing Gelis beforeHandle hook");
        }

        return runInputRoute(
          route,
          route.input,
          request,
          params,
          invokeBeforeHandleRoute,
        );
      }

      default:
        throw new Error("Invalid Gelis runtime route flags");
    }
  }
}

function runInputRoute(
  route: RuntimeRouteRecord,

  input: RuntimeInputPlan,

  request: Request,

  params: Record<string, string>,

  invoke: RuntimeRouteInvoker,
): Response | Promise<Response> {
  switch (input.kind) {
    case RUNTIME_INPUT_QUERY:
      return runQueryRoute(route, input, request, params, invoke);

    case RUNTIME_INPUT_BODY:
      return runBodyRoute(route, input, request, params, undefined, invoke);

    case RUNTIME_INPUT_QUERY_BODY:
      return runQueryBodyRoute(route, input, request, params, invoke);

    default:
      throw new Error("Invalid Gelis runtime input plan");
  }
}

function runQueryRoute(
  route: RuntimeRouteRecord,

  input: RuntimeInputPlan,

  request: Request,

  params: Record<string, string>,

  invoke: RuntimeRouteInvoker,
): Response | Promise<Response> {
  let rawQuery: Record<string, string | string[]>;

  try {
    rawQuery = parseQueryFromUrl(request.url);
  } catch {
    return invalidQueryEncodingResponse();
  }

  const schema = input.query;

  if (!schema) {
    throw new Error("Missing query schema");
  }

  const validation = schema["~standard"].validate(rawQuery);

  if (isPromiseLike(validation)) {
    return Promise.resolve(validation).then((result) => {
      if (result.issues !== undefined) {
        return validationErrorResponse("query", result.issues);
      }

      return invoke(route, request, params, result.value, undefined);
    });
  }

  if (validation.issues !== undefined) {
    return validationErrorResponse("query", validation.issues);
  }

  return invoke(route, request, params, validation.value, undefined);
}

function runBodyRoute(
  route: RuntimeRouteRecord,

  input: RuntimeInputPlan,

  request: Request,

  params: Record<string, string>,

  query: unknown,

  invoke: RuntimeRouteInvoker,
): Response | Promise<Response> {
  const schema = input.body;

  if (!schema) {
    throw new Error("Missing body schema");
  }

  if (!isJsonContentType(request)) {
    return unsupportedMediaTypeResponse();
  }

  return request.json().then(
    (rawBody) => {
      const validation = schema["~standard"].validate(rawBody);

      if (isPromiseLike(validation)) {
        return Promise.resolve(validation).then((result) => {
          if (result.issues !== undefined) {
            return validationErrorResponse("body", result.issues);
          }

          return invoke(route, request, params, query, result.value);
        });
      }

      if (validation.issues !== undefined) {
        return validationErrorResponse("body", validation.issues);
      }

      return invoke(route, request, params, query, validation.value);
    },

    () => malformedJsonResponse(),
  );
}

function runQueryBodyRoute(
  route: RuntimeRouteRecord,

  input: RuntimeInputPlan,

  request: Request,

  params: Record<string, string>,

  invoke: RuntimeRouteInvoker,
): Response | Promise<Response> {
  let rawQuery: Record<string, string | string[]>;

  try {
    rawQuery = parseQueryFromUrl(request.url);
  } catch {
    return invalidQueryEncodingResponse();
  }

  const schema = input.query;

  if (!schema) {
    throw new Error("Missing query schema");
  }

  const validation = schema["~standard"].validate(rawQuery);

  if (isPromiseLike(validation)) {
    return Promise.resolve(validation).then((result) => {
      if (result.issues !== undefined) {
        return validationErrorResponse("query", result.issues);
      }

      return runBodyRoute(route, input, request, params, result.value, invoke);
    });
  }

  if (validation.issues !== undefined) {
    return validationErrorResponse("query", validation.issues);
  }

  return runBodyRoute(route, input, request, params, validation.value, invoke);
}

function invokeHandlerRoute(
  route: RuntimeRouteRecord,

  request: Request,

  params: Record<string, string>,

  query: unknown,

  body: unknown,
): Response | Promise<Response> {
  return invokeHandlerWithContext(route.handler, {
    request,
    params,
    query,
    body,

    reply: runtimeReply,
  });
}

function invokeBeforeHandleRoute(
  route: RuntimeRouteRecord,

  request: Request,

  params: Record<string, string>,

  query: unknown,

  body: unknown,
): Response | Promise<Response> {
  const beforeHandle = route.beforeHandle;

  if (beforeHandle === undefined) {
    throw new Error("Missing Gelis beforeHandle hook");
  }

  const context: RuntimeRouteContext = {
    request,
    params,
    query,
    body,

    reply: runtimeReply,
  };

  const result = beforeHandle(context);

  if (isPromiseLike(result)) {
    return Promise.resolve(result).then((early) => {
      if (early !== undefined) {
        return normalizeResponse(early);
      }

      return invokeHandlerWithContext(route.handler, context);
    });
  }

  if (result !== undefined) {
    return normalizeResponse(result);
  }

  return invokeHandlerWithContext(route.handler, context);
}

function invokeHandlerWithContext(
  handler: RuntimeRouteHandler,

  context: RuntimeRouteContext,
): Response | Promise<Response> {
  const result = handler(context);

  if (isPromiseLike(result)) {
    return Promise.resolve(result).then(normalizeResponse);
  }

  return normalizeResponse(result);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return false;
  }

  return (
    typeof (
      value as {
        then?: unknown;
      }
    ).then === "function"
  );
}
