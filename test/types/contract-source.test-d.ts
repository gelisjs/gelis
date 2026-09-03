import { Gelis, inspectContract } from "../../src";

import type {
  ApplicationContractSnapshot,
  ContractRouteSnapshot,
  HttpMethod,
  OpenAPIRouteMetadata,
  ResponseContractMap,
  RouteContractOf,
  StandardJSONSchemaV1,
  StandardSchemaV1,
} from "../../src";

import type { Equal, Expect } from "./assert";

const app = new Gelis();

app.get(
  "/users/:id",

  {
    openapi: {
      summary: "Get user",
    },
  },

  ({ params }) => ({
    id: params.id,
  }),
);

const snapshot = inspectContract(app);

/*
 * Contract inspection is deliberately general.
 *
 * Registering literal routes does not create a
 * second application-wide literal type graph.
 */
type _SnapshotType = Expect<
  Equal<typeof snapshot, ApplicationContractSnapshot>
>;

type SnapshotRoute = ApplicationContractSnapshot["routes"][number];

type _SnapshotRoute = Expect<Equal<SnapshotRoute, ContractRouteSnapshot>>;

type _MethodIsGeneral = Expect<
  Equal<ContractRouteSnapshot["method"], HttpMethod>
>;

type _PathIsGeneral = Expect<Equal<ContractRouteSnapshot["path"], string>>;

type _QueryCapability = Expect<
  Equal<ContractRouteSnapshot["query"], StandardSchemaV1 | undefined>
>;

type _BodyCapability = Expect<
  Equal<ContractRouteSnapshot["body"], StandardSchemaV1 | undefined>
>;

type _ResponsesCapability = Expect<
  Equal<ContractRouteSnapshot["responses"], ResponseContractMap | undefined>
>;

type _OpenAPICapability = Expect<
  Equal<
    ContractRouteSnapshot["openapi"],
    OpenAPIRouteMetadata | false | undefined
  >
>;

/*
 * Runtime implementation details are intentionally
 * absent from the public contract snapshot.
 */
type _NoHandler = Expect<
  Equal<"handler" extends keyof ContractRouteSnapshot ? true : false, false>
>;

type _NoFlags = Expect<
  Equal<"flags" extends keyof ContractRouteSnapshot ? true : false, false>
>;

type _NoInputPlan = Expect<
  Equal<"input" extends keyof ContractRouteSnapshot ? true : false, false>
>;

type _NoResponsePlan = Expect<
  Equal<
    "responsePlan" extends keyof ContractRouteSnapshot ? true : false,
    false
  >
>;

/*
 * Gelis itself does not expose a public live route
 * registry or an inspect method.
 */
type _NoPublicRoutes = Expect<
  Equal<"routes" extends keyof Gelis ? true : false, false>
>;

type _NoInspectMethod = Expect<
  Equal<"inspectContract" extends keyof Gelis ? true : false, false>
>;

void snapshot;

/*
 * Runtime validation does not require JSON Schema
 * serialization capability.
 *
 * A runtime-only Standard Schema remains a valid
 * Gelis route contract.
 */
declare const RuntimeOnlySchema: StandardSchemaV1<
  {
    raw: string;
  },
  {
    normalized: number;
  }
>;

const runtimeOnly = app.post(
  "/runtime-only",

  {
    body: RuntimeOnlySchema,
  },

  ({ body }) => body.normalized,
);

type RuntimeOnlyContract = RouteContractOf<typeof runtimeOnly>;

type _RuntimeOnlyInput = Expect<
  Equal<
    RuntimeOnlyContract["request"]["body"],
    {
      raw: string;
    }
  >
>;

type _RuntimeOnlyResponse = Expect<
  Equal<
    RuntimeOnlyContract["responses"],
    {
      200: number;
    }
  >
>;

/*
 * A runtime-only schema may explicitly declare its
 * documentation shape opaque without changing the
 * runtime validation type.
 */
app.post(
  "/runtime-only-opaque",

  {
    body: RuntimeOnlySchema,

    openapi: {
      request: {
        body: {
          opaque: true,
        },
      },
    },
  },

  ({ body }) => body.normalized,
);

/*
 * A schema may implement Standard Schema and
 * Standard JSON Schema simultaneously.
 *
 * Gelis runtime typing continues to use Standard
 * Schema Input/Output semantics.
 */
interface SerializableProps
  extends
    StandardSchemaV1.Props<
      {
        raw: string;
      },
      {
        normalized: number;
      }
    >,
    StandardJSONSchemaV1.Props<
      {
        raw: string;
      },
      {
        normalized: number;
      }
    > {}

interface SerializableSchema {
  readonly "~standard": SerializableProps;
}

declare const Serializable: SerializableSchema;

const serializableRoute = app.post(
  "/serializable",

  {
    body: Serializable,
  },

  ({ body }) => body.normalized,
);

type SerializableContract = RouteContractOf<typeof serializableRoute>;

type _SerializableInput = Expect<
  Equal<
    SerializableContract["request"]["body"],
    {
      raw: string;
    }
  >
>;

type _SerializableResponse = Expect<
  Equal<
    SerializableContract["responses"],
    {
      200: number;
    }
  >
>;

/*
 * Standard JSON Schema by itself does not provide
 * runtime validation.
 */
declare const JSONSchemaOnly: StandardJSONSchemaV1<
  {
    raw: string;
  },
  {
    normalized: number;
  }
>;

app.post(
  "/json-schema-only",

  {
    // @ts-expect-error JSON Schema serialization alone is not runtime validation
    body: JSONSchemaOnly,
  },

  () => undefined,
);
