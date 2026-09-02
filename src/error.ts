import type { StandardSchemaV1 } from "./schema";

export interface OnErrorContext {
  readonly request: Request;
  readonly error: unknown;
}

export type OnError = (
  context: OnErrorContext,
) => unknown | PromiseLike<unknown>;

export type ResponseContractErrorKind =
  | "validation"
  | "serialization"
  | "status";

export interface ResponseContractErrorOptions {
  readonly kind: ResponseContractErrorKind;

  readonly status?: number;

  readonly issues?: ReadonlyArray<StandardSchemaV1.Issue>;

  readonly cause?: unknown;
}

export class ResponseContractError extends Error {
  readonly code = "RESPONSE_CONTRACT_ERROR";

  readonly kind: ResponseContractErrorKind;

  readonly status: number | undefined;

  readonly issues: ReadonlyArray<StandardSchemaV1.Issue> | undefined;

  constructor(
    message: string,

    options: ResponseContractErrorOptions,
  ) {
    super(
      message,

      options.cause === undefined
        ? undefined
        : {
            cause: options.cause,
          },
    );

    this.name = "ResponseContractError";

    this.kind = options.kind;

    this.status = options.status;

    this.issues = options.issues;
  }
}
