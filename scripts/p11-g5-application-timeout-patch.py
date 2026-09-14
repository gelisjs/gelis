from pathlib import Path

path = Path("src/runtime/application-http.ts")
text = path.read_text()

replacements = [
    (
        '''export interface RuntimeApplicationHttpPlan {\n  readonly cors?: RuntimeApplicationHttpPolicy;\n  readonly secureHeaders?: RuntimeApplicationHttpPolicy;\n  readonly requestId?: RuntimeApplicationHttpPolicy;\n}\n\ninterface RuntimeApplicationHttpMarker {\n  readonly kind: "cors" | "secure-headers" | "request-id";\n  readonly policy: RuntimeApplicationHttpPolicy;\n}\n''',
        '''export interface RuntimeApplicationTimeoutPolicy {\n  run(request: Request, innerFetch: RuntimeFetch): Response | Promise<Response>;\n}\n\nexport interface RuntimeApplicationHttpPlan {\n  readonly cors?: RuntimeApplicationHttpPolicy;\n  readonly timeout?: RuntimeApplicationTimeoutPolicy;\n  readonly secureHeaders?: RuntimeApplicationHttpPolicy;\n  readonly requestId?: RuntimeApplicationHttpPolicy;\n}\n\ntype RuntimeApplicationHttpMarker =\n  | {\n      readonly kind: "cors" | "secure-headers" | "request-id";\n      readonly policy: RuntimeApplicationHttpPolicy;\n    }\n  | {\n      readonly kind: "timeout";\n      readonly policy: RuntimeApplicationTimeoutPolicy;\n    };\n''',
    ),
    (
        '''  let cors: RuntimeApplicationHttpPolicy | undefined;\n  let secureHeaders: RuntimeApplicationHttpPolicy | undefined;\n  let requestId: RuntimeApplicationHttpPolicy | undefined;\n  let ordinaryCount = 0;\n''',
        '''  let cors: RuntimeApplicationHttpPolicy | undefined;\n  let timeout: RuntimeApplicationTimeoutPolicy | undefined;\n  let secureHeaders: RuntimeApplicationHttpPolicy | undefined;\n  let requestId: RuntimeApplicationHttpPolicy | undefined;\n  let ordinaryCount = 0;\n''',
    ),
    (
        '''    if (marker.kind === "secure-headers") {\n      if (secureHeaders !== undefined) {\n        throw new Error(\n          "Multiple Gelis secure-header application policies were compiled",\n        );\n      }\n\n      secureHeaders = marker.policy;\n      continue;\n    }\n\n    if (requestId !== undefined) {\n''',
        '''    if (marker.kind === "timeout") {\n      if (timeout !== undefined) {\n        throw new Error(\n          "Multiple Gelis timeout application policies were compiled",\n        );\n      }\n\n      timeout = marker.policy;\n      continue;\n    }\n\n    if (marker.kind === "secure-headers") {\n      if (secureHeaders !== undefined) {\n        throw new Error(\n          "Multiple Gelis secure-header application policies were compiled",\n        );\n      }\n\n      secureHeaders = marker.policy;\n      continue;\n    }\n\n    if (requestId !== undefined) {\n''',
    ),
    (
        '''    cors === undefined &&\n    secureHeaders === undefined &&\n    requestId === undefined\n''',
        '''    cors === undefined &&\n    timeout === undefined &&\n    secureHeaders === undefined &&\n    requestId === undefined\n''',
    ),
    (
        '''    plan: createApplicationHttpPlan(cors, secureHeaders, requestId),\n''',
        '''    plan: createApplicationHttpPlan(\n      cors,\n      timeout,\n      secureHeaders,\n      requestId,\n    ),\n''',
    ),
    (
        '''function createApplicationHttpPlan(\n  cors: RuntimeApplicationHttpPolicy | undefined,\n  secureHeaders: RuntimeApplicationHttpPolicy | undefined,\n  requestId: RuntimeApplicationHttpPolicy | undefined,\n): RuntimeApplicationHttpPlan {\n  const plan: {\n    cors?: RuntimeApplicationHttpPolicy;\n    secureHeaders?: RuntimeApplicationHttpPolicy;\n    requestId?: RuntimeApplicationHttpPolicy;\n  } = {};\n''',
        '''function createApplicationHttpPlan(\n  cors: RuntimeApplicationHttpPolicy | undefined,\n  timeout: RuntimeApplicationTimeoutPolicy | undefined,\n  secureHeaders: RuntimeApplicationHttpPolicy | undefined,\n  requestId: RuntimeApplicationHttpPolicy | undefined,\n): RuntimeApplicationHttpPlan {\n  const plan: {\n    cors?: RuntimeApplicationHttpPolicy;\n    timeout?: RuntimeApplicationTimeoutPolicy;\n    secureHeaders?: RuntimeApplicationHttpPolicy;\n    requestId?: RuntimeApplicationHttpPolicy;\n  } = {};\n''',
    ),
    (
        '''  if (cors !== undefined) {\n    plan.cors = cors;\n  }\n\n  if (secureHeaders !== undefined) {\n''',
        '''  if (cors !== undefined) {\n    plan.cors = cors;\n  }\n\n  if (timeout !== undefined) {\n    plan.timeout = timeout;\n  }\n\n  if (secureHeaders !== undefined) {\n''',
    ),
    (
        '''  let fetch = innerFetch;\n\n  const cors = plan.cors;\n''',
        '''  let fetch = innerFetch;\n\n  const timeout = plan.timeout;\n  if (timeout !== undefined) {\n    fetch = compileTimeoutPolicyFetch(timeout, fetch);\n  }\n\n  const cors = plan.cors;\n''',
    ),
    (
        '''function compilePolicyFetch(\n  policy: RuntimeApplicationHttpPolicy,\n''',
        '''function compileTimeoutPolicyFetch(\n  policy: RuntimeApplicationTimeoutPolicy,\n  innerFetch: RuntimeFetch,\n): RuntimeFetch {\n  return (request) => policy.run(request, innerFetch);\n}\n\nfunction compilePolicyFetch(\n  policy: RuntimeApplicationHttpPolicy,\n''',
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"missing patch anchor:\n{old}")
    text = text.replace(old, new, 1)

path.write_text(text)

index_path = Path("src/timeout/index.ts")
index_text = index_path.read_text()
index_text = index_text.replace('import type { TimeoutSource } from "./error";\n', '')
index_text = index_text.replace('\nvoid (undefined as unknown as TimeoutSource);\n', '\n')
index_path.write_text(index_text)
