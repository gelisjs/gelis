import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";

import type { StandardSchemaV1 } from "../../src";

type MultipartValue = string | File | Array<string | File>;
type MultipartBody = Record<string, MultipartValue>;

describe("Gelis multipart request body reader", () => {
  test("parses fields and files into a null-prototype object", async () => {
    const boundary = "gelis-boundary";

    const Body = createSchema<MultipartBody, unknown>(async (value) => {
      const body = value as MultipartBody;

      if (Object.getPrototypeOf(body) !== null) {
        return {
          issues: [
            {
              message: "multipart body must have a null prototype",
            },
          ],
        };
      }

      const upload = body.upload;

      if (!(upload instanceof File)) {
        return {
          issues: [
            {
              message: "upload must be a File",
            },
          ],
        };
      }

      return {
        value: {
          name: body.name,
          tags: body.tag,
          literalBracket: body["user[name]"],
          literalDot: body["a.b"],
          emptyName: body[""],
          upload: {
            name: upload.name,
            type: upload.type,
            size: upload.size,
            text: await upload.text(),
          },
        },
      };
    });

    const app = new Gelis();

    app.post(
      "/form",
      {
        body: Body,
        bodyParser: "multipart",
      },
      ({ body }) => body,
    );

    const response = await app.fetch(
      new Request("http://gelis.test/form", {
        method: "POST",
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        body: multipartBody(boundary, [
          field("name", "Gelis"),
          field("tag", "a"),
          field("tag", "b"),
          field("user[name]", "Rigent"),
          field("a.b", "value"),
          field("", "blank"),
          file("upload", "hello.txt", "text/plain", "hello multipart"),
        ]),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      name: "Gelis",
      tags: ["a", "b"],
      literalBracket: "Rigent",
      literalDot: "value",
      emptyName: "blank",
      upload: {
        name: "hello.txt",
        type: "text/plain",
        size: 15,
        text: "hello multipart",
      },
    });
  });

  test("preserves mixed repeated string and File values in per-key order", async () => {
    const boundary = "gelis-mixed";

    const Body = createSchema<MultipartBody, unknown>(async (value) => {
      const body = value as MultipartBody;
      const items = body.item;

      if (!Array.isArray(items) || !(items[1] instanceof File)) {
        return {
          issues: [
            {
              message: "mixed repeated field is invalid",
            },
          ],
        };
      }

      return {
        value: [
          items[0],
          {
            name: items[1].name,
            text: await items[1].text(),
          },
          items[2],
        ],
      };
    });

    const app = new Gelis();

    app.post(
      "/mixed",
      {
        body: Body,
        bodyParser: "multipart",
      },
      ({ body }) => body,
    );

    const response = await app.fetch(
      new Request("http://gelis.test/mixed", {
        method: "POST",
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        body: multipartBody(boundary, [
          field("item", "first"),
          file("item", "item.txt", "text/plain", "second"),
          field("item", "third"),
        ]),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      "first",
      {
        name: "item.txt",
        text: "second",
      },
      "third",
    ]);
  });

  test("accepts multipart media type case-insensitively", async () => {
    const formData = new FormData();
    formData.append("name", "Gelis");

    const Body = createSchema<MultipartBody>((value) => ({
      value: value as MultipartBody,
    }));

    const app = new Gelis();

    app.post(
      "/form",
      {
        body: Body,
        bodyParser: "multipart",
      },
      ({ body }) => body,
    );

    const request = requestLike(
      "http://gelis.test/form",
      'Multipart/Form-Data; note="a,b"; boundary=gelis',
      formData,
    );

    const response = await app.fetch(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: "Gelis" });
  });

  test("returns 400 when multipart boundary is missing", async () => {
    const Body = createSchema<MultipartBody>((value) => ({
      value: value as MultipartBody,
    }));

    const app = new Gelis();

    app.post(
      "/form",
      {
        body: Body,
        bodyParser: "multipart",
      },
      () => "never",
    );

    const response = await app.fetch(
      new Request("http://gelis.test/form", {
        method: "POST",
        headers: {
          "content-type": "multipart/form-data",
        },
        body: "not-a-valid-multipart-body",
      }),
    );

    expect(response.status).toBe(400);
  });

  test("returns 400 when multipart boundary is unusable", async () => {
    const Body = createSchema<MultipartBody>((value) => ({
      value: value as MultipartBody,
    }));

    const app = new Gelis();

    app.post(
      "/form",
      {
        body: Body,
        bodyParser: "multipart",
      },
      () => "never",
    );

    const response = await app.fetch(
      new Request("http://gelis.test/form", {
        method: "POST",
        headers: {
          "content-type": "multipart/form-data; boundary=wrong",
        },
        body: multipartBody("actual", [field("name", "Gelis")]),
      }),
    );

    expect(response.status).toBe(400);
  });

  test("multipart default does not accept other media types", async () => {
    const Body = createSchema<MultipartBody>((value) => ({
      value: value as MultipartBody,
    }));

    const app = new Gelis();

    app.post(
      "/form",
      {
        body: Body,
        bodyParser: "multipart",
      },
      () => "never",
    );

    const response = await app.fetch(
      new Request("http://gelis.test/form", {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
        },
        body: "binary",
      }),
    );

    expect(response.status).toBe(415);
  });

  test("custom media aliases replace the default and preserve multipart grammar", async () => {
    const boundary = "gelis-custom";

    const Body = createSchema<MultipartBody>((value) => ({
      value: value as MultipartBody,
    }));

    const app = new Gelis();

    app.post(
      "/custom",
      {
        body: Body,
        bodyParser: "multipart",
        bodyContentTypes: ["application/vnd.gelis-multipart"],
      },
      ({ body }) => body,
    );

    const customResponse = await app.fetch(
      new Request("http://gelis.test/custom", {
        method: "POST",
        headers: {
          "content-type": `application/vnd.gelis-multipart; boundary=${boundary}`,
        },
        body: multipartBody(boundary, [field("name", "Gelis")]),
      }),
    );

    expect(customResponse.status).toBe(200);
    expect(await customResponse.json()).toEqual({ name: "Gelis" });

    const defaultResponse = await app.fetch(
      new Request("http://gelis.test/custom", {
        method: "POST",
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        body: multipartBody(boundary, [field("name", "Gelis")]),
      }),
    );

    expect(defaultResponse.status).toBe(415);
  });

  test("returns 415 when Content-Type is missing or ambiguous", async () => {
    const formData = new FormData();
    formData.append("name", "Gelis");

    const Body = createSchema<MultipartBody>((value) => ({
      value: value as MultipartBody,
    }));

    const app = new Gelis();

    app.post(
      "/form",
      {
        body: Body,
        bodyParser: "multipart",
      },
      () => "never",
    );

    const missing = await app.fetch(
      requestLike("http://gelis.test/form", null, formData),
    );

    expect(missing.status).toBe(415);

    const ambiguous = await app.fetch(
      requestLike(
        "http://gelis.test/form",
        "multipart/form-data; boundary=a, multipart/form-data; boundary=b",
        formData,
      ),
    );

    expect(ambiguous.status).toBe(415);
  });

  test("returns 422 when multipart schema validation fails", async () => {
    const formData = new FormData();
    formData.append("name", "Gelis");

    const Body = createSchema<MultipartBody>(() => ({
      issues: [
        {
          message: "multipart payload is invalid",
          path: ["name"],
        },
      ],
    }));

    const app = new Gelis();

    app.post(
      "/form",
      {
        body: Body,
        bodyParser: "multipart",
      },
      () => "never",
    );

    const response = await app.fetch(
      requestLike(
        "http://gelis.test/form",
        "multipart/form-data; boundary=gelis",
        formData,
      ),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        target: "body",
        issues: [
          {
            message: "multipart payload is invalid",
            path: ["name"],
          },
        ],
      },
    });
  });

  test("validates query before passing normalized multipart data", async () => {
    const formData = new FormData();
    formData.append("name", "Gelis");

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

    const Body = createSchema<MultipartBody>((value) => ({
      value: value as MultipartBody,
    }));

    const app = new Gelis();

    app.post(
      "/combined",
      {
        query: Query,
        body: Body,
        bodyParser: "multipart",
      },
      ({ query, body }) => ({
        id: query.id,
        name: body.name,
      }),
    );

    const response = await app.fetch(
      requestLike(
        "http://gelis.test/combined?id=42",
        "multipart/form-data; boundary=gelis",
        formData,
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: 42,
      name: "Gelis",
    });
  });

  test("maps Request.formData rejection to 400", async () => {
    const Body = createSchema<MultipartBody>((value) => ({
      value: value as MultipartBody,
    }));

    const app = new Gelis();

    app.post(
      "/form",
      {
        body: Body,
        bodyParser: "multipart",
      },
      () => "never",
    );

    const request = {
      method: "POST",
      url: "http://gelis.test/form",
      headers: {
        get(name: string) {
          return name.toLowerCase() === "content-type"
            ? "multipart/form-data; boundary=gelis"
            : null;
        },
      },
      formData() {
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
});

function requestLike(
  url: string,
  contentType: string | null,
  formData: FormData,
): Request {
  return {
    method: "POST",
    url,
    headers: {
      get(name: string) {
        return name.toLowerCase() === "content-type" ? contentType : null;
      },
    },
    formData() {
      return Promise.resolve(formData);
    },
  } as unknown as Request;
}

interface MultipartPart {
  readonly headers: readonly string[];
  readonly body: string;
}

function field(name: string, value: string): MultipartPart {
  return {
    headers: [`Content-Disposition: form-data; name="${name}"`],
    body: value,
  };
}

function file(
  name: string,
  filename: string,
  contentType: string,
  value: string,
): MultipartPart {
  return {
    headers: [
      `Content-Disposition: form-data; name="${name}"; filename="${filename}"`,
      `Content-Type: ${contentType}`,
    ],
    body: value,
  };
}

function multipartBody(
  boundary: string,
  parts: readonly MultipartPart[],
): string {
  return [
    ...parts.flatMap((part) => [
      `--${boundary}`,
      ...part.headers,
      "",
      part.body,
    ]),
    `--${boundary}--`,
    "",
  ].join("\r\n");
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
