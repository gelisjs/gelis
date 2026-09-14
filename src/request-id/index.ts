import { defineCapability, definePlugin } from "../plugin";

import type { Capability, Plugin } from "../plugin";

import { createOfficialApplicationHttpMarker } from "../runtime/application-http";

import type { RuntimeApplicationHttpPolicy } from "../runtime/application-http";

import { compileRequestIdPolicy } from "./policy";
import { createRequestIdState } from "./state";

import type { RequestIdOptions } from "./policy";

export type {
  RequestIdGenerator,
  RequestIdOptions,
  RequestIdValidator,
} from "./policy";

export interface RequestIdCapability extends Plugin {
  readonly header: string;

  get(request: Request): string | undefined;
}

const requestIdApplicationCapability = defineCapability(
  "gelis.request-id.application-policy",
) as unknown as Capability<true>;

export function requestId(options?: RequestIdOptions): RequestIdCapability {
  const compiled = compileRequestIdPolicy(options);
  const state = createRequestIdState(compiled);

  const policy: RuntimeApplicationHttpPolicy = {
    prepare(request) {
      state.prepare(request);
    },

    finalize(request, response) {
      const value = state.get(request);

      if (value === undefined) {
        return response;
      }

      return setResponseHeader(response, compiled.header, value);
    },
  };

  const plugin = definePlugin("gelis/request-id", (context) => {
    requestIdApplicationCapability.provide(context, true);

    context.onRequest(
      createOfficialApplicationHttpMarker({
        kind: "request-id",
        policy,
      }),
    );
  });

  return {
    ...plugin,

    header: compiled.header,

    get(request) {
      return state.get(request);
    },
  };
}

function setResponseHeader(
  response: Response,
  name: string,
  value: string,
): Response {
  try {
    response.headers.set(name, value);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    headers.set(name, value);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}
