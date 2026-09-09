import { ALL_ROUTE_METHOD } from "../http-method";

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
