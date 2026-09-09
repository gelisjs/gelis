import { Gelis, defineModule, definePlugin } from "../../src";

import type {
  ModuleContractOf,
  RequestBodyParser,
  RouteContractOf,
  StandardSchemaV1,
} from "../../src";

import type { Equal, Expect } from "./assert";

declare const JsonBody: StandardSchemaV1<
  {
    name: string;
  },
  {
    name: string;
    normalized: true;
  }
>;

declare const TextBody: StandardSchemaV1<
  string,
  {
    value: string;
  }
>;

declare const UrlEncodedBody: StandardSchemaV1<
  {
    name: string;
    tags?: string[];
  },
  {
    name: string;
    tags: string[];
  }
>;

declare const MultipartBody: StandardSchemaV1<
  {
    name: string;
    file: File;
  },
  {
    name: string;
    file: File;
  }
>;

declare const BinaryBody: StandardSchemaV1<
  ArrayBuffer,
  {
    size: number;
  }
>;

type ParserUnion = Expect<
  Equal<
    RequestBodyParser,
    "json" | "text" | "urlencoded" | "multipart" | "arrayBuffer"
  >
>;

const app = new Gelis();

const shorthandJson = app.post(
  "/json",
  {
    body: JsonBody,
  },
  ({ body }) => {
    const name: string = body.name;
    const normalized: true = body.normalized;

    void name;
    void normalized;

    return body;
  },
);

type ShorthandJsonRequest = Expect<
  Equal<
    RouteContractOf<typeof shorthandJson>["request"]["body"],
    {
      name: string;
    }
  >
>;

const explicitJson = app.post(
  "/vendor-json",
  {
    body: JsonBody,
    bodyParser: "json",
    bodyContentTypes: ["application/vnd.gelis+json"],
  },
  ({ body }) => {
    const normalized: true = body.normalized;

    void normalized;

    return body;
  },
);

type ExplicitJsonRequest = Expect<
  Equal<
    RouteContractOf<typeof explicitJson>["request"]["body"],
    {
      name: string;
    }
  >
>;

const textRoute = app.post(
  "/text",
  {
    body: TextBody,
    bodyParser: "text",
  },
  ({ body }) => {
    const value: string = body.value;

    void value;

    return body;
  },
);

type TextRequest = Expect<
  Equal<RouteContractOf<typeof textRoute>["request"]["body"], string>
>;

const urlencodedRoute = app.post(
  "/urlencoded",
  {
    body: UrlEncodedBody,
    bodyParser: "urlencoded",
  },
  ({ body }) => {
    const tags: string[] = body.tags;

    void tags;

    return body;
  },
);

type UrlEncodedRequest = Expect<
  Equal<
    RouteContractOf<typeof urlencodedRoute>["request"]["body"],
    {
      name: string;
      tags?: string[];
    }
  >
>;

const multipartRoute = app.post(
  "/multipart",
  {
    body: MultipartBody,
    bodyParser: "multipart",
  },
  ({ body }) => {
    const file: File = body.file;

    void file;

    return body;
  },
);

type MultipartRequest = Expect<
  Equal<
    RouteContractOf<typeof multipartRoute>["request"]["body"],
    {
      name: string;
      file: File;
    }
  >
>;

const binaryRoute = app.post(
  "/binary",
  {
    body: BinaryBody,
    bodyParser: "arrayBuffer",
    bodyContentTypes: ["application/octet-stream", "image/png"],
  },
  ({ body }) => {
    const size: number = body.size;

    void size;

    return body;
  },
);

type BinaryRequest = Expect<
  Equal<RouteContractOf<typeof binaryRoute>["request"]["body"], ArrayBuffer>
>;

/*
 * Application-scope surface.
 */
const applicationScope = app.scope({
  tenant: "gelis" as const,
});

applicationScope.post(
  "/scope-body",
  {
    body: TextBody,
    bodyParser: "text",
  },
  ({ body }, scope) => {
    const value: string = body.value;

    const tenant: "gelis" = scope.tenant;

    void value;
    void tenant;

    return body;
  },
);

/*
 * Request-scope surface.
 */
const requestScope = app.requestScope(() => ({
  requestId: "request" as const,
}));

requestScope.post(
  "/request-scope-body",
  {
    body: UrlEncodedBody,
    bodyParser: "urlencoded",
  },
  ({ body }, scope) => {
    const tags: string[] = body.tags;

    const requestId: "request" = scope.requestId;

    void tags;
    void requestId;

    return body;
  },
);

/*
 * Static module surface.
 */
const staticModule = defineModule("/body-module", (route) => ({
  upload: route.post(
    "/upload",
    {
      body: MultipartBody,
      bodyParser: "multipart",
    },
    ({ body }) => body,
  ),
}));

type StaticModuleRequest = Expect<
  Equal<
    ModuleContractOf<
      typeof staticModule
    >["routes"]["upload"]["request"]["body"],
    {
      name: string;
      file: File;
    }
  >
>;

/*
 * Scoped module surface.
 */
const scopedModule = defineModule(
  "/scoped-body-module",
  () => ({
    tenant: "gelis" as const,
  }),
  (route) => ({
    submit: route.post(
      "/submit",
      {
        body: TextBody,
        bodyParser: "text",
      },
      ({ body }, scope) => {
        const value: string = body.value;

        const tenant: "gelis" = scope.tenant;

        void value;
        void tenant;

        return body;
      },
    ),
  }),
);

type ScopedModuleRequest = Expect<
  Equal<
    ModuleContractOf<
      typeof scopedModule
    >["routes"]["submit"]["request"]["body"],
    string
  >
>;

/*
 * Module request-scope surface.
 */
const requestScopedModule = defineModule("/request-body-module", (module) => {
  const scoped = module.requestScope(() => ({
    actor: "actor" as const,
  }));

  return {
    submit: scoped.post(
      "/submit",
      {
        body: UrlEncodedBody,
        bodyParser: "urlencoded",
      },
      ({ body }, requestScope) => {
        const tags: string[] = body.tags;

        const actor: "actor" = requestScope.actor;

        void tags;
        void actor;

        return body;
      },
    ),
  };
});

type ModuleRequestScopeRequest = Expect<
  Equal<
    ModuleContractOf<
      typeof requestScopedModule
    >["routes"]["submit"]["request"]["body"],
    {
      name: string;
      tags?: string[];
    }
  >
>;

/*
 * Plugin route surface inherits RouteBuilder.
 */
const plugin = definePlugin("request-body-contract-types", ({ routes }) => {
  routes.post(
    "/plugin-body",
    {
      body: TextBody,
      bodyParser: "text",
    },
    ({ body }) => {
      const value: string = body.value;

      void value;

      return body;
    },
  );
});

void plugin;

/*
 * Invalid parser.
 */
app.post(
  "/invalid-parser",
  {
    body: TextBody,

    // @ts-expect-error parser must be a built-in P9-E parser
    bodyParser: "xml",
  },
  () => "never",
);

/*
 * Body itself remains Standard Schema.
 */
app.post(
  "/invalid-schema",
  {
    body: {
      // @ts-expect-error request body requires Standard Schema
      value: "not-schema",
    },
  },
  () => "never",
);

export type {
  BinaryRequest,
  ExplicitJsonRequest,
  ModuleRequestScopeRequest,
  MultipartRequest,
  ParserUnion,
  ScopedModuleRequest,
  ShorthandJsonRequest,
  StaticModuleRequest,
  TextRequest,
  UrlEncodedRequest,
};
