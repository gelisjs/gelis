import type {
  ResponseContract,
  ResponseContractMap,
  ResponseDescriptor,
} from "../route";

import type { StandardSchemaV1 } from "../schema";

export const RUNTIME_RESPONSE_VALIDATE = 1;

export const RUNTIME_RESPONSE_JSON = 2;

export const RUNTIME_RESPONSE_TEXT = 4;

export interface RuntimeResponsePlanEntry {
  readonly status: number;

  readonly flags: number;

  readonly schema: StandardSchemaV1 | undefined;

  readonly contentType: string | undefined;
}

export interface RuntimeResponsePlan {
  readonly entries: readonly RuntimeResponsePlanEntry[];
}

/*
 * Metadata-only response contracts intentionally do
 * not produce a runtime response plan.
 *
 * If at least one response descriptor enables
 * executable behavior, the whole declared status
 * contract is compiled because the future finalizer
 * must also know which managed statuses are legal.
 */
export function createRuntimeResponsePlan(
  responses: ResponseContractMap | undefined,
): RuntimeResponsePlan | undefined {
  if (responses === undefined) {
    return undefined;
  }

  if (!hasExecutableResponse(responses)) {
    return undefined;
  }

  const entries: RuntimeResponsePlanEntry[] = [];

  for (const statusText in responses) {
    if (!Object.prototype.hasOwnProperty.call(responses, statusText)) {
      continue;
    }

    const status = Number(statusText);

    const entry = responses[status];

    entries.push(compileResponseEntry(status, entry));
  }

  return {
    entries,
  };
}

function hasExecutableResponse(responses: ResponseContractMap): boolean {
  for (const statusText in responses) {
    if (!Object.prototype.hasOwnProperty.call(responses, statusText)) {
      continue;
    }

    const entry = responses[Number(statusText)];

    if (entry !== undefined && isResponseDescriptor(entry)) {
      return true;
    }
  }

  return false;
}

function compileResponseEntry(
  status: number,

  entry: ResponseContract,
): RuntimeResponsePlanEntry {
  if (entry === undefined) {
    return {
      status,

      flags: 0,

      schema: undefined,

      contentType: undefined,
    };
  }

  if (isStandardSchema(entry)) {
    return {
      status,

      flags: 0,

      schema: entry,

      contentType: undefined,
    };
  }

  let flags = 0;

  if (entry.validate === true) {
    flags |= RUNTIME_RESPONSE_VALIDATE;
  }

  if (entry.serialize === "json") {
    flags |= RUNTIME_RESPONSE_JSON;
  } else if (entry.serialize === "text") {
    flags |= RUNTIME_RESPONSE_TEXT;
  }

  return {
    status,

    flags,

    schema: entry.schema,

    contentType: entry.contentType,
  };
}

type DefinedResponseContract = Exclude<ResponseContract, undefined>;

type ResponseSchemaContract = Extract<
  DefinedResponseContract,
  StandardSchemaV1
>;

function isStandardSchema(
  entry: DefinedResponseContract,
): entry is ResponseSchemaContract {
  return "~standard" in entry;
}

function isResponseDescriptor(
  entry: DefinedResponseContract,
): entry is ResponseDescriptor {
  return !isStandardSchema(entry);
}
