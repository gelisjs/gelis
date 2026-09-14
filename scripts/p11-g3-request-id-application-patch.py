from pathlib import Path

path = Path("src/runtime/application-http.ts")
text = path.read_text()

replacements = [
    (
        'export interface RuntimeApplicationHttpPlan {\n  readonly cors?: RuntimeApplicationHttpPolicy;\n  readonly secureHeaders?: RuntimeApplicationHttpPolicy;\n}\n\ninterface RuntimeApplicationHttpMarker {\n  readonly kind: "cors" | "secure-headers";\n',
        'export interface RuntimeApplicationHttpPlan {\n  readonly cors?: RuntimeApplicationHttpPolicy;\n  readonly secureHeaders?: RuntimeApplicationHttpPolicy;\n  readonly requestId?: RuntimeApplicationHttpPolicy;\n}\n\ninterface RuntimeApplicationHttpMarker {\n  readonly kind: "cors" | "secure-headers" | "request-id";\n',
    ),
    (
        '  let cors: RuntimeApplicationHttpPolicy | undefined;\n  let secureHeaders: RuntimeApplicationHttpPolicy | undefined;\n  let ordinaryCount = 0;\n',
        '  let cors: RuntimeApplicationHttpPolicy | undefined;\n  let secureHeaders: RuntimeApplicationHttpPolicy | undefined;\n  let requestId: RuntimeApplicationHttpPolicy | undefined;\n  let ordinaryCount = 0;\n',
    ),
    (
        '    if (secureHeaders !== undefined) {\n      throw new Error(\n        "Multiple Gelis secure-header application policies were compiled",\n      );\n    }\n\n    secureHeaders = marker.policy;\n  }\n\n  if (cors === undefined && secureHeaders === undefined) {\n',
        '    if (marker.kind === "secure-headers") {\n      if (secureHeaders !== undefined) {\n        throw new Error(\n          "Multiple Gelis secure-header application policies were compiled",\n        );\n      }\n\n      secureHeaders = marker.policy;\n      continue;\n    }\n\n    if (requestId !== undefined) {\n      throw new Error(\n        "Multiple Gelis request-ID application policies were compiled",\n      );\n    }\n\n    requestId = marker.policy;\n  }\n\n  if (\n    cors === undefined &&\n    secureHeaders === undefined &&\n    requestId === undefined\n  ) {\n',
    ),
    (
        '    plan: createApplicationHttpPlan(cors, secureHeaders),\n',
        '    plan: createApplicationHttpPlan(cors, secureHeaders, requestId),\n',
    ),
    (
        'function createApplicationHttpPlan(\n  cors: RuntimeApplicationHttpPolicy | undefined,\n  secureHeaders: RuntimeApplicationHttpPolicy | undefined,\n): RuntimeApplicationHttpPlan {\n  if (cors === undefined) {\n    return { secureHeaders: secureHeaders! };\n  }\n\n  if (secureHeaders === undefined) {\n    return { cors };\n  }\n\n  return {\n    cors,\n    secureHeaders,\n  };\n}\n',
        'function createApplicationHttpPlan(\n  cors: RuntimeApplicationHttpPolicy | undefined,\n  secureHeaders: RuntimeApplicationHttpPolicy | undefined,\n  requestId: RuntimeApplicationHttpPolicy | undefined,\n): RuntimeApplicationHttpPlan {\n  const plan: {\n    cors?: RuntimeApplicationHttpPolicy;\n    secureHeaders?: RuntimeApplicationHttpPolicy;\n    requestId?: RuntimeApplicationHttpPolicy;\n  } = {};\n\n  if (cors !== undefined) {\n    plan.cors = cors;\n  }\n\n  if (secureHeaders !== undefined) {\n    plan.secureHeaders = secureHeaders;\n  }\n\n  if (requestId !== undefined) {\n    plan.requestId = requestId;\n  }\n\n  return plan;\n}\n',
    ),
    (
        '  const secureHeaders = plan.secureHeaders;\n  if (secureHeaders !== undefined) {\n    fetch = compilePolicyFetch(secureHeaders, fetch, runtime);\n  }\n\n  return fetch;\n',
        '  const secureHeaders = plan.secureHeaders;\n  if (secureHeaders !== undefined) {\n    fetch = compilePolicyFetch(secureHeaders, fetch, runtime);\n  }\n\n  const requestId = plan.requestId;\n  if (requestId !== undefined) {\n    fetch = compilePolicyFetch(requestId, fetch, runtime);\n  }\n\n  return fetch;\n',
    ),
    (
        '  const cors = plan.cors;\n  const secureHeaders = plan.secureHeaders;\n\n  if (\n    (cors === undefined && secureHeaders === undefined) ||\n    hooks.length === 0\n  ) {\n',
        '  const cors = plan.cors;\n  const secureHeaders = plan.secureHeaders;\n  const requestId = plan.requestId;\n\n  if (\n    (cors === undefined &&\n      secureHeaders === undefined &&\n      requestId === undefined) ||\n    hooks.length === 0\n  ) {\n',
    ),
    (
        '    if (secureHeaders !== undefined) {\n      hook = compilePolicyErrorHook(secureHeaders, hook);\n    }\n\n    compiled[index] = hook;\n',
        '    if (secureHeaders !== undefined) {\n      hook = compilePolicyErrorHook(secureHeaders, hook);\n    }\n\n    if (requestId !== undefined) {\n      hook = compilePolicyErrorHook(requestId, hook);\n    }\n\n    compiled[index] = hook;\n',
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"missing expected application-http fragment:\n{old}")
    text = text.replace(old, new, 1)

path.write_text(text)
