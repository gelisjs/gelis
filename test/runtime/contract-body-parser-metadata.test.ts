import { describe, expect, test } from "bun:test";

import { Gelis, inspectContract } from "../../src";

import type { StandardSchemaV1 } from "../../src";

function createSchema<Input = unknown, Output = Input>(): StandardSchemaV1<
  Input,
  Output
> {
  return {
    "~standard": {
      version: 1,
      vendor: "gelis-test",
      validate(value) {
        return {
          value: value as Output,
        };
      },
    },
  };
}

describe("Gelis contract request body parser metadata", () => {
  test("projects default and explicit managed body parser metadata", () => {
    const Body = createSchema<unknown, string>();

    const app = new Gelis();

    app.get("/plain", () => "plain");

    app.post(
      "/json",
      {
        body: Body,
      },
      () => "json",
    );

    app.post(
      "/text",
      {
        body: Body,
        bodyParser: "text",
        bodyContentTypes: [
          "TEXT/PLAIN; charset=utf-8",
          "text/plain",
          "application/vnd.gelis-text",
        ],
      },
      () => "text",
    );

    const snapshot = inspectContract(app);

    expect(snapshot.routes[0]?.bodyParser).toBeUndefined();
    expect(snapshot.routes[0]?.bodyContentTypes).toBeUndefined();

    expect(snapshot.routes[1]?.bodyParser).toBe("json");
    expect(snapshot.routes[1]?.bodyContentTypes).toBeUndefined();

    expect(snapshot.routes[2]?.bodyParser).toBe("text");
    expect(snapshot.routes[2]?.bodyContentTypes).toEqual([
      "text/plain",
      "application/vnd.gelis-text",
    ]);
  });

  test("returns fresh explicit media arrays across inspections", () => {
    const Body = createSchema<unknown, string>();

    const app = new Gelis();

    app.post(
      "/text",
      {
        body: Body,
        bodyParser: "text",
        bodyContentTypes: ["text/plain", "application/vnd.gelis-text"],
      },
      () => "text",
    );

    const first = inspectContract(app);
    const second = inspectContract(app);

    expect(first.routes[0]?.bodyContentTypes).toEqual([
      "text/plain",
      "application/vnd.gelis-text",
    ]);
    expect(second.routes[0]?.bodyContentTypes).toEqual([
      "text/plain",
      "application/vnd.gelis-text",
    ]);
    expect(first.routes[0]?.bodyContentTypes).not.toBe(
      second.routes[0]?.bodyContentTypes,
    );
  });
});
