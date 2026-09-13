from pathlib import Path
import subprocess

repo = Path.cwd()
source = subprocess.run(
    [
        "git",
        "show",
        "9f5fc901916f37823a43dd2349294396b456e135:bench/runtime/cp4al-all-dynamic-specialization-viability.mts",
    ],
    check=True,
    capture_output=True,
    text=True,
).stdout
worker = subprocess.run(
    [
        "git",
        "show",
        "9f5fc901916f37823a43dd2349294396b456e135:bench/runtime/cp4al-all-dynamic-specialization-viability-worker.mts",
    ],
    check=True,
    capture_output=True,
    text=True,
).stdout

text = source
replacements = [
    (
        'const CANDIDATE_SOURCE = "2a01866678b296a9618e17c245a897752f4d640a";',
        'const CANDIDATE_SOURCE = "b14c3a4e3c8cfb07c1461a0cf66a189c8b6ddb2b";',
    ),
    (
        '"cp4al-all-dynamic-specialization-viability-worker.mts"',
        '"cp4am-ak-inline-all-fallback-viability-worker.mts"',
    ),
    ('gelis-cp4al-control-', 'gelis-cp4am-control-'),
    ('gelis-cp4al-candidate-', 'gelis-cp4am-candidate-'),
    (
        '"Competitive Performance v0.1 — CP4-AL AK-control/candidate ALL dynamic specialization viability"',
        '"Competitive Performance v0.1 — CP4-AM AK-control/candidate inline ALL fallback viability"',
    ),
    (
        'Frozen CP4-AL ALL dynamic specialization viability gates',
        'Frozen CP4-AM AK + inline ALL fallback viability gates',
    ),
    (
        'CP4-AL ALL DYNAMIC SPECIALIZATION VIABILITY GATE',
        'CP4-AM AK INLINE ALL FALLBACK VIABILITY GATE',
    ),
    (
        'CP4-AL is viability-only; no production promotion is inferred from this phase.',
        'CP4-AM is viability-only; no production promotion is inferred from this phase.',
    ),
    (
        'CP4-AL LOCAL ALL DYNAMIC SPECIALIZATION VIABILITY RUN: COMPLETE',
        'CP4-AM LOCAL AK INLINE ALL FALLBACK VIABILITY RUN: COMPLETE',
    ),
    ('CP4-AL CORRECTNESS PROBE', 'CP4-AM CORRECTNESS PROBE'),
    ('CP4-AL requires Bun', 'CP4-AM requires Bun'),
    ('CP4-AL requires Bun revision', 'CP4-AM requires Bun revision'),
    (
        'CP4-AL requires a clean worktree:',
        'CP4-AM requires a clean worktree:',
    ),
    (
        'if (changed !== "src/runtime/router-all.ts\\nsrc/runtime/router.ts") {',
        'if (changed !== "src/runtime/router.ts") {',
    ),
    (
        'candidate must differ from CP4-AK only at router.ts and router-all.ts; got:',
        'candidate must differ from CP4-AK only at src/runtime/router.ts; got:',
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"missing replacement token: {old}")
    text = text.replace(old, new, 1)

required = [
    'const CONTROL_SOURCE = "658c22c0d12322e278d996f47c4373831d61ba9b";',
    'const CANDIDATE_SOURCE = "b14c3a4e3c8cfb07c1461a0cf66a189c8b6ddb2b";',
    '["mixed-static-raw", 1.01]',
    '["all-dynamic-raw", 0.985]',
    'CP4-AK source:',
]
for token in required:
    if token not in text:
        raise SystemExit(f"missing frozen token after transform: {token}")

(repo / "bench/runtime/cp4am-ak-inline-all-fallback-viability.mts").write_text(
    text,
    encoding="utf-8",
)
(repo / "bench/runtime/cp4am-ak-inline-all-fallback-viability-worker.mts").write_text(
    worker,
    encoding="utf-8",
)
