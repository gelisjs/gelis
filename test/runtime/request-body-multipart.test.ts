import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";

import type { StandardSchemaV1 } from "../../src";

type MultipartValue = string | File | Array<string | File>;
type MultipartBody = Record<string, MultipartValue>;

describe("Gelis multipart request body reader", () => {
  test("preserves fields, empty names and native File metadata", async () => {
    const boundary = "gelis-boundary";
    const wireBody = multipartBody(boundary, [
      field("name", "Gelis"),
      field("tag", "a"),
      field("tag", "b"),
      field("user[name]", "Rigent"),
      field("a.b", "value"),
      field("", "blank"),
      field("empty", ""),
      field("count", "42"),
      file("upload", "hello.txt", "text/plain", "hello multipart"),
    ]);

    const nativeFormData = await new Response(wireBody, {
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
    }).formData();
    const nativeUpload = nativeFormData.get("upload");

    if (!(nativeUpload instanceof File)) {
      throw new Error("Native multipart baseline did not produce a File");
    }

    const Body = createSchema<MultipartBody, unknown>(async (value) => {
      const body = value as MultipartBody;
      const upload = body.upload;

      if (Object.getPrototypeOf(body) !== null || !(upload instanceof File)) {
        return {
          issues: [
            {
              message: "invalid normalized multipart body",
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
          emptyValue: body.empty,
          count: body.count,
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
      multipartRequest("http://gelis.test/form", boundary, wireBody),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      name: "Gelis",
      tags: ["a", "b"],
      literalBracket: "Rigent",
      literalDot: "value",
      emptyName: "blank",
      emptyValue: "",
      count: "42",
      upload: {
        name: nativeUpload.name,
        type: nativeUpload.type,
        size: nativeUpload.size,
        text: "hello multipart",
      },
    });
  });

  test("keeps the internal empty-name sentinel collision-safe", async () => {
    const boundary = "gelis-sentinel";
    const sentinelLikeName = "__gelis_multipart_empty_name__";

    const Body = createSchema<MultipartBody>((value) => ({
      value: value as MultipartBody,
    }));

    const app = new Gelis();

    app.post(
      "/sentinel",
      {
        body: Body,
        bodyParser: "multipart",
      },
      ({ body }) => ({
        real: body[sentinelLikeName],
        empty: body[""],
      }),
    );

    const response = await app.fetch(
      multipartRequest(
        "http://gelis.test/sentinel",
        boundary,
        multipartBody(boundary, [
          field(sentinelLikeName, "real"),
          field("", "first"),
          field("", "second"),
        ]),
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      real: "real",
      empty: ["first", "second"],
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
      multipartRequest(
        "http://gelis.test/mixed",
        boundary,
        multipartBody(boundary, [
          field("item", "first"),
          file("item", "middle.txt", "text/plain", "middle"),
          field("item", "last"),
        ]),
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      "first",
      {
        name: "middle.txt",
        text: "middle",
      },
      "last",
    ]);
  });

  test("accepts case-insensitive media essence and quoted boundary parameters", async () => {
    const boundary = "gelis,quoted";
    const Body = createSchema<MultipartBody>((value) => ({
      value: value as MultipartBody,
    }));
    const app = new Gelis();

    app.post(
      "/quoted",
      {
        body: Body,
        bodyParser: "multipart",
      },
      ({ body }) => body,
    );

    const response = await app.fetch(
      new Request("http://gelis.test/quoted", {
        method: "POST",
        headers: {
          "content-type": `Multipart/Form-Data; boundary="${boundary}"`,
        },
        body: multipartBody(boundary, [field("name", "Gelis")]),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: "Gelis" });
  });

  test("returns 400 when an accepted multipart media type has no boundary", async () => {
    const Body = createSchema<MultipartBody>((value) => ({
      value: value as MultipartBody,
    }));
    const app = new Gelis();

    app.post(
      "/missing-boundary",
      {
        body: Body,
        bodyParser: "multipart",
      },
      () => "never",
    );

    const response = await app.fetch(
      new Request("http://gelis.test/missing-boundary", {
        method: "POST",
        headers: {
          "content-type": "multipart/form-data",
        },
        body: "not-a-valid-multipart-body",
      }),
    );

    expect(response.status).toBe(400);
  });

  test("returns 400 when the declared multipart boundary is unusable", async () => {
    const Body = createSchema<MultipartBody>((value) => ({
      value: value as MultipartBody,
    }));
    const app = new Gelis();

    app.post(
      "/wrong-boundary",
      {
        body: Body,
        bodyParser: "multipart",
      },
      () => "never",
    );

    const response = await app.fetch(
      new Request("http://gelis.test/wrong-boundary", {
        method: "POST",
        headers: {
          "content-type": "multipart/form-data; boundary=declared",
        },
        body: multipartBody("actual", [field("name", "Gelis")]),
      }),
    );

    expect(response.status).toBe(400);
  });

  test("multipart default rejects other media types", async () => {
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
        body: "x",
      }),
    );

    expect(response.status).toBe(415);
  });

  test("custom media aliases replace the default while retaining multipart grammar", async () => {
    const boundary = "gelis-vendor";
    const Body = createSchema<MultipartBody>((value) => ({
      value: value as MultipartBody,
    }));
    const app = new Gelis();

    app.post(
      "/vendor",
      {
        body: Body,
        bodyParser: "multipart",
        bodyContentTypes: ["application/vnd.gelis-multipart"],
      },
      ({ body }) => body,
    );

    const customResponse = await app.fetch(
      new Request("http://gelis.test/vendor", {
        method: "POST",
        headers: {
          "content-type": `Application/Vnd.Gelis-Multipart; boundary=${boundary}`,
        },
        body: multipartBody(boundary, [
          field("name", "Gelis"),
          field("", "blank"),
        ]),
      }),
    );

    expect(customResponse.status).toBe(200);
    expect(await customResponse.json()).toEqual({
      name: "Gelis",
      "": "blank",
    });

    const defaultResponse = await app.fetch(
      multipartRequest(
        "http://gelis.test/vendor",
        boundary,
        multipartBody(boundary, [field("name", "Gelis")]),
      ),
    );

    expect(defaultResponse.status).toBe(415);
  });

  test("returns 415 when Content-Type is missing or ambiguous", async () => {
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
      requestLike("http://gelis.test/form", null, new ArrayBuffer(0)),
    );

    const ambiguous = await app.fetch(
      requestLike(
        "http://gelis.test/form",
        "multipart/form-data; boundary=x, text/plain",
        new ArrayBuffer(0),
      ),
    );

    expect(missing.status).toBe(415);
    expect(ambiguous.status).toBe(415);
  });

  test("returns 422 when multipart schema validation fails", async () => {
    const boundary = "gelis-validation";
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
      multipartRequest(
        "http://gelis.test/form",
        boundary,
        multipartBody(boundary, [field("name", "Gelis")]),
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
    const boundary = "gelis-query";
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
      multipartRequest(
        "http://gelis.test/combined?id=42",
        boundary,
        multipartBody(boundary, [field("name", "Gelis")]),
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: 42,
      name: "Gelis",
    });
  });

  test("maps request body consumption rejection to 400", async () => {
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
});

function multipartRequest(
  url: string,
  boundary: string,
  body: string,
): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
}

function requestLike(
  url: string,
  contentType: string | null,
  body: ArrayBuffer,
): Request {
  return {
    method: "POST",
    url,
    headers: {
      get(name: string) {
        return name.toLowerCase() === "content-type" ? contentType : null;
      },
    },
    arrayBuffer() {
      return Promise.resolve(body);
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
