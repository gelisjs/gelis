from pathlib import Path

path = Path("src/runtime/flat-aot-managed-input.ts")
text = path.read_text()
old = '''  const input = createRuntimeInputPlan(options);\n  const executionBoundary = resolveRuntimeRouteExecutionBoundary(\n    options.timeout,\n  );\n'''
new = '''  const input = createRuntimeInputPlan(options);\n  const executionBoundary =\n    options.timeout === undefined\n      ? undefined\n      : resolveRuntimeRouteExecutionBoundary(options.timeout);\n'''
if old not in text:
    raise SystemExit("missing optional timeout boundary anchor")
path.write_text(text.replace(old, new, 1))
