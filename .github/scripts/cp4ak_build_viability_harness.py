from pathlib import Path
import subprocess

repo = Path.cwd()
source = subprocess.run(
    [
        "git",
        "show",
        "e290d0aa7783ba73ce3026733434771e2ca32eed:bench/runtime/cp4aj-lazy-kind-primary-viability.mts",
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

text = source
strict = [
    (
        'const CANDIDATE_SOURCE = "6149054010ce78f9285b8bb01f9ccb6947de144a";',
        'const CANDIDATE_SOURCE = "658c22c0d12322e278d996f47c4373831d61ba9b";',
    ),
    (
        '"cp4aj-lazy-kind-primary-viability-worker.mts"',
        '"cp4ak-static-leading-mask-viability-worker.mts"',
    ),
    ('gelis-cp4aj-control-', 'gelis-cp4ak-control-'),
    ('gelis-cp4aj-candidate-', 'gelis-cp4ak-candidate-'),
    (
        '  | "mixed-dynamic-raw"\n  | "trailing-dynamic-raw"',
        '  | "mixed-dynamic-raw"\n  | "mixed-same-length-dynamic-raw"\n  | "trailing-dynamic-raw"',
    ),
    (
        '  { cell: "mixed-dynamic-raw", label: "mixed dynamic raw" },\n  { cell: "trailing-dynamic-raw", label: "pure trailing dynamic raw" },',
        '  { cell: "mixed-dynamic-raw", label: "mixed dynamic raw" },\n  {\n    cell: "mixed-same-length-dynamic-raw",\n    label: "mixed same-length dynamic raw",\n  },\n  { cell: "trailing-dynamic-raw", label: "pure trailing dynamic raw" },',
    ),
    (
        '["mixed-static-raw", 0.975],\n    ["mixed-dynamic-raw", 1.02],\n    ["trailing-dynamic-raw", 1.02],',
        '["mixed-static-raw", 0.985],\n    ["mixed-dynamic-raw", 1.02],\n    ["mixed-same-length-dynamic-raw", 1.02],\n    ["trailing-dynamic-raw", 1.02],',
    ),
]

for old, new in strict:
    if old not in text:
        raise SystemExit(f"missing replacement token: {old}")
    text = text.replace(old, new, 1)

text = text.replace("CP4-AJ", "CP4-AK")
text = text.replace(
    "AI-control/candidate lazy + KIND-primary viability",
    "AI-control/candidate static-leading mask viability",
)
text = text.replace(
    "Frozen CP4-AK lazy + KIND-primary composition viability gates",
    "Frozen CP4-AK static-leading mask viability gates",
)
text = text.replace(
    "CP4-AK LAZY-KIND COMPOSITION VIABILITY GATE",
    "CP4-AK STATIC-LEADING MASK VIABILITY GATE",
)
text = text.replace(
    "CP4-AK LOCAL LAZY-KIND COMPOSITION VIABILITY RUN: COMPLETE",
    "CP4-AK LOCAL STATIC-LEADING MASK VIABILITY RUN: COMPLETE",
)

if 'CP4-AK STATIC-LEADING MASK VIABILITY GATE' not in text:
    raise SystemExit("CP4-AK gate marker replacement failed")
if 'mixed-same-length-dynamic-raw' not in text:
    raise SystemExit("same-length guard insertion failed")

(repo / "bench/runtime/cp4ak-static-leading-mask-viability.mts").write_text(
    text,
    encoding="utf-8",
)
(repo / "bench/runtime/cp4ak-static-leading-mask-viability-worker.mts").write_text(
    worker,
    encoding="utf-8",
)
