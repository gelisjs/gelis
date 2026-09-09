import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";

import type { StandardSchemaV1 } from "../../src";

describe("Gelis text request body reader", () => {
  test("parses and validates text/plain", async () => {
    const Body = createSchema<string, string>((value) => {
      if (typeof value !== "string") {
        return {
          issues: [
            {
              message: "body must be text",
            },
          ],
        };
      }

      return {
        value: value.trim(),
      };
    });

    const app = new Gelis();

    app.post(
      "/message",
      {
        body: Body,
        bodyParser: "text",
      },
      ({ body }) => body,
    );

    const response = await app.fetch(
      new Request("http://gelis.test/message", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
        },
        body: "  Gelis  ",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Gelis");
  });

  test("accepts text/plain parameters and keeps Web text decoding semantics", async () => {
    const Body = createSchema<string>((value) => ({
      value: value as string,
    }));

    const app = new Gelis();

    app.post(
      "/message",
      {
        body: Body,
        bodyParser: "text",
      },
      ({ body }) => body,
    );

    const response = await app.fetch(
      new Request("http://gelis.test/message", {
        method: "POST",
        headers: {
          "content-type": "Text/Plain; charset=iso-8859-1",
        },
        body: "hello",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("hello");
  });

  test("returns an empty string for an empty text body", async () => {
    const Body = createSchema<string>((value) => ({
      value: value as string,
    }));

    const app = new Gelis();

    app.post(
      "/empty",
      {
        body: Body,
        bodyParser: "text",
      },
      ({ body }) => body,
    );

    const response = await app.fetch(
      new Request("http://gelis.test/empty", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
        },
        body: "",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  test("text default does not accept text/csv", async () => {
    const Body = createSchema<string>((value) => ({
      value: value as string,
    }));

    const app = new Gelis();

    app.post(
      "/message",
      {
        body: Body,
        bodyParser: "text",
      },
      ({ body }) => body,
    );

    const response = await app.fetch(
      new Request("http://gelis.test/message", {
        method: "POST",
        headers: {
          "content-type": "text/csv",
        },
        body: "a,b",
      }),
    );

    expect(response.status).toBe(415);
  });

  test("custom text media types replace the text/plain default", async () => {
    const Body = createSchema<string>((value) => ({
      value: value as string,
    }));

    const app = new Gelis();

    app.post(
      "/vendor-text",
      {
        body: Body,
        bodyParser: "text",
        bodyContentTypes: ["application/vnd.gelis-text"],
      },
      ({ body }) => body,
    );

    const customResponse = await app.fetch(
      new Request("http://gelis.test/vendor-text", {
        method: "POST",
        headers: {
          "content-type": "Application/Vnd.Gelis-Text; charset=utf-8",
        },
        body: "hello",
      }),
    );

    expect(customResponse.status).toBe(200);
    expect(await customResponse.text()).toBe("hello");

    const defaultResponse = await app.fetch(
      new Request("http://gelis.test/vendor-text", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
        },
        body: "hello",
      }),
    );

    expect(defaultResponse.status).toBe(415);
  });

  test("returns 415 when Content-Type is missing", async () => {
    const Body = createSchema<string>((value) => ({
      value: value as string,
    }));

    const app = new Gelis();

    app.post(
      "/message",
      {
        body: Body,
        bodyParser: "text",
      },
      ({ body }) => body,
    );

    const request = {
      method: "POST",
      url: "http://gelis.test/message",
      headers: {
        get() {
          return null;
        },
      },
      text() {
        return Promise.resolve("hello");
      },
    } as unknown as Request;

    const response = await app.fetch(request);

    expect(response.status).toBe(415);
  });

  test("rejects ambiguous combined Content-Type", async () => {
    const Body = createSchema<string>((value) => ({
      value: value as string,
    }));

    const app = new Gelis();

    app.post(
      "/message",
      {
        body: Body,
        bodyParser: "text",
      },
      ({ body }) => body,
    );

    const request = {
      method: "POST",
      url: "http://gelis.test/message",
      headers: {
        get(name: string) {
          return name.toLowerCase() === "content-type"
            ? "text/plain, application/json"
            : null;
        },
      },
      text() {
        return Promise.resolve("hello");
      },
    } as unknown as Request;

    const response = await app.fetch(request);

    expect(response.status).toBe(415);
  });

  test("keeps commas inside quoted Content-Type parameters non-ambiguous", async () => {
    const Body = createSchema<string>((value) => ({
      value: value as string,
    }));

    const app = new Gelis();

    app.post(
      "/message",
      {
        body: Body,
        bodyParser: "text",
      },
      ({ body }) => body,
    );

    const request = {
      method: "POST",
      url: "http://gelis.test/message",
      headers: {
        get(name: string) {
          return name.toLowerCase() === "content-type"
            ? 'text/plain; note="a,b"'
            : null;
        },
      },
      text() {
        return Promise.resolve("hello");
      },
    } as unknown as Request;

    const response = await app.fetch(request);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("hello");
  });

  test("returns 422 when text schema validation fails", async () => {
    const Body = createSchema<string>(() => ({
      issues: [
        {
          message: "message is invalid",
          path: ["message"],
        },
      ],
    }));

    const app = new Gelis();

    app.post(
      "/message",
      {
        body: Body,
        bodyParser: "text",
      },
      () => "never",
    );

    const response = await app.fetch(
      new Request("http://gelis.test/message", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
        },
        body: "hello",
      }),
    );

    expect(response.status).toBe(422);

    expect(await response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        target: "body",
        issues: [
          {
            message: "message is invalid",
            path: ["message"],
          },
        ],
      },
    });
  });

  test("validates query before passing decoded text to the handler", async () => {
    const Query = createSchema<
      Record<string, string | string[]>,
      { id: number }
    >((value) => {
      const query = value as Record<string, string>;

      return {
        value: {
          id: Number(query.id),
        },
      };
    });

    const Body = createSchema<string>((value) => ({
      value: value as string,
    }));

    const app = new Gelis();

    app.post(
      "/combined",
      {
        query: Query,
        body: Body,
        bodyParser: "text",
      },
      ({ query, body }) => `${query.id}:${body}`,
    );

    const response = await app.fetch(
      new Request("http://gelis.test/combined?id=42", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
        },
        body: "hello",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("42:hello");
  });

  test("maps Request.text rejection to 400", async () => {
    const Body = createSchema<string>((value) => ({
      value: value as string,
    }));

    const app = new Gelis();

    app.post(
      "/message",
      {
        body: Body,
        bodyParser: "text",
      },
      ({ body }) => body,
    );

    const request = {
      method: "POST",
      url: "http://gelis.test/message",
      headers: {
        get(name: string) {
          return name.toLowerCase() === "content-type" ? "text/plain" : null;
        },
      },
      text() {
        return Promise.reject(new TypeError("body unavailable"));
      },
    } as unknown as Request;

    const response = await app.fetch(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "MALFORMED_BODY",
        message: "Malformed request body",
      },
    });
  });

  test("still rejects later P9-E3 parsers", () => {
    const Body = createSchema((value) => ({
      value,
    }));

    for (const bodyParser of ["multipart"] as const) {
      const app = new Gelis();

      expect(() => {
        app.post(
          `/${bodyParser}`,
          {
            body: Body,
            bodyParser,
          },
          ({ body }) => body,
        );
      }).toThrow(TypeError);
    }
  });
});

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
