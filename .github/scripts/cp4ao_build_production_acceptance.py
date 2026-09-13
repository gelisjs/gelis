from pathlib import Path
import subprocess

repo = Path.cwd()
source_ref = "722cd386d349e1daa0ca974af08c4c70db10cabf"
source_path = "bench/runtime/cp4ai-lazy-capability-production-acceptance.mts"
worker_path = "bench/runtime/cp4ai-lazy-capability-production-acceptance-worker.mts"

source = subprocess.run(
    ["git", "show", f"{source_ref}:{source_path}"],
    check=True,
    capture_output=True,
    text=True,
).stdout
worker = subprocess.run(
    ["git", "show", f"{source_ref}:{worker_path}"],
    check=True,
    capture_output=True,
    text=True,
).stdout

text = source

specific = [
    (
        'const CP4_Z_SOURCE = "1b4057ad9d12bc28d2ab2ca7917924368fe99444";',
        'const CP4_AK_SOURCE = "658c22c0d12322e278d996f47c4373831d61ba9b";',
    ),
    (
        'const CANDIDATE_SOURCE = "a7751059eef1d3074e6e0a1c2d227b49889affe4";',
        'const CANDIDATE_SOURCE = "8734bc5a88749f107efd5925f70e304370261d17";',
    ),
    (
        '"cp4ai-lazy-capability-production-acceptance-worker.mts"',
        '"cp4ao-all-only-production-acceptance-worker.mts"',
    ),
    ('gelis-cp4ai-production-', 'gelis-cp4ao-production-'),
    ('gelis-cp4ai-cp4z-', 'gelis-cp4ao-cp4ak-'),
    (
        'if (sourceNames !== "src/runtime/router.ts") {',
        'if (sourceNames !== "src/runtime/router-all.ts\\nsrc/runtime/router.ts") {',
    ),
]
for old, new in specific:
    if old not in text:
        raise SystemExit(f"missing replacement token: {old}")
    text = text.replace(old, new, 1)

# Attribution identifiers occur throughout the harness and must move together.
text = text.replace("CP4_Z_WORKTREE", "CP4_AK_WORKTREE")
text = text.replace("CP4_Z_SOURCE", "CP4_AK_SOURCE")
text = text.replace("cp4zWorktreeCreated", "cp4akWorktreeCreated")
text = text.replace("cp4z", "cp4ak")
text = text.replace("CP4-Z", "CP4-AK")
text = text.replace("Z / production", "AK / production")
text = text.replace("candidate / Z", "candidate / AK")
text = text.replace("CP4-AI", "CP4-AO")

text = text.replace(
    "Competitive Performance v0.1 — CP4-AO lazy request-URL capability direct production acceptance",
    "Competitive Performance v0.1 — CP4-AO ALL-only method-miss elision direct production acceptance",
)
text = text.replace(
    "Frozen CP4-AO lazy request-URL capability direct production acceptance gates",
    "Frozen CP4-AO ALL-only method-miss elision direct production acceptance gates",
)
text = text.replace(
    "CP4-AO LAZY-CAPABILITY DIRECT PRODUCTION ACCEPTANCE GATE",
    "CP4-AO ALL-ONLY METHOD-MISS ELISION DIRECT PRODUCTION ACCEPTANCE GATE",
)
text = text.replace(
    "CP4-AO LOCAL LAZY-CAPABILITY PRODUCTION ACCEPTANCE RUN: COMPLETE",
    "CP4-AO LOCAL ALL-ONLY PRODUCTION ACCEPTANCE RUN: COMPLETE",
)

required = [
    'const PRODUCTION_SOURCE = "af4e5102046def1b163435333563b8d08f919bf5";',
    'const CP4_AK_SOURCE = "658c22c0d12322e278d996f47c4373831d61ba9b";',
    'const CANDIDATE_SOURCE = "8734bc5a88749f107efd5925f70e304370261d17";',
    'type Variant = "production" | "cp4ak" | "candidate";',
    'const VARIANTS: readonly Variant[] = ["production", "cp4ak", "candidate"];',
    '{ label: "static-only raw", value: staticOnlyRatio, limit: 1.02 }',
    'label: "mixed dynamic geomean"',
    'limit: 0.98',
    'label: "pure trailing dynamic raw"',
    'limit: 0.94',
    'label: "pure trailing dynamic JSON"',
    'limit: 0.95',
    '{ label: "ALL dynamic raw", value: allRatio, limit: 1.05 }',
]
for token in required:
    if token not in text:
        raise SystemExit(f"missing frozen token after transform: {token}")

for forbidden in ["cp4z", "CP4_Z", "CP4-Z"]:
    if forbidden in text:
        raise SystemExit(f"stale attribution token after transform: {forbidden}")

(repo / "bench/runtime/cp4ao-all-only-production-acceptance.mts").write_text(
    text,
    encoding="utf-8",
)
(repo / "bench/runtime/cp4ao-all-only-production-acceptance-worker.mts").write_text(
    worker,
    encoding="utf-8",
)
