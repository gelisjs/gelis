from pathlib import Path
import subprocess

repo = Path.cwd()

source_harness = subprocess.run(
    [
        "git",
        "show",
        "76a0f870f90c5c6e44f90e3a3a12e880c8ae0507:bench/runtime/cp4ah-kind-primary-z-viability.mts",
    ],
    check=True,
    capture_output=True,
    text=True,
).stdout

worker = subprocess.run(
    [
        "git",
        "show",
        "8cac0e4b9cfde14629d677a311f5e2035697bc96:bench/runtime/cp4ae-kind-only-production-acceptance-worker.mts",
    ],
    check=True,
    capture_output=True,
    text=True,
).stdout

text = source_harness
strict_replacements = [
    (
        'const CP4Z_SOURCE = "1b4057ad9d12bc28d2ab2ca7917924368fe99444";',
        'const CONTROL_SOURCE = "a7751059eef1d3074e6e0a1c2d227b49889affe4";',
    ),
    (
        'const CANDIDATE_SOURCE = "0ec95837e912921624fa1b1d9d4f18c28dfe82cc";',
        'const CANDIDATE_SOURCE = "6149054010ce78f9285b8bb01f9ccb6947de144a";',
    ),
    (
        '"cp4ah-kind-primary-z-viability-worker.mts"',
        '"cp4aj-lazy-kind-primary-viability-worker.mts"',
    ),
    ('CP4Z_WORKTREE', 'CONTROL_WORKTREE'),
    ('cp4zWorktreeCreated', 'controlWorktreeCreated'),
    ('CP4Z_SOURCE', 'CONTROL_SOURCE'),
    ('gelis-cp4ah-cp4z-', 'gelis-cp4aj-control-'),
    ('gelis-cp4ah-candidate-', 'gelis-cp4aj-candidate-'),
    ('type Source = "cp4z" | "candidate";', 'type Source = "control" | "candidate";'),
    ('["cp4z", "candidate"]', '["control", "candidate"]'),
    ('["candidate", "cp4z"]', '["candidate", "control"]'),
    ('"cp4z"', '"control"'),
    ('cp4zValues', 'controlValues'),
    ('cp4zMedian', 'controlMedian'),
    ('const cp4z =', 'const control ='),
    ('candidate / cp4z', 'candidate / control'),
]

for old, new in strict_replacements:
    if old not in text:
        raise SystemExit(f"missing replacement token: {old}")
    text = text.replace(old, new)

text = text.replace("CP4-AH", "CP4-AJ")
text = text.replace("CP4-Z", "CP4-AI")
text = text.replace("Z/candidate KIND-primary viability", "AI-control/candidate lazy + KIND-primary viability")
text = text.replace("Z→candidate + 3 candidate→Z", "control→candidate + 3 candidate→control")
text = text.replace("candidate / Z", "candidate / AI control")
text = text.replace("KIND-primary Z viability", "lazy + KIND-primary composition viability")
text = text.replace("KIND-PRIMARY Z VIABILITY", "LAZY-KIND COMPOSITION VIABILITY")
text = text.replace("LOCAL KIND-PRIMARY Z VIABILITY RUN", "LOCAL LAZY-KIND COMPOSITION VIABILITY RUN")

if '["static-only-raw", 0.995],' not in text:
    raise SystemExit("missing static-only gate")
if '["mixed-static-raw", 1.01],' not in text:
    raise SystemExit("missing mixed-static gate")
text = text.replace('["static-only-raw", 0.995],', '["static-only-raw", 1.02],')
text = text.replace('["mixed-static-raw", 1.01],', '["mixed-static-raw", 0.975],')

if 'const control = getSummary(summaries, spec.cell, "control").median;' not in text:
    raise SystemExit("control summary replacement failed")
if 'candidate / control' not in text:
    raise SystemExit("control ratio replacement failed")

harness_path = repo / "bench/runtime/cp4aj-lazy-kind-primary-viability.mts"
worker_path = repo / "bench/runtime/cp4aj-lazy-kind-primary-viability-worker.mts"
harness_path.write_text(text, encoding="utf-8")
worker_path.write_text(worker, encoding="utf-8")
