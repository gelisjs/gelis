import { describe, expect, test } from "bun:test";

import { Gelis, defineModule } from "../../src";
import { bodyLimit } from "../../src/body-limit";
import { cors } from "../../src/cors";
import { requestId } from "../../src/request-id";
import { secureHeaders } from "../../src/secure-headers";
import { timeout } from "../../src/timeout";

const ORIGIN = "https://client.example";

const textSchema = {
  "~standard": {
    version: 1 as const,
    vendor: "gelis-g7-test",
    validate(value: unknown) {
      return typeof value === "string"
        ? { value }
        : { issues: [{ message: "Expected string" }] };
    },
  },
};

function neverResponse(): Promise<Response> {
  return new Promise<Response>(() => undefined);
}

describe("P11-G7 timeout owner consistency", () => {
  test("rejects distinct route-only timeout owners before mutating the router", async () => {
    const first = timeout();
    const second = timeout();
    const app = new Gelis();

    app.get("/first", { timeout: first.route(50) }, () => "first");

    expect(() =>
      app.get("/second", { timeout: second.route(50) }, () => "second"),
    ).toThrow("distinct route execution boundary owners");

    const firstResponse = await app.fetch(
      new Request("https://api.example/first"),
    );
    const rejectedResponse = await app.fetch(
      new Request("https://api.example/second"),
    );

    expect(firstResponse.status).toBe(200);
    expect(await firstResponse.text()).toBe("first");
    expect(rejectedResponse.status).toBe(404);
  });

  test("prevalidates mixed timeout owners across an atomic module batch", async () => {
    const first = timeout();
    const second = timeout();
    const app = new Gelis();

    app.get("/existing", { timeout: first.route(50) }, () => "existing");

    const module = defineModule("/batch", (route) => ({
      sameOwner: route.get("/same", { timeout: first.route(50) }, () => "same"),
      foreignOwner: route.get(
        "/foreign",
        { timeout: second.route(50) },
        () => "foreign",
      ),
    }));

    expect(() => app.mount(module)).toThrow(
      "distinct route execution boundary owners",
    );

    const sameResponse = await app.fetch(
      new Request("https://api.example/batch/same"),
    );
    const foreignResponse = await app.fetch(
      new Request("https://api.example/batch/foreign"),
    );
    const existingResponse = await app.fetch(
      new Request("https://api.example/existing"),
    );

    expect(sameResponse.status).toBe(404);
    expect(foreignResponse.status).toBe(404);
    expect(existingResponse.status).toBe(200);
  });

  test("keeps reverse-order route/application owner rejection transactional", async () => {
    const first = timeout();
    const foreign = timeout({ duration: 50 });
    const app = new Gelis();

    app.get("/resource", { timeout: first.route(50) }, () => "ok");

    expect(() => app.use(foreign)).toThrow(
      "distinct timeout capability owners",
    );

    app.use(first);

    const response = await app.fetch(
      new Request("https://api.example/resource"),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  test("allows one timeout capability and route policy to be reused across applications", async () => {
    const deadlines = timeout({ duration: 100 });
    const routeDeadline = deadlines.route(50);
    const first = new Gelis();
    const second = new Gelis();

    first.use(deadlines);
    second.use(deadlines);
    first.get("/resource", { timeout: routeDeadline }, () => "first");
    second.get("/resource", { timeout: routeDeadline }, () => "second");

    const firstResponse = await first.fetch(
      new Request("https://first.example/resource"),
    );
    const secondResponse = await second.fetch(
      new Request("https://second.example/resource"),
    );

    expect(await firstResponse.text()).toBe("first");
    expect(await secondResponse.text()).toBe("second");
  });
});

describe("P11-G7 request ID finalization coverage", () => {
  test("propagates request ID across 404, 405, implicit HEAD, and automatic OPTIONS", async () => {
    const ids = requestId({ generator: () => "g7-protocol-id" });
    const app = new Gelis();

    app.use(ids);
    app.get("/resource", () => "resource");

    const missing = await app.fetch(new Request("https://api.example/missing"));
    const methodMiss = await app.fetch(
      new Request("https://api.example/resource", { method: "POST" }),
    );
    const head = await app.fetch(
      new Request("https://api.example/resource", { method: "HEAD" }),
    );
    const options = await app.fetch(
      new Request("https://api.example/resource", { method: "OPTIONS" }),
    );

    expect(missing.status).toBe(404);
    expect(methodMiss.status).toBe(405);
    expect(head.status).toBe(200);
    expect(options.status).toBe(204);

    for (const response of [missing, methodMiss, head, options]) {
      expect(response.headers.get("x-request-id")).toBe("g7-protocol-id");
    }

    expect(await head.text()).toBe("");
  });

  test("propagates request ID across a CORS preflight regardless of install order", async () => {
    const ids = requestId({ generator: () => "g7-preflight-id" });
    const app = new Gelis();

    app.use(cors({ origin: ORIGIN }));
    app.use(ids);
    app.get("/resource", () => "resource");

    const response = await app.fetch(
      new Request("https://api.example/resource", {
        method: "OPTIONS",
        headers: {
          Origin: ORIGIN,
          "Access-Control-Request-Method": "GET",
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(response.headers.get("x-request-id")).toBe("g7-preflight-id");
  });

  test("propagates request ID onto a body-limit early response", async () => {
    const ids = requestId({ generator: () => "g7-body-limit-id" });
    const app = new Gelis();

    app.use(bodyLimit({ maxBytes: 1 }));
    app.use(ids);
    app.post(
      "/body",
      { body: textSchema, bodyParser: "text" },
      () => "must not run",
    );

    const response = await app.fetch(
      new Request("https://api.example/body", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "ab",
      }),
    );

    expect(response.status).toBe(413);
    expect(response.headers.get("x-request-id")).toBe("g7-body-limit-id");
  });
});

describe("P11-G7 timeout terminal composition", () => {
  test("routes an asynchronous onTimeout rejection through onError and final response policies", async () => {
    const failure = new Error("async timeout policy failed");
    const ids = requestId({ generator: () => "g7-timeout-error-id" });
    const deadlines = timeout({
      duration: 5,
      async onTimeout() {
        await Promise.resolve();
        throw failure;
      },
    });
    const app = new Gelis();

    app.use(secureHeaders());
    app.use(deadlines);
    app.use(cors({ origin: ORIGIN }));
    app.use(ids);

    app.onError(({ error }) => {
      expect(error).toBe(failure);
      return new Response("handled", { status: 598 });
    });

    app.get("/slow", neverResponse);

    const response = await app.fetch(
      new Request("https://api.example/slow", {
        headers: { Origin: ORIGIN },
      }),
    );

    expect(response.status).toBe(598);
    expect(await response.text()).toBe("handled");
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-request-id")).toBe("g7-timeout-error-id");
  });

  test("keeps the selected timeout response when cooperative work rejects late", async () => {
    const lateFailure = new Error("late execution failure");
    const deadlines = timeout({ duration: 5 });
    const app = new Gelis();
    let lateRejectionReached = false;

    app.use(deadlines);
    app.get("/late", async ({ request }) => {
      const signal = deadlines.signal(request)!;

      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve(), { once: true });
      });

      lateRejectionReached = true;
      throw lateFailure;
    });

    const response = await app.fetch(new Request("https://api.example/late"));

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("Service Unavailable");

    await Promise.resolve();
    expect(lateRejectionReached).toBe(true);
  });
});
