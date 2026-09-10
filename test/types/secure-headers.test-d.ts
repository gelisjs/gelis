import { Gelis } from "../../src/app";
import type { Plugin } from "../../src/plugin";
import {
  secureHeaders,
  type SecureHeadersCrossOriginEmbedderPolicy,
  type SecureHeadersCrossOriginOpenerPolicy,
  type SecureHeadersCrossOriginResourcePolicy,
  type SecureHeadersOptions,
  type SecureHeadersReferrerPolicy,
  type SecureHeadersStrictTransportSecurityOptions,
} from "../../src/secure-headers/index";

const app = new Gelis();

const strictTransportSecurity: SecureHeadersStrictTransportSecurityOptions = {
  maxAge: 31536000,
  includeSubDomains: true,
  preload: true,
};
const referrerPolicy: SecureHeadersReferrerPolicy =
  "strict-origin-when-cross-origin";
const embedderPolicy: SecureHeadersCrossOriginEmbedderPolicy = "credentialless";
const openerPolicy: SecureHeadersCrossOriginOpenerPolicy =
  "same-origin-allow-popups";
const resourcePolicy: SecureHeadersCrossOriginResourcePolicy = "cross-origin";

const options: SecureHeadersOptions = {
  contentSecurityPolicy: "default-src 'self'",
  contentSecurityPolicyReportOnly: "default-src 'none'",
  crossOriginEmbedderPolicy: embedderPolicy,
  crossOriginOpenerPolicy: openerPolicy,
  crossOriginResourcePolicy: resourcePolicy,
  originAgentCluster: true,
  permissionsPolicy: "camera=(), microphone=()",
  referrerPolicy,
  strictTransportSecurity,
  xContentTypeOptions: true,
  xFrameOptions: "DENY",
  xXssProtection: true,
  removePoweredBy: true,
};

const plugin: Plugin = secureHeaders(options);
app.use(plugin);

secureHeaders({ strictTransportSecurity: false });
secureHeaders({ referrerPolicy: false });
secureHeaders({ xFrameOptions: false });

// @ts-expect-error invalid Referrer-Policy token must fail statically.
secureHeaders({ referrerPolicy: "invalid-referrer-policy" });

// @ts-expect-error invalid COEP token must fail statically.
secureHeaders({ crossOriginEmbedderPolicy: "same-origin" });

// @ts-expect-error invalid COOP token must fail statically.
secureHeaders({ crossOriginOpenerPolicy: "require-corp" });

// @ts-expect-error invalid CORP token must fail statically.
secureHeaders({ crossOriginResourcePolicy: "credentialless" });

// @ts-expect-error ALLOW-FROM is intentionally unsupported.
secureHeaders({ xFrameOptions: "ALLOW-FROM" });

void app;
