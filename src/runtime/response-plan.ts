import { ResponseContractError } from "../error";

import type {
  ResponseContract,
  ResponseContractMap,
  ResponseDescriptor,
} from "../route";

import type { StandardSchemaV1 } from "../schema";

import { isRuntimeReplyResult, normalizeResponseWithStatus } from "./response";

export const RUNTIME_RESPONSE_VALIDATE = 1;

export const RUNTIME_RESPONSE_JSON = 2;

export const RUNTIME_RESPONSE_TEXT = 4;

const RUNTIME_RESPONSE_SERIALIZER =
  RUNTIME_RESPONSE_JSON | RUNTIME_RESPONSE_TEXT;

export type RuntimeResponseFinalizer = (
  value: unknown,
) => Response | Promise<Response>;

type RuntimeStatusFinalizer = (body: unknown) => Response | Promise<Response>;

type RuntimeManagedResponseFinalizer = (
  status: number,

  body: unknown,
) => Response | Promise<Response>;

interface CompiledResponseEntry {
  readonly status: number;

  readonly finalize: RuntimeStatusFinalizer;
}

export interface RuntimeResponsePlanEntry {
  readonly status: number;

  readonly flags: number;

  readonly schema: StandardSchemaV1 | undefined;

  readonly contentType: string | undefined;
}

export interface RuntimeResponsePlan {
  readonly entries: readonly RuntimeResponsePlanEntry[];

  /*
   * Exact executable finalizer compiled once at
   * route registration time.
   *
   * Request execution does not interpret response
   * descriptors or serializer flags.
   */
  readonly finalize: RuntimeResponseFinalizer;
}

/*
 * Metadata-only response contracts intentionally do
 * not produce a runtime response plan.
 *
 * If at least one response descriptor enables
 * executable behavior, the whole declared status
 * contract is compiled because managed status
 * enforcement then belongs to the response plan.
 */
export function createRuntimeResponsePlan(
  responses: ResponseContractMap | undefined,
): RuntimeResponsePlan | undefined {
  if (responses === undefined) {
    return undefined;
  }

  validateResponseContracts(responses);

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

    finalize: compileResponseFinalizer(entries),
  };
}

function validateResponseContracts(responses: ResponseContractMap): void {
  for (const statusText in responses) {
    if (!Object.prototype.hasOwnProperty.call(responses, statusText)) {
      continue;
    }

    const status = Number(statusText);

    const entry = responses[status];

    if (isBodylessStatus(status)) {
      if (entry !== undefined) {
        throw new TypeError(
          `Gelis response status ${status} must use an undefined body contract`,
        );
      }

      continue;
    }

    if (entry === undefined || isStandardSchema(entry)) {
      continue;
    }

    validateResponseDescriptor(status, entry);
  }
}

function validateResponseDescriptor(
  status: number,

  descriptor: ResponseDescriptor,
): void {
  if (!isStandardSchemaValue(descriptor.schema)) {
    throw new TypeError(
      `Gelis response descriptor for status ${status} requires a Standard Schema`,
    );
  }

  if (descriptor.validate !== undefined && descriptor.validate !== true) {
    throw new TypeError(
      `Gelis response descriptor for status ${status} has an invalid validate option`,
    );
  }

  const serialize = descriptor.serialize;

  if (serialize !== undefined && serialize !== "json" && serialize !== "text") {
    throw new TypeError(
      `Gelis response descriptor for status ${status} has an invalid serializer`,
    );
  }

  if (descriptor.contentType !== undefined && serialize === undefined) {
    throw new TypeError(
      `Gelis response descriptor for status ${status} requires an explicit serializer when contentType is set`,
    );
  }

  if (descriptor.validate !== true && serialize === undefined) {
    throw new TypeError(
      `Gelis response descriptor for status ${status} enables no executable response behavior`,
    );
  }
}

function isBodylessStatus(status: number): boolean {
  return status === 204 || status === 205 || status === 304;
}

function isStandardSchemaValue(value: unknown): value is StandardSchemaV1 {
  return typeof value === "object" && value !== null && "~standard" in value;
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

function compileResponseFinalizer(
  entries: readonly RuntimeResponsePlanEntry[],
): RuntimeResponseFinalizer {
  const finalizeManaged = compileManagedResponseFinalizer(entries);

  return (value) => {
    /*
     * Direct raw Response bypasses the complete
     * managed response plan.
     */
    if (value instanceof Response) {
      return value;
    }

    if (isRuntimeReplyResult(value)) {
      return finalizeManaged(value.status, value.body);
    }

    /*
     * Direct undefined always means 204.
     *
     * It does not become status 200 merely because
     * a `200: undefined` contract exists.
     */
    if (value === undefined) {
      return finalizeManaged(204, undefined);
    }

    /*
     * Every other direct managed handler result
     * selects HTTP 200.
     */
    return finalizeManaged(200, value);
  };
}

function compileManagedResponseFinalizer(
  entries: readonly RuntimeResponsePlanEntry[],
): RuntimeManagedResponseFinalizer {
  if (entries.length === 0) {
    throw new Error("Executable Gelis response plan has no response entries");
  }

  const compiled = entries.map(compileResponseStatusEntry);

  /*
   * Small response contracts are expected to be the
   * common case. Avoid Map lookup for one to three
   * declared statuses.
   */
  if (compiled.length === 1) {
    const first = compiled[0];

    if (first === undefined) {
      throw new Error("Missing compiled response entry");
    }

    return (status, body) => {
      if (status === first.status) {
        return first.finalize(body);
      }

      throw undeclaredStatusError(status);
    };
  }

  if (compiled.length === 2) {
    const first = compiled[0];
    const second = compiled[1];

    if (first === undefined || second === undefined) {
      throw new Error("Missing compiled response entry");
    }

    return (status, body) => {
      if (status === first.status) {
        return first.finalize(body);
      }

      if (status === second.status) {
        return second.finalize(body);
      }

      throw undeclaredStatusError(status);
    };
  }

  if (compiled.length === 3) {
    const first = compiled[0];
    const second = compiled[1];
    const third = compiled[2];

    if (first === undefined || second === undefined || third === undefined) {
      throw new Error("Missing compiled response entry");
    }

    return (status, body) => {
      if (status === first.status) {
        return first.finalize(body);
      }

      if (status === second.status) {
        return second.finalize(body);
      }

      if (status === third.status) {
        return third.finalize(body);
      }

      throw undeclaredStatusError(status);
    };
  }

  /*
   * Larger contracts use a registration-time Map.
   * Descriptor interpretation is still completely
   * absent from request execution.
   */
  const byStatus = new Map<number, RuntimeStatusFinalizer>();

  for (const entry of compiled) {
    byStatus.set(entry.status, entry.finalize);
  }

  return (status, body) => {
    const finalize = byStatus.get(status);

    if (finalize === undefined) {
      throw undeclaredStatusError(status);
    }

    return finalize(body);
  };
}

function compileResponseStatusEntry(
  entry: RuntimeResponsePlanEntry,
): CompiledResponseEntry {
  const serializerFlags = entry.flags & RUNTIME_RESPONSE_SERIALIZER;

  let finalize: RuntimeStatusFinalizer;

  switch (serializerFlags) {
    case 0:
      finalize = compileAutoSerializer(entry.status);
      break;

    case RUNTIME_RESPONSE_JSON:
      finalize = compileJsonSerializer(entry.status, entry.contentType);
      break;

    case RUNTIME_RESPONSE_TEXT:
      finalize = compileTextSerializer(entry.status, entry.contentType);
      break;

    default:
      throw new Error("Invalid Gelis runtime response serializer flags");
  }

  if ((entry.flags & RUNTIME_RESPONSE_VALIDATE) !== 0) {
    const schema = entry.schema;

    if (schema === undefined) {
      throw new Error("Missing schema for validated Gelis response");
    }

    finalize = compileValidatedResponse(entry.status, schema, finalize);
  }

  return {
    status: entry.status,

    finalize,
  };
}

function compileAutoSerializer(status: number): RuntimeStatusFinalizer {
  return (body) => normalizeResponseWithStatus(status, body);
}

function compileJsonSerializer(
  status: number,

  contentType: string | undefined,
): RuntimeStatusFinalizer {
  const init: ResponseInit =
    contentType === undefined
      ? {
          status,
        }
      : {
          status,

          headers: {
            "content-type": contentType,
          },
        };

  return (body) => {
    try {
      return Response.json(body, init);
    } catch (cause) {
      throw new ResponseContractError(
        `Failed to serialize response for status ${status} as JSON`,

        {
          kind: "serialization",
          status,
          cause,
        },
      );
    }
  };
}

function compileTextSerializer(
  status: number,

  contentType: string | undefined,
): RuntimeStatusFinalizer {
  const init: ResponseInit = {
    status,

    headers: {
      "content-type": contentType ?? "text/plain; charset=utf-8",
    },
  };

  return (body) => {
    if (typeof body !== "string") {
      throw new ResponseContractError(
        `Response for status ${status} must be a string for text serialization`,

        {
          kind: "serialization",
          status,
        },
      );
    }

    try {
      return new Response(body, init);
    } catch (cause) {
      throw new ResponseContractError(
        `Failed to serialize response for status ${status} as text`,

        {
          kind: "serialization",
          status,
          cause,
        },
      );
    }
  };
}

function compileValidatedResponse(
  status: number,

  schema: StandardSchemaV1,

  finalize: RuntimeStatusFinalizer,
): RuntimeStatusFinalizer {
  return (body) => {
    /*
     * Deliberately do not wrap validator throws.
     * Schema exceptions retain their original
     * identity.
     */
    const validation = schema["~standard"].validate(body);

    if (isPromiseLike(validation)) {
      return Promise.resolve(validation).then((result) => {
        if (result.issues !== undefined) {
          throw validationError(status, result.issues);
        }

        /*
         * Standard Schema transformations are
         * canonical. Serialization receives
         * result.value, not the original body.
         */
        return finalize(result.value);
      });
    }

    if (validation.issues !== undefined) {
      throw validationError(status, validation.issues);
    }

    return finalize(validation.value);
  };
}

function validationError(
  status: number,

  issues: ReadonlyArray<StandardSchemaV1.Issue>,
): ResponseContractError {
  return new ResponseContractError(
    `Response validation failed for status ${status}`,

    {
      kind: "validation",
      status,
      issues,
    },
  );
}

function undeclaredStatusError(status: number): ResponseContractError {
  return new ResponseContractError(
    `Managed response status ${status} is not declared by the route`,

    {
      kind: "status",
      status,
    },
  );
}

function isPromiseLike<Value>(
  value: Value | PromiseLike<Value>,
): value is PromiseLike<Value> {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return false;
  }

  return (
    typeof (
      value as {
        then?: unknown;
      }
    ).then === "function"
  );
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
