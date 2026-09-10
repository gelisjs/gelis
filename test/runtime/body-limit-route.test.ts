import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";

import type { StandardSchemaV1 } from "../../src";

describe("Gelis route body-limit specialization", () => {
  test("requires a managed body schema", () => {
    const app = new Gelis();

    expect(() => {
      app.post(
        "/raw",
        {
          bodyLimit: 16,
        },
        () => "never",
      );
    }).toThrow(TypeError);
  });

  test("rejects invalid route limits synchronously", () => {
    const Body = createSchema((value) => ({ value }));

    for (const bodyLimit of [
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      const app = new Gelis();

      expect(() => {
        app.post(
          "/body",
          {
            body: Body,
            bodyLimit,
          },
          ({ body }) => body,
        );
      }).toThrow(TypeError);
    }
  });

  test("accepts JSON below and exactly at the route limit", async () => {
    const Body = createSchema((value) => ({ value }));
    const app = new Gelis();

    app.post(
      "/below",
      {
        body: Body,
        bodyLimit: 3,
      },
      ({ body }) => body,
    );

    app.post(
      "/equal",
      {
        body: Body,
        bodyLimit: 2,
      },
      ({ body }) => body,
    );

    const below = await app.fetch(jsonRequest("/below", "0"));
    const equal = await app.fetch(jsonRequest("/equal", "{}"));

    expect(below.status).toBe(200);
    expect(await below.json()).toBe(0);

    expect(equal.status).toBe(200);
    expect(await equal.json()).toEqual({});
  });

  test("returns 413 before schema validation and handler execution", async () => {
    let validations = 0;
    let handlers = 0;

    const Body = createSchema((value) => {
      validations++;

      return {
        value,
      };
    });

    const app = new Gelis();

    app.post(
      "/body",
      {
        body: Body,
        bodyLimit: 1,
      },
      ({ body }) => {
        handlers++;
        return body;
      },
    );

    const response = await app.fetch(jsonRequest("/body", "10"));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: {
        code: "BODY_TOO_LARGE",
        message: "Request body exceeds the configured limit",
      },
    });
    expect(validations).toBe(0);
    expect(handlers).toBe(0);
  });

  test("keeps malformed within-limit JSON at 400", async () => {
    const Body = createSchema((value) => ({ value }));
    const app = new Gelis();

    app.post(
      "/body",
      {
        body: Body,
        bodyLimit: 16,
      },
      ({ body }) => body,
    );

    const response = await app.fetch(jsonRequest("/body", "{broken"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "MALFORMED_JSON",
        message: "Malformed JSON request body",
      },
    });
  });

  test("checks media type before consuming an oversized body", async () => {
    const Body = createSchema((value) => ({ value }));
    const app = new Gelis();

    app.post(
      "/body",
      {
        body: Body,
        bodyLimit: 1,
      },
      ({ body }) => body,
    );

    const request = new Request("http://gelis.test/body", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
      },
      body: "oversized",
    });

    const result = app.fetch(request);

    expect(result).toBeInstanceOf(Response);

    const response = await result;

    expect(response.status).toBe(415);
    expect(request.bodyUsed).toBe(false);
  });

  test("supports limited custom JSON media types", async () => {
    const Body = createSchema((value) => ({ value }));
    const app = new Gelis();

    app.post(
      "/vendor",
      {
        body: Body,
        bodyParser: "json",
        bodyContentTypes: ["application/vnd.gelis+json"],
        bodyLimit: 8,
      },
      ({ body }) => body,
    );

    const response = await app.fetch(
      new Request("http://gelis.test/vendor", {
        method: "POST",
        headers: {
          "content-type": "application/vnd.gelis+json",
        },
        body: "{}",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
  });

  test("specializes text body reads without changing their decoded value", async () => {
    const Body = createSchema<string>((value) => ({
      value: value as string,
    }));
    const app = new Gelis();

    app.post(
      "/text",
      {
        body: Body,
        bodyParser: "text",
        bodyLimit: 3,
      },
      ({ body }) => body,
    );

    const accepted = await app.fetch(
      new Request("http://gelis.test/text", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
        },
        body: "abc",
      }),
    );

    const rejected = await app.fetch(
      new Request("http://gelis.test/text", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
        },
        body: "abcd",
      }),
    );

    expect(await accepted.text()).toBe("abc");
    expect(rejected.status).toBe(413);
  });
});

function jsonRequest(path: string, body: string): Request {
  return new Request(`http://gelis.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body,
  });
}

function createSchema<Input = unknown, Output = Input>(
  validate: StandardSchemaV1.Props<Input, Output>["validate"],
): StandardSchemaV1<Input, Output> {
  return {
    "~standard": {
      version: 1,
      vendor: "gelis-test",
      validate,
    },
  };
}
