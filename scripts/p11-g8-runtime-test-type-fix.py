from pathlib import Path

path = Path("test/runtime/aot-managed-input-equivalence.test.ts")
text = path.read_text()
old = '    expect(binding?.input.bodyContentTypes).toEqual(["text/plain"]);\n'
new = '    expect(binding?.input?.bodyContentTypes).toEqual(["text/plain"]);\n'
if old not in text:
    raise SystemExit("missing managed input optional assertion anchor")
path.write_text(text.replace(old, new, 1))
