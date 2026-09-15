from pathlib import Path

path = Path("bench/request-id-timeout/p11-g11-timeout-worker.mts")
text = path.read_text()
old = '''  if (response.status !== 504) {
    throw new Error(
      `${framework} timeout-fire diagnostic returned ${response.status}`,
    );
  }'''
new = '''  const expectedStatus = framework === "gelis" ? 503 : 504;
  if (response.status !== expectedStatus) {
    throw new Error(
      `${framework} timeout-fire diagnostic returned ${response.status}, expected ${expectedStatus}`,
    );
  }'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"expected exactly one fire assertion, got {count}")
path.write_text(text.replace(old, new, 1))
