import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";

import type { StandardSchemaV1 } from "../../src";

describe("Gelis arrayBuffer request body reader", () => {
  test("preserves exact application/octet-stream bytes", async () => {
    const Body = createSchema<ArrayBuffer, number[]>((value) => {
      if (!(value instanceof ArrayBuffer)) {
        return {
          issues: [
            {
              message: "body must be an ArrayBuffer",
            },
          ],
        };
      }

      return {
        value: Array.from(new Uint8Array(value)),
      };
    });

    const app = new Gelis();

    app.post(
      "/binary",
      {
        body: Body,
        bodyParser: "arrayBuffer",
      },
      ({ body }) => body,
    );

    const response = await app.fetch(
      new Request("http://gelis.test/binary", {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
        },
        body: new Uint8Array([0, 1, 2, 127, 128, 255]),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([0, 1, 2, 127, 128, 255]);
  });

  test("accepts application/octet-stream parameters case-insensitively", async () => {
    const Body = createSchema<ArrayBuffer, number>((value) => ({
      value: (value as ArrayBuffer).byteLength,
    }));

    const app = new Gelis();

    app.post(
      "/binary",
      {
        body: Body,
        bodyParser: "arrayBuffer",
      },
      ({ body }) => ({ byteLength: body }),
    );

    const response = await app.fetch(
      new Request("http://gelis.test/binary", {
        method: "POST",
        headers: {
          "content-type": "Application/Octet-Stream; profile=v1",
        },
        body: new Uint8Array([1, 2, 3]),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ byteLength: 3 });
  });

  test("returns a zero-length ArrayBuffer for an empty body", async () => {
    const Body = createSchema<ArrayBuffer, number>((value) => ({
      value: (value as ArrayBuffer).byteLength,
    }));

    const app = new Gelis();

    app.post(
      "/empty",
      {
        body: Body,
        bodyParser: "arrayBuffer",
      },
      ({ body }) => ({ byteLength: body }),
    );

    const request = {
      method: "POST",
      url: "http://gelis.test/empty",
      headers: {
        get(name: string) {
          return name.toLowerCase() === "content-type"
            ? "application/octet-stream"
            : null;
        },
      },
      arrayBuffer() {
        return Promise.resolve(new ArrayBuffer(0));
      },
    } as unknown as Request;

    const response = await app.fetch(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ byteLength: 0 });
  });

  test("arrayBuffer default does not accept other media types", async () => {
    const Body = createSchema<ArrayBuffer>((value) => ({
      value: value as ArrayBuffer,
    }));

    const app = new Gelis();

    app.post(
      "/binary",
      {
        body: Body,
        bodyParser: "arrayBuffer",
      },
      () => "never",
    );

    const response = await app.fetch(
      new Request("http://gelis.test/binary", {
        method: "POST",
        headers: {
          "content-type": "application/pdf",
        },
        body: new Uint8Array([1, 2, 3]),
      }),
    );

    expect(response.status).toBe(415);
  });

  test("custom binary media types replace application/octet-stream", async () => {
    const Body = createSchema<ArrayBuffer, number[]>((value) => ({
      value: Array.from(new Uint8Array(value as ArrayBuffer)),
    }));

    const app = new Gelis();

    app.post(
      "/pdf",
      {
        body: Body,
        bodyParser: "arrayBuffer",
        bodyContentTypes: ["application/pdf"],
      },
      ({ body }) => body,
    );

    const customResponse = await app.fetch(
      new Request("http://gelis.test/pdf", {
        method: "POST",
        headers: {
          "content-type": "Application/Pdf; version=1",
        },
        body: new Uint8Array([37, 80, 68, 70]),
      }),
    );

    expect(customResponse.status).toBe(200);
    expect(await customResponse.json()).toEqual([37, 80, 68, 70]);

    const defaultResponse = await app.fetch(
      new Request("http://gelis.test/pdf", {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
        },
        body: new Uint8Array([37, 80, 68, 70]),
      }),
    );

    expect(defaultResponse.status).toBe(415);
  });

  test("returns 415 when Content-Type is missing", async () => {
    const Body = createSchema<ArrayBuffer>((value) => ({
      value: value as ArrayBuffer,
    }));

    const app = new Gelis();

    app.post(
      "/binary",
      {
        body: Body,
        bodyParser: "arrayBuffer",
      },
      () => "never",
    );

    const request = {
      method: "POST",
      url: "http://gelis.test/binary",
      headers: {
        get() {
          return null;
        },
      },
      arrayBuffer() {
        return Promise.resolve(new ArrayBuffer(0));
      },
    } as unknown as Request;

    const response = await app.fetch(request);

    expect(response.status).toBe(415);
  });

  test("rejects ambiguous combined Content-Type", async () => {
    const Body = createSchema<ArrayBuffer>((value) => ({
      value: value as ArrayBuffer,
    }));

    const app = new Gelis();

    app.post(
      "/binary",
      {
        body: Body,
        bodyParser: "arrayBuffer",
      },
      () => "never",
    );

    const request = {
      method: "POST",
      url: "http://gelis.test/binary",
      headers: {
        get(name: string) {
          return name.toLowerCase() === "content-type"
            ? "application/octet-stream, application/pdf"
            : null;
        },
      },
      arrayBuffer() {
        return Promise.resolve(new ArrayBuffer(0));
      },
    } as unknown as Request;

    const response = await app.fetch(request);

    expect(response.status).toBe(415);
  });

  test("keeps commas inside quoted Content-Type parameters non-ambiguous", async () => {
    const Body = createSchema<ArrayBuffer, number>((value) => ({
      value: (value as ArrayBuffer).byteLength,
    }));

    const app = new Gelis();

    app.post(
      "/binary",
      {
        body: Body,
        bodyParser: "arrayBuffer",
      },
      ({ body }) => ({ byteLength: body }),
    );

    const request = {
      method: "POST",
      url: "http://gelis.test/binary",
      headers: {
        get(name: string) {
          return name.toLowerCase() === "content-type"
            ? 'application/octet-stream; note="a,b"'
            : null;
        },
      },
      arrayBuffer() {
        return Promise.resolve(new Uint8Array([1, 2]).buffer);
      },
    } as unknown as Request;

    const response = await app.fetch(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ byteLength: 2 });
  });

  test("returns 422 when binary schema validation fails", async () => {
    const Body = createSchema<ArrayBuffer>(() => ({
      issues: [
        {
          message: "binary payload is invalid",
          path: ["payload"],
        },
      ],
    }));

    const app = new Gelis();

    app.post(
      "/binary",
      {
        body: Body,
        bodyParser: "arrayBuffer",
      },
      () => "never",
    );

    const response = await app.fetch(
      new Request("http://gelis.test/binary", {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
        },
        body: new Uint8Array([1]),
      }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        target: "body",
        issues: [
          {
            message: "binary payload is invalid",
            path: ["payload"],
          },
        ],
      },
    });
  });

  test("validates query before passing decoded bytes to the handler", async () => {
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

    const Body = createSchema<ArrayBuffer, number>((value) => ({
      value: (value as ArrayBuffer).byteLength,
    }));

    const app = new Gelis();

    app.post(
      "/combined",
      {
        query: Query,
        body: Body,
        bodyParser: "arrayBuffer",
      },
      ({ query, body }) => ({
        id: query.id,
        byteLength: body,
      }),
    );

    const response = await app.fetch(
      new Request("http://gelis.test/combined?id=42", {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
        },
        body: new Uint8Array([1, 2, 3, 4]),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: 42,
      byteLength: 4,
    });
  });

  test("maps Request.arrayBuffer rejection to 400", async () => {
    const Body = createSchema<ArrayBuffer>((value) => ({
      value: value as ArrayBuffer,
    }));

    const app = new Gelis();

    app.post(
      "/binary",
      {
        body: Body,
        bodyParser: "arrayBuffer",
      },
      () => "never",
    );

    const request = {
      method: "POST",
      url: "http://gelis.test/binary",
      headers: {
        get(name: string) {
          return name.toLowerCase() === "content-type"
            ? "application/octet-stream"
            : null;
        },
      },
      arrayBuffer() {
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

  test("still rejects form parsers deferred to later P9-E3 work", () => {
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
