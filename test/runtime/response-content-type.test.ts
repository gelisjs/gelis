import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";

import type { StandardSchemaV1 } from "../../src";

describe("Gelis response Content-Type semantics", () => {
  test("serves managed HTML through the strict text serializer", async () => {
    const Html = createSchema<string>();
    const app = new Gelis();

    app.get(
      "/page",
      {
        responses: {
          200: {
            schema: Html,
            serialize: "text",
            contentType: "text/html; charset=utf-8",
          },
        },
      },
      () => "<!doctype html><h1>Gelis</h1>",
    );

    const response = await app.fetch(new Request("http://gelis.test/page"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(await response.text()).toBe("<!doctype html><h1>Gelis</h1>");
  });

  test("preserves an explicit HTML Content-Type without appending charset", async () => {
    const Html = createSchema<string>();
    const app = new Gelis();

    app.get(
      "/exact",
      {
        responses: {
          200: {
            schema: Html,
            serialize: "text",
            contentType: "text/html",
          },
        },
      },
      () => "<p>exact</p>",
    );

    const response = await app.fetch(new Request("http://gelis.test/exact"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html");
    expect(await response.text()).toBe("<p>exact</p>");
  });

  test("serializes the transformed Standard Schema value as HTML", async () => {
    const Html = createSchema<unknown, string>((value) => {
      const input = value as {
        title: string;
      };

      return {
        value: `<h1>${input.title.trim()}</h1>`,
      };
    });
    const app = new Gelis();

    app.get(
      "/validated",
      {
        responses: {
          200: {
            schema: Html,
            validate: true,
            serialize: "text",
            contentType: "text/html; charset=utf-8",
          },
        },
      },
      () => ({
        title: " Gelis ",
      }),
    );

    const response = await app.fetch(
      new Request("http://gelis.test/validated"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(await response.text()).toBe("<h1>Gelis</h1>");
  });
});

function createSchema<Input = unknown, Output = Input>(
  validate: StandardSchemaV1.Props<Input, Output>["validate"] = (value) => ({
    value: value as Output,
  }),
): StandardSchemaV1<Input, Output> {
  return {
    "~standard": {
      version: 1,
      vendor: "gelis-test",
      validate,
    },
  };
}
