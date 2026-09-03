import { Gelis, inspectContract } from "../../src";

import type {
  ApplicationContractSnapshot,
  ContractRouteSnapshot,
  HttpMethod,
  OpenAPIRouteMetadata,
  ResponseContractMap,
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
