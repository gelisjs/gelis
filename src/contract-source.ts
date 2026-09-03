import type { Gelis } from "./app";

import type { OpenAPIRouteMetadata } from "./openapi";

import type { HttpMethod, ResponseContractMap } from "./route";

import type { StandardSchemaV1 } from "./schema";

/*
 * Internal capability key.
 *
 * It is intentionally not exported from the public
 * package root. External tooling consumes
 * inspectContract(), never this symbol.
 */
export const GELIS_CONTRACT_SOURCE = Symbol("gelis.contract-source");

export interface ContractRouteSnapshot {
  readonly method: HttpMethod;

  readonly path: string;

  readonly query: StandardSchemaV1 | undefined;

  readonly body: StandardSchemaV1 | undefined;

  readonly responses: ResponseContractMap | undefined;

  readonly openapi: OpenAPIRouteMetadata | false | undefined;
}

export interface ApplicationContractSnapshot {
  readonly routes: readonly ContractRouteSnapshot[];
}

interface InternalContractSource {
  [GELIS_CONTRACT_SOURCE](): ApplicationContractSnapshot;
}

export function inspectContract(app: Gelis): ApplicationContractSnapshot {
  return (app as unknown as InternalContractSource)[GELIS_CONTRACT_SOURCE]();
}
