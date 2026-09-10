export type SecureHeadersReferrerPolicy =
  | "no-referrer"
  | "no-referrer-when-downgrade"
  | "origin"
  | "origin-when-cross-origin"
  | "same-origin"
  | "strict-origin"
  | "strict-origin-when-cross-origin"
  | "unsafe-url";

export type SecureHeadersCrossOriginEmbedderPolicy =
  "unsafe-none" | "require-corp" | "credentialless";

export type SecureHeadersCrossOriginOpenerPolicy =
  | "unsafe-none"
  | "same-origin"
  | "same-origin-allow-popups"
  | "noopener-allow-popups";

export type SecureHeadersCrossOriginResourcePolicy =
  "same-origin" | "same-site" | "cross-origin";

export interface SecureHeadersStrictTransportSecurityOptions {
  readonly maxAge?: number;
  readonly includeSubDomains?: boolean;
  readonly preload?: boolean;
}

export interface SecureHeadersOptions {
  readonly contentSecurityPolicy?: string | false;
  readonly contentSecurityPolicyReportOnly?: string | false;
  readonly crossOriginEmbedderPolicy?:
    SecureHeadersCrossOriginEmbedderPolicy | false;
  readonly crossOriginOpenerPolicy?:
    SecureHeadersCrossOriginOpenerPolicy | false;
  readonly crossOriginResourcePolicy?:
    SecureHeadersCrossOriginResourcePolicy | false;
  readonly originAgentCluster?: boolean;
  readonly permissionsPolicy?: string | false;
  readonly referrerPolicy?: SecureHeadersReferrerPolicy | false;
  readonly strictTransportSecurity?:
    SecureHeadersStrictTransportSecurityOptions | false;
  readonly xContentTypeOptions?: boolean;
  readonly xFrameOptions?: "DENY" | "SAMEORIGIN" | false;
  readonly xXssProtection?: boolean;
  readonly removePoweredBy?: boolean;
}

export type CompiledSecureHeader = readonly [name: string, value: string];

export interface CompiledSecureHeadersPolicy {
  readonly headers: readonly CompiledSecureHeader[];
  readonly removePoweredBy: boolean;
}

const DEFAULT_HSTS_MAX_AGE = 31_536_000;

const REFERRER_POLICIES: readonly SecureHeadersReferrerPolicy[] = [
  "no-referrer",
  "no-referrer-when-downgrade",
  "origin",
  "origin-when-cross-origin",
  "same-origin",
  "strict-origin",
  "strict-origin-when-cross-origin",
  "unsafe-url",
];

const CROSS_ORIGIN_EMBEDDER_POLICIES: readonly SecureHeadersCrossOriginEmbedderPolicy[] =
  ["unsafe-none", "require-corp", "credentialless"];

const CROSS_ORIGIN_OPENER_POLICIES: readonly SecureHeadersCrossOriginOpenerPolicy[] =
  [
    "unsafe-none",
    "same-origin",
    "same-origin-allow-popups",
    "noopener-allow-popups",
  ];

const CROSS_ORIGIN_RESOURCE_POLICIES: readonly SecureHeadersCrossOriginResourcePolicy[] =
  ["same-origin", "same-site", "cross-origin"];

export function compileSecureHeadersPolicy(
  options?: SecureHeadersOptions,
): CompiledSecureHeadersPolicy {
  assertOptionsObject(options);

  const headers: CompiledSecureHeader[] = [];

  const strictTransportSecurity = options?.strictTransportSecurity;
  if (strictTransportSecurity !== false) {
    headers.push([
      "Strict-Transport-Security",
      compileStrictTransportSecurity(strictTransportSecurity),
    ]);
  }

  const xContentTypeOptions =
    options?.xContentTypeOptions === undefined
      ? true
      : options.xContentTypeOptions;
  assertBooleanOption("xContentTypeOptions", xContentTypeOptions);
  if (xContentTypeOptions) {
    headers.push(["X-Content-Type-Options", "nosniff"]);
  }

  const referrerPolicy =
    options?.referrerPolicy === undefined
      ? "no-referrer"
      : options.referrerPolicy;
  if (referrerPolicy !== false) {
    assertKnownOption("referrerPolicy", referrerPolicy, REFERRER_POLICIES);
    headers.push(["Referrer-Policy", referrerPolicy]);
  }

  const xFrameOptions =
    options?.xFrameOptions === undefined ? "SAMEORIGIN" : options.xFrameOptions;
  if (xFrameOptions !== false) {
    if (xFrameOptions !== "DENY" && xFrameOptions !== "SAMEORIGIN") {
      throw new TypeError(
        "Gelis secure headers xFrameOptions must be DENY, SAMEORIGIN, or false",
      );
    }

    headers.push(["X-Frame-Options", xFrameOptions]);
  }

  const xXssProtection =
    options?.xXssProtection === undefined ? true : options.xXssProtection;
  assertBooleanOption("xXssProtection", xXssProtection);
  if (xXssProtection) {
    headers.push(["X-XSS-Protection", "0"]);
  }

  appendStaticHeader(
    headers,
    "Content-Security-Policy",
    "contentSecurityPolicy",
    options?.contentSecurityPolicy,
  );
  appendStaticHeader(
    headers,
    "Content-Security-Policy-Report-Only",
    "contentSecurityPolicyReportOnly",
    options?.contentSecurityPolicyReportOnly,
  );

  const crossOriginEmbedderPolicy = options?.crossOriginEmbedderPolicy;
  if (
    crossOriginEmbedderPolicy !== undefined &&
    crossOriginEmbedderPolicy !== false
  ) {
    assertKnownOption(
      "crossOriginEmbedderPolicy",
      crossOriginEmbedderPolicy,
      CROSS_ORIGIN_EMBEDDER_POLICIES,
    );
    headers.push(["Cross-Origin-Embedder-Policy", crossOriginEmbedderPolicy]);
  }

  const crossOriginOpenerPolicy = options?.crossOriginOpenerPolicy;
  if (
    crossOriginOpenerPolicy !== undefined &&
    crossOriginOpenerPolicy !== false
  ) {
    assertKnownOption(
      "crossOriginOpenerPolicy",
      crossOriginOpenerPolicy,
      CROSS_ORIGIN_OPENER_POLICIES,
    );
    headers.push(["Cross-Origin-Opener-Policy", crossOriginOpenerPolicy]);
  }

  const crossOriginResourcePolicy = options?.crossOriginResourcePolicy;
  if (
    crossOriginResourcePolicy !== undefined &&
    crossOriginResourcePolicy !== false
  ) {
    assertKnownOption(
      "crossOriginResourcePolicy",
      crossOriginResourcePolicy,
      CROSS_ORIGIN_RESOURCE_POLICIES,
    );
    headers.push(["Cross-Origin-Resource-Policy", crossOriginResourcePolicy]);
  }

  const originAgentCluster =
    options?.originAgentCluster === undefined
      ? false
      : options.originAgentCluster;
  assertBooleanOption("originAgentCluster", originAgentCluster);
  if (originAgentCluster) {
    headers.push(["Origin-Agent-Cluster", "?1"]);
  }

  appendStaticHeader(
    headers,
    "Permissions-Policy",
    "permissionsPolicy",
    options?.permissionsPolicy,
  );

  const removePoweredBy =
    options?.removePoweredBy === undefined ? true : options.removePoweredBy;
  assertBooleanOption("removePoweredBy", removePoweredBy);

  return {
    headers,
    removePoweredBy,
  };
}

function compileStrictTransportSecurity(
  options: SecureHeadersStrictTransportSecurityOptions | undefined,
): string {
  if (
    options !== undefined &&
    (typeof options !== "object" || options === null || Array.isArray(options))
  ) {
    throw new TypeError(
      "Gelis secure headers strictTransportSecurity must be an object or false",
    );
  }

  const maxAge =
    options?.maxAge === undefined ? DEFAULT_HSTS_MAX_AGE : options.maxAge;
  if (!Number.isSafeInteger(maxAge) || maxAge < 0) {
    throw new TypeError(
      "Gelis secure headers strictTransportSecurity.maxAge must be a finite safe non-negative integer",
    );
  }

  const includeSubDomains =
    options?.includeSubDomains === undefined
      ? false
      : options.includeSubDomains;
  const preload = options?.preload === undefined ? false : options.preload;

  assertBooleanOption(
    "strictTransportSecurity.includeSubDomains",
    includeSubDomains,
  );
  assertBooleanOption("strictTransportSecurity.preload", preload);

  if (preload && (!includeSubDomains || maxAge < DEFAULT_HSTS_MAX_AGE)) {
    throw new TypeError(
      "Gelis secure headers HSTS preload requires includeSubDomains and maxAge >= 31536000",
    );
  }

  let value = `max-age=${maxAge}`;

  if (includeSubDomains) {
    value += "; includeSubDomains";
  }

  if (preload) {
    value += "; preload";
  }

  return value;
}

function appendStaticHeader(
  headers: CompiledSecureHeader[],
  headerName: string,
  optionName: string,
  value: string | false | undefined,
): void {
  if (value === undefined || value === false) {
    return;
  }

  assertStaticHeaderValue(optionName, value);
  headers.push([headerName, value]);
}

function assertStaticHeaderValue(
  optionName: string,
  value: unknown,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(
      `Gelis secure headers ${optionName} must be a non-empty HTTP header value or false`,
    );
  }

  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);

    if ((code < 32 && code !== 9) || code === 127) {
      throw new TypeError(
        `Gelis secure headers ${optionName} contains an invalid HTTP header value`,
      );
    }
  }

  try {
    const headers = new Headers();
    headers.set("X-Gelis-Secure-Headers-Validation", value);
  } catch {
    throw new TypeError(
      `Gelis secure headers ${optionName} contains an invalid HTTP header value`,
    );
  }
}

function assertKnownOption<const Value extends string>(
  optionName: string,
  value: unknown,
  allowed: readonly Value[],
): asserts value is Value {
  if (typeof value !== "string" || !allowed.includes(value as Value)) {
    throw new TypeError(
      `Gelis secure headers ${optionName} has an unsupported value`,
    );
  }
}

function assertBooleanOption(
  optionName: string,
  value: unknown,
): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`Gelis secure headers ${optionName} must be a boolean`);
  }
}

function assertOptionsObject(options: SecureHeadersOptions | undefined): void {
  if (
    options !== undefined &&
    (typeof options !== "object" || options === null || Array.isArray(options))
  ) {
    throw new TypeError("Gelis secure headers options must be an object");
  }
}
