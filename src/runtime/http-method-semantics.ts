import { ALL_ROUTE_METHOD } from "../http-method";

export const GELIS_METHOD_MISS_ALL_ROUTE = Symbol(
  "gelis.internal.method-miss.all-route",
);

type MethodMissResponse = Response & {
  readonly [GELIS_METHOD_MISS_ALL_ROUTE]?: true;
};

export function buildAllowHeader(
  methods: readonly string[],
): string | undefined {
  let hasHead = false;

  let hasOptions = false;

  let advertisedMethods = 0;

  for (const method of methods) {
    if (method === ALL_ROUTE_METHOD) {
      continue;
    }

    advertisedMethods++;

    if (method === "HEAD") {
      hasHead = true;
    } else if (method === "OPTIONS") {
      hasOptions = true;
    }
  }

  if (advertisedMethods === 0) {
    return undefined;
  }

  const allow: string[] = [];

  for (const method of methods) {
    if (method === ALL_ROUTE_METHOD) {
      continue;
    }

    allow.push(method);

    if (method === "GET" && !hasHead) {
      allow.push("HEAD");
    }
  }

  if (!hasOptions) {
    allow.push("OPTIONS");
  }

  return allow.join(", ");
}

export function createAutomaticOptionsResponse(
  methods: readonly string[],
): Response | undefined {
  const allow = buildAllowHeader(methods);

  if (allow === undefined) {
    return undefined;
  }

  return new Response(
    null,

    {
      status: 204,

      headers: {
        allow,
      },
    },
  );
}

export function createMethodNotAllowedResponse(
  methods: readonly string[],
): Response | undefined {
  const allow = buildAllowHeader(methods);
  const hasAllRoute = methods.includes(ALL_ROUTE_METHOD);

  /*
   * With an ordinary Fetch request, an ALL route prevents a method miss.
   * The allow-less branch is therefore reachable only by internal or
   * otherwise non-Fetch dispatch (for example the P11 CONNECT topology
   * probe). Keeping the ALL marker off wire headers preserves P9 semantics.
   */
  if (allow === undefined && !hasAllRoute) {
    return undefined;
  }

  const response: MethodMissResponse = new Response(
    "Method Not Allowed",

    {
      status: 405,

      headers:
        allow === undefined
          ? undefined
          : {
              allow,
            },
    },
  );

  if (hasAllRoute) {
    Object.defineProperty(response, GELIS_METHOD_MISS_ALL_ROUTE, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: true,
    });
  }

  return response;
}

export function methodMissIncludesAllRoute(response: Response): boolean {
  return (response as MethodMissResponse)[GELIS_METHOD_MISS_ALL_ROUTE] === true;
}
