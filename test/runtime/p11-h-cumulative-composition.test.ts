import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src/app";
import { bodyLimit } from "../../src/body-limit/index";
import {
  generateCookie,
  getCookie,
  setCookie,
} from "../../src/cookie/public";
import { cors } from "../../src/cors/index";
import { requestId } from "../../src/request-id/index";
import { secureHeaders } from "../../src/secure-headers/index";
import { TimeoutError, timeout } from "../../src/timeout/index";

import type { StandardSchemaV1 } from "../../src/schema";

const API_URL = "https://api.example";
const ORIGIN = "https://client.example";
const REQUEST_ID = "p11-h-request-id";

type PolicyOrder = "canonical" | "reverse";

const sleep = (duration: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, duration));

describe("P11-H cumulative application-boundary composition", () => {
  test("preserves successful actual-CORS responses in canonical and reverse registration order", async () => {
    for (const order of ["canonical", "reverse"] as const) {
      const app = new Gelis();
      const { ids } = installBoundaryPolicies(app, order, 1_000);

      app.get(
        "/resource",
        ({ request }) =>
          new Response(ids.get(request) ?? "missing", {
            status: 201,
            statusText: "Created By Handler",
            headers: {
              "Referrer-Policy": "unsafe-url",
              "X-Frame-Options": "DENY",
              "X-Powered-By": "handler",
              "X-Request-Id": "handler-conflict",
              "X-Unrelated": "preserved",
            },
          }),
      );

      const request = new Request(`${API_URL}/resource`, {
        headers: {
          Origin: ORIGIN,
          "X-Request-Id": "untrusted-inbound",
        },
      });
      const response = await app.fetch(request);

      expect(response.status).toBe(201);
      expect(response.statusText).toBe("Created By Handler");
      expect(await response.text()).toBe(REQUEST_ID);
      expect(response.headers.get("x-unrelated")).toBe("preserved");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
      expect(response.headers.get("x-powered-by")).toBeNull();
      expect(request.headers.get("x-request-id")).toBe("untrusted-inbound");
      expectPolicies(response);
      expect(varyTokens(response).filter((value) => value === "origin")).toEqual([
        "origin",
      ]);
    }
  });

  test("short-circuits valid preflight before routing, managed input, and deadline execution", async () => {
    for (const order of ["canonical", "reverse"] as const) {
      let validations = 0;
      let handlers = 0;
      const Body = createTextSchema(() => {
        validations++;
      });
      const app = new Gelis();
      const { deadlines, ids } = installBoundaryPolicies(app, order, 1);

      app.post(
        "/resource",
        {
          body: Body,
          bodyParser: "text",
          bodyLimit: 1,
          timeout: 1,
        },
        () => {
          handlers++;
          return "unexpected";
        },
      );

      const request = new Request(`${API_URL}/resource`, {
        method: "OPTIONS",
        headers: {
          Origin: ORIGIN,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Content-Type",
        },
      });
      const response = await app.fetch(request);

      await sleep(10);

      expect(response.status).toBe(204);
      expect(validations).toBe(0);
      expect(handlers).toBe(0);
      expect(ids.get(request)).toBe(REQUEST_ID);
      expect(deadlines.signal(request).aborted).toBe(false);
      expectPolicies(response);
      expect(response.headers.get("access-control-allow-methods")).toContain(
        "POST",
      );
    }
  });

  test("finalizes 404, 405, implicit HEAD, automatic OPTIONS, and handled errors", async () => {
    const app = new Gelis();
    installBoundaryPolicies(app, "canonical", 1_000);

    app.onError(({ error }) => {
      if (error instanceof Error && error.message === "boom") {
        return new Response("handled", {
          status: 598,
          statusText: "Handled",
          headers: {
            "X-Powered-By": "error-handler",
            "X-Request-Id": "error-handler-conflict",
          },
        });
      }

      return undefined;
    });

    app.get("/resource", () => "payload");
    app.get("/boom", () => {
      throw new Error("boom");
    });

    const withOrigin = (path: string, method?: string) =>
      new Request(`${API_URL}${path}`, {
        ...(method === undefined ? {} : { method }),
        headers: { Origin: ORIGIN },
      });

    const notFound = await app.fetch(withOrigin("/missing"));
    const methodNotAllowed = await app.fetch(withOrigin("/resource", "POST"));
    const head = await app.fetch(withOrigin("/resource", "HEAD"));
    const options = await app.fetch(withOrigin("/resource", "OPTIONS"));
    const handled = await app.fetch(withOrigin("/boom"));

    expect(notFound.status).toBe(404);
    expectPolicies(notFound);

    expect(methodNotAllowed.status).toBe(405);
    expect(methodNotAllowed.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expectPolicies(methodNotAllowed);

    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expectPolicies(head);

    expect(options.status).toBe(204);
    expect(options.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expectPolicies(options);

    expect(handled.status).toBe(598);
    expect(handled.statusText).toBe("Handled");
    expect(await handled.text()).toBe("handled");
    expect(handled.headers.get("x-powered-by")).toBeNull();
    expectPolicies(handled);
  });
});

describe("P11-H cumulative timeout composition", () => {
  test("finalizes the default timeout outcome with CORS, secure headers, and request ID", async () => {
    const app = new Gelis();
    installBoundaryPolicies(app, "reverse", 5);

    app.get("/slow", () => new Promise<Response>(() => {}));

    const response = await app.fetch(
      new Request(`${API_URL}/slow`, {
        headers: { Origin: ORIGIN },
      }),
    );

    expect(response.status).toBe(504);
    expect((await response.json()).error.code).toBe("REQUEST_TIMEOUT");
    expectPolicies(response);
  });

  test("keeps TimeoutError as error authority when user onError handles it", async () => {
    const app = new Gelis();
    installBoundaryPolicies(app, "canonical", 5);

    let seen: TimeoutError | undefined;
    app.onError(({ error }) => {
      if (error instanceof TimeoutError) {
        seen = error;
        return new Response("custom timeout", { status: 598 });
      }

      return undefined;
    });
    app.get("/slow", () => new Promise<Response>(() => {}));

    const response = await app.fetch(
      new Request(`${API_URL}/slow`, {
        headers: { Origin: ORIGIN },
      }),
    );

    expect(seen).toBeInstanceOf(TimeoutError);
    expect(seen?.scope).toBe("application");
    expect(seen?.duration).toBe(5);
    expect(response.status).toBe(598);
    expect(await response.text()).toBe("custom timeout");
    expectPolicies(response);
  });

  test("keeps a timed HEAD response bodyless after cumulative finalization", async () => {
    const app = new Gelis();
    installBoundaryPolicies(app, "canonical", 5);
    app.head("/slow", () => new Promise<Response>(() => {}));

    const response = await app.fetch(
      new Request(`${API_URL}/slow`, {
        method: "HEAD",
        headers: { Origin: ORIGIN },
      }),
    );

    expect(response.status).toBe(504);
    expect(await response.text()).toBe("");
    expectPolicies(response);
  });

  test("does not allow late fulfillment to replace the cumulative timeout outcome", async () => {
    const app = new Gelis();
    installBoundaryPolicies(app, "canonical", 5);

    let resolveLate!: (response: Response) => void;
    const late = new Promise<Response>((resolve) => {
      resolveLate = resolve;
    });

    app.get("/slow", () => late);

    const response = await app.fetch(
      new Request(`${API_URL}/slow`, {
        headers: { Origin: ORIGIN },
      }),
    );

    expect(response.status).toBe(504);
    expectPolicies(response);

    resolveLate(new Response("late", { status: 201 }));
    await sleep(10);

    expect(response.status).toBe(504);
  });

  test("observes late rejection after cumulative timeout without an unhandled rejection", async () => {
    const app = new Gelis();
    installBoundaryPolicies(app, "canonical", 5);

    let rejectLate!: (error: Error) => void;
    const late = new Promise<Response>((_resolve, reject) => {
      rejectLate = reject;
    });
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };

    process.on("unhandledRejection", onUnhandled);

    try {
      app.get("/slow", () => late);

      const response = await app.fetch(
        new Request(`${API_URL}/slow`, {
          headers: { Origin: ORIGIN },
        }),
      );

      expect(response.status).toBe(504);
      expectPolicies(response);

      rejectLate(new Error("late-cumulative-rejection"));
      await sleep(20);

      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  test("preserves incoming abort reason instead of relabeling it as TimeoutError", async () => {
    const controller = new AbortController();
    const app = new Gelis();
    const { deadlines } = installBoundaryPolicies(app, "reverse", 100);
    let seenSignal: AbortSignal | undefined;

    app.get("/abort", ({ request }) => {
      const signal = deadlines.signal(request);
      seenSignal = signal;

      return new Promise<Response>((resolve) => {
        signal.addEventListener(
          "abort",
          () => resolve(new Response("client-abort", { status: 499 })),
          { once: true },
        );
      });
    });

    const request = new Request(`${API_URL}/abort`, {
      headers: { Origin: ORIGIN },
      signal: controller.signal,
    });
    const pending = app.fetch(request);

    controller.abort("client-disconnect");

    const response = await pending;

    expect(response.status).toBe(499);
    expect(await response.text()).toBe("client-abort");
    expect(seenSignal?.aborted).toBe(true);
    expect(seenSignal?.reason).toBe("client-disconnect");
    expect(seenSignal?.reason).not.toBeInstanceOf(TimeoutError);
    expectPolicies(response);
  });
});

describe("P11-H cumulative body-limit composition", () => {
  test("returns policy-finalized 413 before validation and handler execution", async () => {
    let validations = 0;
    let handlers = 0;
    const Body = createTextSchema(() => {
      validations++;
    });
    const app = new Gelis();

    installBoundaryPolicies(app, "canonical", 1_000);
    app.use(bodyLimit({ maxBytes: 4 }));
    app.post(
      "/limited",
      {
        body: Body,
        bodyParser: "text",
        bodyLimit: 2,
        timeout: 500,
      },
      ({ body }) => {
        handlers++;
        return body;
      },
    );

    const response = await app.fetch(textRequest("/limited", "abc"));

    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe("BODY_TOO_LARGE");
    expect(validations).toBe(0);
    expect(handlers).toBe(0);
    expectPolicies(response);
  });

  test("never lets a looser route limit extend the application ceiling", async () => {
    const Body = createTextSchema();
    const app = new Gelis();

    installBoundaryPolicies(app, "canonical", 1_000);
    app.use(bodyLimit({ maxBytes: 3 }));
    app.post(
      "/limited",
      {
        body: Body,
        bodyParser: "text",
        bodyLimit: 8,
        timeout: 500,
      },
      ({ body }) => body,
    );

    const response = await app.fetch(textRequest("/limited", "abcd"));

    expect(response.status).toBe(413);
    expectPolicies(response);
  });

  test("keeps actual-byte enforcement authoritative for forged Content-Length", async () => {
    let validations = 0;
    let handlers = 0;
    const Body = createTextSchema(() => {
      validations++;
    });
    const app = new Gelis();

    installBoundaryPolicies(app, "canonical", 1_000);
    app.use(bodyLimit({ maxBytes: 3 }));
    app.post(
      "/limited",
      {
        body: Body,
        bodyParser: "text",
        timeout: 500,
      },
      ({ body }) => {
        handlers++;
        return body;
      },
    );

    const request = streamedTextRequest("/limited", ["ab", "cd"], "1");
    const response = await app.fetch(request);

    expect(response.status).toBe(413);
    expect(validations).toBe(0);
    expect(handlers).toBe(0);
    expect(request.bodyUsed).toBe(true);
    expectPolicies(response);
  });
});

describe("P11-H cumulative cookie and security composition", () => {
  test("preserves cookie parsing and multiple Set-Cookie through response finalization", async () => {
    const app = new Gelis();
    installBoundaryPolicies(app, "canonical", 1_000);

    app.get("/cookies", ({ request }) => {
      const headers = new Headers({
        "X-Unrelated": "preserved",
      });
      setCookie(headers, "first", "1");
      setCookie(headers, "__Host-session", "secure", {
        secure: true,
        path: "/",
      });

      return new Response(getCookie(request, "theme") ?? "missing", {
        headers,
      });
    });

    const response = await app.fetch(
      new Request(`${API_URL}/cookies`, {
        headers: {
          Cookie: "\u00A0theme=attacker; theme=dark",
          Origin: ORIGIN,
        },
      }),
    );

    const cookies = readSetCookies(response.headers);

    expect(await response.text()).toBe("dark");
    expect(response.headers.get("x-unrelated")).toBe("preserved");
    expect(cookies).toHaveLength(2);
    expect(cookies.some((value) => value.includes("first=1; Path=/"))).toBe(
      true,
    );
    expect(
      cookies.some((value) =>
        value.includes("__Host-session=secure; Path=/; Secure"),
      ),
    ).toBe(true);
    expectPolicies(response);
  });

  test("keeps cookie prefix and header-injection protections fail-closed", () => {
    const dynamicSecureName: string = "__Secure-session";

    expect(() => generateCookie(dynamicSecureName, "value")).toThrow(TypeError);
    expect(() =>
      generateCookie("session", "value", {
        path: "/\r\nX-Injected: yes",
      }),
    ).toThrow(TypeError);
  });

  test("keeps malformed CORS input closed while other response policies still finalize", async () => {
    const app = new Gelis();
    installBoundaryPolicies(app, "reverse", 1_000);
    app.get(
      "/resource",
      () =>
        new Response("ok", {
          headers: {
            "Referrer-Policy": "unsafe-url",
            "X-Request-Id": "handler-conflict",
          },
        }),
    );

    const request = new Request(`${API_URL}/resource`, {
      headers: {
        Origin: "https://client.example/path",
        "X-Request-Id": "attacker-controlled",
      },
    });
    const response = await app.fetch(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("vary")).toContain("Origin");
    expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
    expect(request.headers.get("x-request-id")).toBe("attacker-controlled");
    expectDefaultSecurityHeaders(response);
  });
});

function installBoundaryPolicies(
  app: Gelis,
  order: PolicyOrder,
  timeoutDuration: number,
) {
  const ids = requestId({
    generator: () => REQUEST_ID,
  });
  const deadlines = timeout({ duration: timeoutDuration });

  if (order === "canonical") {
    app.use(cors({ origin: ORIGIN }));
    app.use(secureHeaders());
    app.use(ids);
    app.use(deadlines);
  } else {
    app.use(deadlines);
    app.use(ids);
    app.use(secureHeaders());
    app.use(cors({ origin: ORIGIN }));
  }

  return { ids, deadlines };
}

function expectPolicies(response: Response): void {
  expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
  expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
  expectDefaultSecurityHeaders(response);
}

function expectDefaultSecurityHeaders(response: Response): void {
  expect(response.headers.get("strict-transport-security")).toBe(
    "max-age=31536000",
  );
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  expect(response.headers.get("x-xss-protection")).toBe("0");
}

function varyTokens(response: Response): string[] {
  return (response.headers.get("vary") ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length !== 0);
}

function createTextSchema(
  onValidate?: () => void,
): StandardSchemaV1<unknown, string> {
  return {
    "~standard": {
      version: 1,
      vendor: "gelis-p11-h-test",
      validate(value) {
        onValidate?.();

        if (typeof value !== "string") {
          return {
            issues: [{ message: "Expected string" }],
          };
        }

        return { value };
      },
    },
  };
}

function textRequest(path: string, body: string): Request {
  return new Request(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "text/plain",
      Origin: ORIGIN,
    },
    body,
  });
}

function streamedTextRequest(
  path: string,
  chunks: readonly string[],
  contentLength: string,
): Request {
  const encoder = new TextEncoder();
  const encoded = chunks.map((chunk) => encoder.encode(chunk));
  let index = 0;

  return new Request(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "content-length": contentLength,
      "content-type": "text/plain",
      Origin: ORIGIN,
    },
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = encoded[index];

        if (chunk === undefined) {
          controller.close();
          return;
        }

        index++;
        controller.enqueue(chunk);
      },
    }),
  });
}

function readSetCookies(headers: Headers): string[] {
  const extended = headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof extended.getSetCookie === "function") {
    return extended.getSetCookie();
  }

  const combined = headers.get("set-cookie");
  if (combined === null) {
    return [];
  }

  return combined.split(/,\s*(?=[^;,\s]+=)/u);
}
