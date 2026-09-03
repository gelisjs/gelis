import { describe, expect, test } from "bun:test";

import { Gelis } from "../../src";

import type { OpenAPIRouteMetadata } from "../../src";

import { RouteBuilder } from "../../src/route-builder";

import {
  createRuntimeRouteContractMetadata,
  RUNTIME_ROUTE_CONTRACT_METADATA,
} from "../../src/runtime/contract-metadata";

import { RUNTIME_ROUTE_PLAIN } from "../../src/runtime/types";

import type { RuntimeRouteRecord } from "../../src/runtime/types";

describe("Gelis OpenAPI contract metadata capture", () => {
  test("does not create metadata when OpenAPI metadata is absent", () => {
    expect(createRuntimeRouteContractMetadata(undefined)).toBeUndefined();

    let captured: RuntimeRouteRecord | undefined;

    const route = new RouteBuilder(
      "",

      (runtimeRoute) => {
        captured = runtimeRoute;
      },
    );

    route.get(
      "/plain",

      () => "plain",
    );

    expect(captured).toBeDefined();

    expect(captured?.[RUNTIME_ROUTE_CONTRACT_METADATA]).toBeUndefined();

    expect(captured?.flags).toBe(RUNTIME_ROUTE_PLAIN);
  });

  test("captures OpenAPI metadata without activating runtime features", () => {
    const schema = {
      type: "string",
    } as const;

    const tags = ["Users", "Internal"];

    const metadata = {
      summary: "Get user",

      tags,

      request: {
        body: {
          schema,
        },
      },
    } satisfies OpenAPIRouteMetadata;

    let captured: RuntimeRouteRecord | undefined;

    const route = new RouteBuilder(
      "",

      (runtimeRoute) => {
        captured = runtimeRoute;
      },
    );

    route.get(
      "/users",

      {
        openapi: metadata,
      },

      () => "user",
    );

    const stored = captured?.[RUNTIME_ROUTE_CONTRACT_METADATA];

    expect(stored).toBeDefined();

    expect(stored?.openapi).not.toBe(metadata);

    expect(stored?.openapi).not.toBe(false);

    if (stored === undefined || stored.openapi === false) {
      throw new Error("Expected captured OpenAPI metadata");
    }

    expect(stored.openapi.tags).toEqual(tags);

    expect(stored.openapi.tags).not.toBe(tags);

    expect(stored.openapi.request?.body?.schema).toBe(schema);

    expect(captured?.flags).toBe(RUNTIME_ROUTE_PLAIN);

    expect(captured?.input).toBeUndefined();

    expect(captured?.responsePlan).toBeUndefined();
  });

  test("captures explicit OpenAPI exclusion without activating runtime features", () => {
    let captured: RuntimeRouteRecord | undefined;

    const route = new RouteBuilder(
      "",

      (runtimeRoute) => {
        captured = runtimeRoute;
      },
    );

    route.get(
      "/internal",

      {
        openapi: false,
      },

      () => "hidden",
    );

    expect(captured?.[RUNTIME_ROUTE_CONTRACT_METADATA]).toEqual({
      openapi: false,
    });

    expect(captured?.flags).toBe(RUNTIME_ROUTE_PLAIN);
  });

  test("keeps the metadata sidecar enumerable for module template cloning", () => {
    let captured: RuntimeRouteRecord | undefined;

    const route = new RouteBuilder(
      "",

      (runtimeRoute) => {
        captured = runtimeRoute;
      },
    );

    route.get(
      "/documented",

      {
        openapi: {
          summary: "Documented",
        },
      },

      () => "ok",
    );

    if (captured === undefined) {
      throw new Error("Expected captured route");
    }

    const descriptor = Object.getOwnPropertyDescriptor(
      captured,
      RUNTIME_ROUTE_CONTRACT_METADATA,
    );

    expect(descriptor?.enumerable).toBe(true);

    const cloned = {
      ...captured,
    };

    expect(cloned[RUNTIME_ROUTE_CONTRACT_METADATA]).toEqual(
      captured[RUNTIME_ROUTE_CONTRACT_METADATA],
    );
  });

  test("keeps documented plain routes on normal request execution", async () => {
    const app = new Gelis();

    app.get(
      "/documented",

      {
        openapi: {
          summary: "Documented",
        },
      },

      () => "ok",
    );

    const response = await app.fetch(
      new Request("http://gelis.local/documented"),
    );

    expect(response.status).toBe(200);

    expect(await response.text()).toBe("ok");
  });
});
