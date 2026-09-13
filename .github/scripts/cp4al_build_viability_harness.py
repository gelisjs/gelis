from pathlib import Path
import subprocess

repo = Path.cwd()
source = subprocess.run(
    [
        "git",
        "show",
        "03d85e24da34a13980ae7999d6f945ab723caf30:bench/runtime/cp4ak-static-leading-mask-viability.mts",
    ],
    check=True,
    capture_output=True,
    text=True,
).stdout
worker = subprocess.run(
    [
        "git",
        "show",
        "03d85e24da34a13980ae7999d6f945ab723caf30:bench/runtime/cp4ak-static-leading-mask-viability-worker.mts",
    ],
    check=True,
    capture_output=True,
    text=True,
).stdout

text = source
strict = [
    (
        'const CONTROL_SOURCE = "a7751059eef1d3074e6e0a1c2d227b49889affe4";',
        'const CONTROL_SOURCE = "658c22c0d12322e278d996f47c4373831d61ba9b";',
    ),
    (
        'const CANDIDATE_SOURCE = "658c22c0d12322e278d996f47c4373831d61ba9b";',
        'const CANDIDATE_SOURCE = "2a01866678b296a9618e17c245a897752f4d640a";',
    ),
    (
        '"cp4ak-static-leading-mask-viability-worker.mts"',
        '"cp4al-all-dynamic-specialization-viability-worker.mts"',
    ),
    ('gelis-cp4ak-control-', 'gelis-cp4al-control-'),
    ('gelis-cp4ak-candidate-', 'gelis-cp4al-candidate-'),
    (
        '"Competitive Performance v0.1 — CP4-AK AI-control/candidate static-leading mask viability"',
        '"Competitive Performance v0.1 — CP4-AL AK-control/candidate ALL dynamic specialization viability"',
    ),
    ('CP4-AI source:', 'CP4-AK source:'),
    ('Overall candidate / AI control ratios', 'Overall candidate / AK control ratios'),
    ('Blockwise candidate / AI control ratios', 'Blockwise candidate / AK control ratios'),
    ('candidate / AI control', 'candidate / AK control'),
    ('| gate | candidate / AI control | limit | result |', '| gate | candidate / AK control | limit | result |'),
    (
        'Frozen CP4-AK static-leading mask viability gates',
        'Frozen CP4-AL ALL dynamic specialization viability gates',
    ),
    (
        '["mixed-static-raw", 0.985],',
        '["mixed-static-raw", 1.01],',
    ),
    (
        '["all-dynamic-raw", 1.02],',
        '["all-dynamic-raw", 0.985],',
    ),
    (
        'CP4-AK STATIC-LEADING MASK VIABILITY GATE',
        'CP4-AL ALL DYNAMIC SPECIALIZATION VIABILITY GATE',
    ),
    (
        'CP4-AK is viability-only; no production promotion is inferred from this phase.',
        'CP4-AL is viability-only; no production promotion is inferred from this phase.',
    ),
    (
        'CP4-AK LOCAL STATIC-LEADING MASK VIABILITY RUN: COMPLETE',
        'CP4-AL LOCAL ALL DYNAMIC SPECIALIZATION VIABILITY RUN: COMPLETE',
    ),
    (
        'CP4-AK CORRECTNESS PROBE',
        'CP4-AL CORRECTNESS PROBE',
    ),
    (
        'CP4-AK requires Bun',
        'CP4-AL requires Bun',
    ),
    (
        'CP4-AK requires Bun revision',
        'CP4-AL requires Bun revision',
    ),
    (
        'CP4-AK requires a clean worktree:',
        'CP4-AL requires a clean worktree:',
    ),
    (
        'if (changed !== "src/runtime/router.ts") {',
        'if (changed !== "src/runtime/router-all.ts\\nsrc/runtime/router.ts") {',
    ),
    (
        'candidate must differ from CP4-AI only at src/runtime/router.ts; got:',
        'candidate must differ from CP4-AK only at router.ts and router-all.ts; got:',
    ),
]

for old, new in strict:
    if old not in text:
        raise SystemExit(f"missing replacement token: {old}")
    text = text.replace(old, new, 1)

if 'const CONTROL_SOURCE = "658c22c0d12322e278d996f47c4373831d61ba9b";' not in text:
    raise SystemExit("control source replacement failed")
if 'const CANDIDATE_SOURCE = "2a01866678b296a9618e17c245a897752f4d640a";' not in text:
    raise SystemExit("candidate source replacement failed")
if 'CP4-AK source:' not in text:
    raise SystemExit("control label replacement failed")
if 'Blockwise candidate / AK control ratios' not in text:
    raise SystemExit("blockwise control label replacement failed")
if '| gate | candidate / AK control | limit | result |' not in text:
    raise SystemExit("gate control label replacement failed")
if '["mixed-static-raw", 1.01]' not in text:
    raise SystemExit("mixed-static guard replacement failed")
if '["all-dynamic-raw", 0.985]' not in text:
    raise SystemExit("ALL recovery gate replacement failed")

(repo / "bench/runtime/cp4al-all-dynamic-specialization-viability.mts").write_text(
    text,
    encoding="utf-8",
)
(repo / "bench/runtime/cp4al-all-dynamic-specialization-viability-worker.mts").write_text(
    worker,
    encoding="utf-8",
)
