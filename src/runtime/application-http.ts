import type { OnError } from "../error";
import type { OnRequest } from "../request";
import type { RuntimeFetch } from "./fetch";

export interface RuntimeApplicationHttpPolicy {
  wrap(innerFetch: RuntimeFetch): RuntimeFetch;

  wrapOnError(hook: OnError): OnError;
}

export interface RuntimeApplicationHttpPlan {
  readonly cors?: RuntimeApplicationHttpPolicy;
}

interface RuntimeApplicationHttpMarker {
  readonly kind: "cors";
  readonly policy: RuntimeApplicationHttpPolicy;
}

const GELIS_APPLICATION_HTTP_MARKER = Symbol(
  "gelis.internal.application-http.marker",
);

type MarkedOnRequest = OnRequest & {
  readonly [GELIS_APPLICATION_HTTP_MARKER]: RuntimeApplicationHttpMarker;
};

export interface RuntimeApplicationHttpExtraction {
  readonly onRequestHooks: readonly OnRequest[] | undefined;
  readonly plan: RuntimeApplicationHttpPlan | undefined;
}

/**
 * Private official-subpath bridge.
 *
 * The returned function is configuration metadata, not a runtime hook.
 * compileApplicationFetch() removes it from the ordinary onRequest plan.
 */
export function createOfficialApplicationHttpMarker(
  marker: RuntimeApplicationHttpMarker,
): OnRequest {
  const hook = (() => {
    throw new Error(
      "Gelis official application HTTP marker escaped compile-time extraction",
    );
  }) as MarkedOnRequest;

  Object.defineProperty(hook, GELIS_APPLICATION_HTTP_MARKER, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: marker,
  });

  return hook;
}

export function extractApplicationHttpPlan(
  hooks: readonly OnRequest[] | undefined,
): RuntimeApplicationHttpExtraction {
  if (hooks === undefined || hooks.length === 0) {
    return {
      onRequestHooks: hooks,
      plan: undefined,
    };
  }

  let cors: RuntimeApplicationHttpPolicy | undefined;
  let ordinaryCount = 0;

  for (let index = 0; index < hooks.length; index++) {
    const hook = hooks[index]!;
    const marker = readMarker(hook);

    if (marker === undefined) {
      ordinaryCount++;
      continue;
    }

    if (marker.kind === "cors") {
      if (cors !== undefined) {
        throw new Error("Multiple Gelis CORS application policies were compiled");
      }

      cors = marker.policy;
    }
  }

  if (cors === undefined) {
    return {
      onRequestHooks: hooks,
      plan: undefined,
    };
  }

  let ordinaryHooks: readonly OnRequest[] | undefined;

  if (ordinaryCount === 0) {
    ordinaryHooks = undefined;
  } else {
    const filtered = new Array<OnRequest>(ordinaryCount);
    let target = 0;

    for (let index = 0; index < hooks.length; index++) {
      const hook = hooks[index]!;

      if (readMarker(hook) === undefined) {
        filtered[target++] = hook;
      }
    }

    ordinaryHooks = filtered;
  }

  return {
    onRequestHooks: ordinaryHooks,
    plan: {
      cors,
    },
  };
}

export function compileApplicationHttpFetch(
  plan: RuntimeApplicationHttpPlan,
  innerFetch: RuntimeFetch,
): RuntimeFetch {
  let fetch = innerFetch;

  const cors = plan.cors;
  if (cors !== undefined) {
    fetch = cors.wrap(fetch);
  }

  return fetch;
}

export function compileApplicationHttpErrorHooks(
  plan: RuntimeApplicationHttpPlan,
  hooks: readonly OnError[],
): readonly OnError[] {
  const cors = plan.cors;

  if (cors === undefined || hooks.length === 0) {
    return hooks;
  }

  const compiled = new Array<OnError>(hooks.length);

  for (let index = 0; index < hooks.length; index++) {
    compiled[index] = cors.wrapOnError(hooks[index]!);
  }

  return compiled;
}

function readMarker(hook: OnRequest): RuntimeApplicationHttpMarker | undefined {
  return (hook as Partial<MarkedOnRequest>)[GELIS_APPLICATION_HTTP_MARKER];
}
