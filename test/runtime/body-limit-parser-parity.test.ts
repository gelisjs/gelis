import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";

import type { StandardSchemaV1 } from "../../src";

type MultipartValue = string | File | Array<string | File>;
type MultipartBody = Record<string, MultipartValue>;

describe("Gelis body-limit parser parity", () => {
  test("preserves arrayBuffer bytes under a route body limit", async () => {
    const app = new Gelis();
    const Body = createSchema<ArrayBuffer, number[]>((value) => ({
      value: Array.from(new Uint8Array(value as ArrayBuffer)),
    }));

    app.post(
      "/bytes",
      {
        body: Body,
        bodyParser: "arrayBuffer",
        bodyLimit: 4,
      },
      ({ body }) => body,
    );

    const response = await app.fetch(
      new Request("http://gelis.test/bytes", {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
        },
        body: new Uint8Array([0, 1, 2, 255]),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([0, 1, 2, 255]);
  });

  test("preserves urlencoded decoding and repeated-key order under a route body limit", async () => {
    const app = new Gelis();
    const Body = identitySchema<Record<string, string | string[]>>();

    app.post(
      "/form",
      {
        body: Body,
        bodyParser: "urlencoded",
        bodyLimit: 64,
      },
      ({ body }) => body,
    );

    const response = await app.fetch(
      new Request("http://gelis.test/form", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "name=Gelis&tag=a&tag=b&space=hello+world&encoded=%2B",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      name: "Gelis",
      tag: ["a", "b"],
      space: "hello world",
      encoded: "+",
    });
  });

  test("preserves multipart empty names, repeats and File metadata under a route body limit", async () => {
    const boundary = "gelis-limited-multipart";
    const wireBody = multipartBody(boundary, [
      field("name", "Gelis"),
      field("tag", "a"),
      field("tag", "b"),
      field("", "blank"),
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

      if (!(upload instanceof File)) {
        return {
          issues: [{ message: "Expected multipart File" }],
        };
      }

      return {
        value: {
          name: body.name,
          tags: body.tag,
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
      "/multipart",
      {
        body: Body,
        bodyParser: "multipart",
        bodyLimit: 4096,
      },
      ({ body }) => body,
    );

    const response = await app.fetch(
      multipartRequest(
        "http://gelis.test/multipart",
        `multipart/form-data; boundary=${boundary}`,
        wireBody,
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      name: "Gelis",
      tags: ["a", "b"],
      emptyName: "blank",
      upload: {
        name: nativeUpload.name,
        type: nativeUpload.type,
        size: nativeUpload.size,
        text: "hello multipart",
      },
    });
  });

  test("retains custom multipart aliases and quoted boundary grammar under a limit", async () => {
    const boundary = "gelis,limited";
    const Body = identitySchema<MultipartBody>();
    const app = new Gelis();

    app.post(
      "/vendor",
      {
        body: Body,
        bodyParser: "multipart",
        bodyContentTypes: ["application/vnd.gelis-multipart"],
        bodyLimit: 2048,
      },
      ({ body }) => body,
    );

    const response = await app.fetch(
      multipartRequest(
        "http://gelis.test/vendor",
        `Application/Vnd.Gelis-Multipart; boundary="${boundary}"`,
        multipartBody(boundary, [field("name", "Gelis"), field("", "blank")]),
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      name: "Gelis",
      "": "blank",
    });
  });

  test("keeps malformed accepted multipart at 400 after the limited read", async () => {
    const Body = identitySchema<MultipartBody>();
    const app = new Gelis();

    app.post(
      "/malformed",
      {
        body: Body,
        bodyParser: "multipart",
        bodyLimit: 1024,
      },
      () => "never",
    );

    const response = await app.fetch(
      multipartRequest(
        "http://gelis.test/malformed",
        "multipart/form-data",
        "not-a-valid-multipart-body",
      ),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "MALFORMED_BODY",
        message: "Malformed request body",
      },
    });
  });

  test("keeps unsupported media at 415 without consuming the limited body", async () => {
    const Body = identitySchema<MultipartBody>();
    const app = new Gelis();

    app.post(
      "/wrong-media",
      {
        body: Body,
        bodyParser: "multipart",
        bodyLimit: 1,
      },
      () => "never",
    );

    const request = new Request("http://gelis.test/wrong-media", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
      },
      body: "oversized",
    });

    expect(request.bodyUsed).toBe(false);

    const response = await app.fetch(request);

    expect(response.status).toBe(415);
    expect(request.bodyUsed).toBe(false);
  });

  test("keeps schema validation at 422 after limited multipart parsing", async () => {
    const boundary = "gelis-limited-validation";
    const Body = createSchema<MultipartBody>(() => ({
      issues: [
        {
          message: "limited multipart payload is invalid",
          path: ["name"],
        },
      ],
    }));
    const app = new Gelis();

    app.post(
      "/validation",
      {
        body: Body,
        bodyParser: "multipart",
        bodyLimit: 2048,
      },
      () => "never",
    );

    const response = await app.fetch(
      multipartRequest(
        "http://gelis.test/validation",
        `multipart/form-data; boundary=${boundary}`,
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
            message: "limited multipart payload is invalid",
            path: ["name"],
          },
        ],
      },
    });
  });

  test("rejects oversized multipart before schema validation and handler execution", async () => {
    const boundary = "gelis-limited-overflow";
    let schemaCalls = 0;
    let handlerCalls = 0;
    const Body = createSchema<MultipartBody>((value) => {
      schemaCalls++;
      return { value: value as MultipartBody };
    });
    const app = new Gelis();

    app.post(
      "/overflow",
      {
        body: Body,
        bodyParser: "multipart",
        bodyLimit: 16,
      },
      () => {
        handlerCalls++;
        return "never";
      },
    );

    const response = await app.fetch(
      multipartRequest(
        "http://gelis.test/overflow",
        `multipart/form-data; boundary=${boundary}`,
        multipartBody(boundary, [field("name", "far-too-large")]),
      ),
    );

    expect(response.status).toBe(413);
    expect(schemaCalls).toBe(0);
    expect(handlerCalls).toBe(0);
  });
});

function multipartRequest(
  url: string,
  contentType: string,
  body: string,
): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": contentType,
    },
    body,
  });
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

function identitySchema<T>(): StandardSchemaV1<T, T> {
  return createSchema<T, T>((value) => ({
    value: value as T,
  }));
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
