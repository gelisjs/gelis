import { describe, expect, test } from "bun:test";

import {
  compileSecureHeadersPolicy,
  type SecureHeadersOptions,
} from "../../src/secure-headers/policy";

describe("P11-F secure-header static policy compiler", () => {
  test("compiles the frozen default policy exactly", () => {
    expect(compileSecureHeadersPolicy()).toEqual({
      headers: [
        ["Strict-Transport-Security", "max-age=31536000"],
        ["X-Content-Type-Options", "nosniff"],
        ["Referrer-Policy", "no-referrer"],
        ["X-Frame-Options", "SAMEORIGIN"],
        ["X-XSS-Protection", "0"],
      ],
      removePoweredBy: true,
    });
  });

  test("compiles custom and disabled HSTS policy", () => {
    expect(
      compileSecureHeadersPolicy({
        strictTransportSecurity: {
          maxAge: 31_536_000,
          includeSubDomains: true,
          preload: true,
        },
      }).headers[0],
    ).toEqual([
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    ]);

    expect(
      compileSecureHeadersPolicy({ strictTransportSecurity: false }).headers,
    ).not.toContainEqual(["Strict-Transport-Security", "max-age=31536000"]);

    expect(
      compileSecureHeadersPolicy({
        strictTransportSecurity: { maxAge: 0 },
      }).headers[0],
    ).toEqual(["Strict-Transport-Security", "max-age=0"]);
  });

  test("rejects invalid HSTS maxAge and preload combinations", () => {
    for (const maxAge of [-1, 1.5, Number.POSITIVE_INFINITY]) {
      expect(() =>
        compileSecureHeadersPolicy({
          strictTransportSecurity: { maxAge },
        }),
      ).toThrow(TypeError);
    }

    expect(() =>
      compileSecureHeadersPolicy({
        strictTransportSecurity: { preload: true },
      }),
    ).toThrow(TypeError);

    expect(() =>
      compileSecureHeadersPolicy({
        strictTransportSecurity: {
          maxAge: 31_535_999,
          includeSubDomains: true,
          preload: true,
        },
      }),
    ).toThrow(TypeError);
  });

  test("compiles opt-in static browser policies", () => {
    const policy = compileSecureHeadersPolicy({
      contentSecurityPolicy: "default-src 'self'",
      contentSecurityPolicyReportOnly: "default-src 'none'",
      crossOriginEmbedderPolicy: "credentialless",
      crossOriginOpenerPolicy: "same-origin-allow-popups",
      crossOriginResourcePolicy: "same-site",
      originAgentCluster: true,
      permissionsPolicy: "camera=(), microphone=()",
      referrerPolicy: "strict-origin-when-cross-origin",
      xFrameOptions: "DENY",
    });

    expect(policy.headers).toContainEqual([
      "Content-Security-Policy",
      "default-src 'self'",
    ]);
    expect(policy.headers).toContainEqual([
      "Content-Security-Policy-Report-Only",
      "default-src 'none'",
    ]);
    expect(policy.headers).toContainEqual([
      "Cross-Origin-Embedder-Policy",
      "credentialless",
    ]);
    expect(policy.headers).toContainEqual([
      "Cross-Origin-Opener-Policy",
      "same-origin-allow-popups",
    ]);
    expect(policy.headers).toContainEqual([
      "Cross-Origin-Resource-Policy",
      "same-site",
    ]);
    expect(policy.headers).toContainEqual(["Origin-Agent-Cluster", "?1"]);
    expect(policy.headers).toContainEqual([
      "Permissions-Policy",
      "camera=(), microphone=()",
    ]);
    expect(policy.headers).toContainEqual([
      "Referrer-Policy",
      "strict-origin-when-cross-origin",
    ]);
    expect(policy.headers).toContainEqual(["X-Frame-Options", "DENY"]);
  });

  test("leaves disabled default-managed headers unmanaged", () => {
    const policy = compileSecureHeadersPolicy({
      strictTransportSecurity: false,
      xContentTypeOptions: false,
      referrerPolicy: false,
      xFrameOptions: false,
      xXssProtection: false,
      removePoweredBy: false,
    });

    expect(policy).toEqual({
      headers: [],
      removePoweredBy: false,
    });
  });

  test("rejects unsupported runtime token values", () => {
    expect(() =>
      compileRuntimeOptions({ referrerPolicy: "sometimes" }),
    ).toThrow(TypeError);
    expect(() =>
      compileRuntimeOptions({ crossOriginEmbedderPolicy: "unsafe" }),
    ).toThrow(TypeError);
    expect(() =>
      compileRuntimeOptions({ crossOriginOpenerPolicy: "same-site" }),
    ).toThrow(TypeError);
    expect(() =>
      compileRuntimeOptions({ crossOriginResourcePolicy: "credentialless" }),
    ).toThrow(TypeError);
    expect(() =>
      compileRuntimeOptions({ xFrameOptions: "ALLOW-FROM" }),
    ).toThrow(TypeError);
  });

  test("rejects invalid static header values instead of repairing them", () => {
    const invalidValues = [
      "",
      "   ",
      "default-src 'self'\r\nX-Evil: 1",
      "a\u0000b",
    ];

    for (const value of invalidValues) {
      expect(() =>
        compileRuntimeOptions({ contentSecurityPolicy: value }),
      ).toThrow(TypeError);
    }

    expect(() =>
      compileRuntimeOptions({ permissionsPolicy: "camera=()\nX-Evil: 1" }),
    ).toThrow(TypeError);
  });

  test("validates boolean options for untyped callers", () => {
    expect(() => compileRuntimeOptions({ xContentTypeOptions: "yes" })).toThrow(
      TypeError,
    );
    expect(() => compileRuntimeOptions({ xXssProtection: 1 })).toThrow(
      TypeError,
    );
    expect(() => compileRuntimeOptions({ originAgentCluster: "true" })).toThrow(
      TypeError,
    );
    expect(() => compileRuntimeOptions({ removePoweredBy: null })).toThrow(
      TypeError,
    );
  });

  test("rejects null instead of treating it as an omitted option", () => {
    const nullOptions = [
      { xContentTypeOptions: null },
      { referrerPolicy: null },
      { xFrameOptions: null },
      { xXssProtection: null },
      { originAgentCluster: null },
      { removePoweredBy: null },
      { strictTransportSecurity: null },
      { strictTransportSecurity: { maxAge: null } },
      { strictTransportSecurity: { includeSubDomains: null } },
      { strictTransportSecurity: { preload: null } },
    ];

    for (const options of nullOptions) {
      expect(() => compileRuntimeOptions(options)).toThrow(TypeError);
    }
  });

  test("rejects invalid top-level and HSTS option shapes", () => {
    expect(() => compileRuntimeOptions(null)).toThrow(TypeError);
    expect(() => compileRuntimeOptions([])).toThrow(TypeError);
    expect(() =>
      compileRuntimeOptions({ strictTransportSecurity: [] }),
    ).toThrow(TypeError);
    expect(() =>
      compileRuntimeOptions({
        strictTransportSecurity: { includeSubDomains: "yes" },
      }),
    ).toThrow(TypeError);
  });
});

function compileRuntimeOptions(options: unknown) {
  return compileSecureHeadersPolicy(options as SecureHeadersOptions);
}
