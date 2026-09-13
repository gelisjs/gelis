from pathlib import Path
import subprocess

repo = Path.cwd()
source_ref = "0d0220a340f308438b99ab4dd28014a21b1cd354"
source = subprocess.run(
    [
        "git",
        "show",
        f"{source_ref}:bench/runtime/cp4am-ak-inline-all-fallback-viability.mts",
    ],
    check=True,
    capture_output=True,
    text=True,
).stdout
worker = subprocess.run(
    [
        "git",
        "show",
        f"{source_ref}:bench/runtime/cp4am-ak-inline-all-fallback-viability-worker.mts",
    ],
    check=True,
    capture_output=True,
    text=True,
).stdout

text = source
replacements = [
    (
        'const CANDIDATE_SOURCE = "b14c3a4e3c8cfb07c1461a0cf66a189c8b6ddb2b";',
        'const CANDIDATE_SOURCE = "8734bc5a88749f107efd5925f70e304370261d17";',
    ),
    (
        '"cp4am-ak-inline-all-fallback-viability-worker.mts"',
        '"cp4an-all-only-method-miss-elision-viability-worker.mts"',
    ),
    ('gelis-cp4am-control-', 'gelis-cp4an-control-'),
    ('gelis-cp4am-candidate-', 'gelis-cp4an-candidate-'),
    (
        '"Competitive Performance v0.1 — CP4-AM AK-control/candidate inline ALL fallback viability"',
        '"Competitive Performance v0.1 — CP4-AN AK-control/candidate ALL-only method-miss elision viability"',
    ),
    (
        'Frozen CP4-AM AK + inline ALL fallback viability gates',
        'Frozen CP4-AN ALL-only method-miss elision viability gates',
    ),
    (
        'CP4-AM AK INLINE ALL FALLBACK VIABILITY GATE',
        'CP4-AN ALL-ONLY METHOD-MISS ELISION VIABILITY GATE',
    ),
    (
        'CP4-AM is viability-only; no production promotion is inferred from this phase.',
        'CP4-AN is viability-only; no production promotion is inferred from this phase.',
    ),
    (
        'CP4-AM LOCAL AK INLINE ALL FALLBACK VIABILITY RUN: COMPLETE',
        'CP4-AN LOCAL ALL-ONLY METHOD-MISS ELISION VIABILITY RUN: COMPLETE',
    ),
    ('CP4-AM CORRECTNESS PROBE', 'CP4-AN CORRECTNESS PROBE'),
    ('CP4-AM requires Bun', 'CP4-AN requires Bun'),
    ('CP4-AM requires Bun revision', 'CP4-AN requires Bun revision'),
    (
        'CP4-AM requires a clean worktree:',
        'CP4-AN requires a clean worktree:',
    ),
    (
        'if (changed !== "src/runtime/router.ts") {',
        'if (changed !== "src/runtime/router-all.ts\\nsrc/runtime/router.ts") {',
    ),
    (
        'candidate must differ from CP4-AK only at src/runtime/router.ts; got:',
        'candidate must differ from CP4-AK only at router.ts and router-all.ts; got:',
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"missing replacement token: {old}")
    text = text.replace(old, new, 1)

required = [
    'const CONTROL_SOURCE = "658c22c0d12322e278d996f47c4373831d61ba9b";',
    'const CANDIDATE_SOURCE = "8734bc5a88749f107efd5925f70e304370261d17";',
    '["mixed-static-raw", 1.01]',
    '["all-dynamic-raw", 0.985]',
    'CP4-AK source:',
]
for token in required:
    if token not in text:
        raise SystemExit(f"missing frozen token after transform: {token}")

(repo / "bench/runtime/cp4an-all-only-method-miss-elision-viability.mts").write_text(
    text,
    encoding="utf-8",
)
(repo / "bench/runtime/cp4an-all-only-method-miss-elision-viability-worker.mts").write_text(
    worker,
    encoding="utf-8",
)
