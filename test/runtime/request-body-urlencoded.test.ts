import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";

import type { StandardSchemaV1 } from "../../src";

type FormBody = Record<string, string | string[]>;

describe("Gelis urlencoded request body reader", () => {
  test("parses Web form semantics and normalizes repeated fields", async () => {
    const Body = createSchema<FormBody>((value) => {
      const body = value as FormBody;

      if (Object.getPrototypeOf(body) !== null) {
        return {
          issues: [
            {
              message: "form body must have a null prototype",
            },
          ],
        };
      }

      return {
        value: body,
      };
    });

    const app = new Gelis();

    app.post(
      "/form",
      {
        body: Body,
        bodyParser: "urlencoded",
      },
      ({ body }) => body,
    );

    const response = await app.fetch(
      new Request("http://gelis.test/form", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: [
          "name=Gelis+Framework",
          "tag=a",
          "tag=b",
          "plus=x%2By",
          "bad=%ZZ",
          "empty=",
          "user%5Bname%5D=Rigent",
          "a.b=value",
          "=blank",
          "__proto__=safe",
        ].join("&"),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      name: "Gelis Framework",
      tag: ["a", "b"],
      plus: "x+y",
      bad: "%ZZ",
      empty: "",
      "user[name]": "Rigent",
      "a.b": "value",
      "": "blank",
      __proto__: "safe",
    });
  });

  test("accepts application/x-www-form-urlencoded parameters case-insensitively", async () => {
    const Body = createSchema<FormBody>((value) => ({
      value: value as FormBody,
    }));

    const app = new Gelis();

    app.post(
      "/form",
      {
        body: Body,
        bodyParser: "urlencoded",
      },
      ({ body }) => body,
    );

    const response = await app.fetch(
      new Request("http://gelis.test/form", {
        method: "POST",
        headers: {
          "content-type": "Application/X-Www-Form-Urlencoded; charset=utf-8",
        },
        body: "name=Gelis",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: "Gelis" });
  });

  test("returns an empty null-prototype object for an empty body", async () => {
    const Body = createSchema<FormBody, boolean>((value) => ({
      value:
        Object.getPrototypeOf(value as object) === null &&
        Object.keys(value as object).length === 0,
    }));

    const app = new Gelis();

    app.post(
      "/empty",
      {
        body: Body,
        bodyParser: "urlencoded",
      },
      ({ body }) => ({ empty: body }),
    );

    const response = await app.fetch(
      new Request("http://gelis.test/empty", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ empty: true });
  });

  test("urlencoded default does not accept other media types", async () => {
    const Body = createSchema<FormBody>((value) => ({
      value: value as FormBody,
    }));

    const app = new Gelis();

    app.post(
      "/form",
      {
        body: Body,
        bodyParser: "urlencoded",
      },
      () => "never",
    );

    const response = await app.fetch(
      new Request("http://gelis.test/form", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
        },
        body: "name=Gelis",
      }),
    );

    expect(response.status).toBe(415);
  });

  test("custom media aliases replace the default and keep urlencoded grammar", async () => {
    const Body = createSchema<FormBody>((value) => ({
      value: value as FormBody,
    }));

    const app = new Gelis();

    app.post(
      "/vendor-form",
      {
        body: Body,
        bodyParser: "urlencoded",
        bodyContentTypes: ["application/vnd.gelis-form"],
      },
      ({ body }) => body,
    );

    const customResponse = await app.fetch(
      new Request("http://gelis.test/vendor-form", {
        method: "POST",
        headers: {
          "content-type": "Application/Vnd.Gelis-Form; version=1",
        },
        body: "name=Gelis+Framework&tag=a&tag=b",
      }),
    );

    expect(customResponse.status).toBe(200);
    expect(await customResponse.json()).toEqual({
      name: "Gelis Framework",
      tag: ["a", "b"],
    });

    const defaultResponse = await app.fetch(
      new Request("http://gelis.test/vendor-form", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "name=Gelis",
      }),
    );

    expect(defaultResponse.status).toBe(415);
  });

  test("returns 415 when Content-Type is missing", async () => {
    const Body = createSchema<FormBody>((value) => ({
      value: value as FormBody,
    }));

    const app = new Gelis();

    app.post(
      "/form",
      {
        body: Body,
        bodyParser: "urlencoded",
      },
      () => "never",
    );

    const request = {
      method: "POST",
      url: "http://gelis.test/form",
      headers: {
        get() {
          return null;
        },
      },
      text() {
        return Promise.resolve("name=Gelis");
      },
    } as unknown as Request;

    const response = await app.fetch(request);

    expect(response.status).toBe(415);
  });

  test("rejects ambiguous combined Content-Type", async () => {
    const Body = createSchema<FormBody>((value) => ({
      value: value as FormBody,
    }));

    const app = new Gelis();

    app.post(
      "/form",
      {
        body: Body,
        bodyParser: "urlencoded",
      },
      () => "never",
    );

    const request = {
      method: "POST",
      url: "http://gelis.test/form",
      headers: {
        get(name: string) {
          return name.toLowerCase() === "content-type"
            ? "application/x-www-form-urlencoded, text/plain"
            : null;
        },
      },
      text() {
        return Promise.resolve("name=Gelis");
      },
    } as unknown as Request;

    const response = await app.fetch(request);

    expect(response.status).toBe(415);
  });

  test("keeps commas inside quoted Content-Type parameters non-ambiguous", async () => {
    const Body = createSchema<FormBody>((value) => ({
      value: value as FormBody,
    }));

    const app = new Gelis();

    app.post(
      "/form",
      {
        body: Body,
        bodyParser: "urlencoded",
      },
      ({ body }) => body,
    );

    const request = {
      method: "POST",
      url: "http://gelis.test/form",
      headers: {
        get(name: string) {
          return name.toLowerCase() === "content-type"
            ? 'application/x-www-form-urlencoded; note="a,b"'
            : null;
        },
      },
      text() {
        return Promise.resolve("name=Gelis");
      },
    } as unknown as Request;

    const response = await app.fetch(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: "Gelis" });
  });

  test("returns 422 when urlencoded schema validation fails", async () => {
    const Body = createSchema<FormBody>(() => ({
      issues: [
        {
          message: "form payload is invalid",
          path: ["name"],
        },
      ],
    }));

    const app = new Gelis();

    app.post(
      "/form",
      {
        body: Body,
        bodyParser: "urlencoded",
      },
      () => "never",
    );

    const response = await app.fetch(
      new Request("http://gelis.test/form", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "name=Gelis",
      }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        target: "body",
        issues: [
          {
            message: "form payload is invalid",
            path: ["name"],
          },
        ],
      },
    });
  });

  test("validates query before passing normalized form data to the handler", async () => {
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

    const Body = createSchema<FormBody>((value) => ({
      value: value as FormBody,
    }));

    const app = new Gelis();

    app.post(
      "/combined",
      {
        query: Query,
        body: Body,
        bodyParser: "urlencoded",
      },
      ({ query, body }) => ({
        id: query.id,
        name: body.name,
      }),
    );

    const response = await app.fetch(
      new Request("http://gelis.test/combined?id=42", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "name=Gelis",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: 42,
      name: "Gelis",
    });
  });

  test("maps Request.text rejection to 400", async () => {
    const Body = createSchema<FormBody>((value) => ({
      value: value as FormBody,
    }));

    const app = new Gelis();

    app.post(
      "/form",
      {
        body: Body,
        bodyParser: "urlencoded",
      },
      () => "never",
    );

    const request = {
      method: "POST",
      url: "http://gelis.test/form",
      headers: {
        get(name: string) {
          return name.toLowerCase() === "content-type"
            ? "application/x-www-form-urlencoded"
            : null;
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

  test("still rejects multipart until its P9-E3 phase", () => {
    const Body = createSchema((value) => ({
      value,
    }));

    const app = new Gelis();

    expect(() => {
      app.post(
        "/multipart",
        {
          body: Body,
          bodyParser: "multipart",
        },
        ({ body }) => body,
      );
    }).toThrow(TypeError);
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
