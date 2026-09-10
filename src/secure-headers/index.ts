import { defineCapability, definePlugin } from "../plugin";

import type { Capability, Plugin } from "../plugin";

import { createOfficialApplicationHttpMarker } from "../runtime/application-http";

import type { RuntimeApplicationHttpPolicy } from "../runtime/application-http";

import { compileSecureHeadersPolicy } from "./policy";

import type {
  CompiledSecureHeadersPolicy,
  SecureHeadersOptions,
} from "./policy";

export type {
  SecureHeadersCrossOriginEmbedderPolicy,
  SecureHeadersCrossOriginOpenerPolicy,
  SecureHeadersCrossOriginResourcePolicy,
  SecureHeadersOptions,
  SecureHeadersReferrerPolicy,
  SecureHeadersStrictTransportSecurityOptions,
} from "./policy";

const secureHeadersCapability = defineCapability(
  "gelis.secure-headers.application-policy",
) as unknown as Capability<true>;

export function secureHeaders(options?: SecureHeadersOptions): Plugin {
  const compiled = compileSecureHeadersPolicy(options);
  const policy = createSecureHeadersPolicy(compiled);

  return definePlugin("gelis/secure-headers", (context) => {
    secureHeadersCapability.provide(context, true);

    context.onRequest(
      createOfficialApplicationHttpMarker({
        kind: "secure-headers",
        policy,
      }),
    );
  });
}

function createSecureHeadersPolicy(
  compiled: CompiledSecureHeadersPolicy,
): RuntimeApplicationHttpPolicy {
  return {
    prepare() {},

    finalize(_request, response) {
      return mutateResponse(response, (headers) => {
        for (let index = 0; index < compiled.headers.length; index++) {
          const [name, value] = compiled.headers[index]!;
          headers.set(name, value);
        }

        if (compiled.removePoweredBy) {
          headers.delete("X-Powered-By");
        }
      });
    },
  };
}

function mutateResponse(
  response: Response,
  mutate: (headers: Headers) => void,
): Response {
  try {
    mutate(response.headers);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    mutate(headers);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}
