import { defineCapability, definePlugin } from "../plugin";

import type { Capability, Plugin } from "../plugin";

import { createOfficialApplicationHttpMarker } from "../runtime/application-http";

import type { RuntimeApplicationHttpPolicy } from "../runtime/application-http";

import { compileRequestIdPolicy } from "./policy";
import { createRequestIdState } from "./state";

import type { RequestIdOptions } from "./policy";

export type { RequestIdOptions, RequestIdTrustIncoming } from "./policy";

export interface RequestIdCapability extends Plugin {
  get(request: Request): string | undefined;
}

const requestIdCapability = defineCapability(
  "gelis.request-id.application-policy",
) as unknown as Capability<true>;

export function requestId(options?: RequestIdOptions): RequestIdCapability {
  const compiled = compileRequestIdPolicy(options);
  const state = createRequestIdState(compiled);
  const policy = createRequestIdPolicy(compiled.headerName, state);

  const plugin = definePlugin("gelis/request-id", (context) => {
    requestIdCapability.provide(context, true);

    context.onRequest(
      createOfficialApplicationHttpMarker({
        kind: "request-id",
        policy,
      }),
    );
  });

  return {
    ...plugin,
    get(request) {
      return state.get(request);
    },
  };
}

function createRequestIdPolicy(
  headerName: string,
  state: ReturnType<typeof createRequestIdState>,
): RuntimeApplicationHttpPolicy {
  return {
    prepare(request) {
      state.prepare(request);
    },

    finalize(request, response) {
      const resolved = state.get(request);
      if (resolved === undefined) {
        return response;
      }

      return mutateResponse(response, (headers) => {
        headers.set(headerName, resolved);
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
