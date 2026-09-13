from pathlib import Path

source_main = Path("bench/runtime/cp4z-mixed-static-first-production-acceptance.mts")
source_worker = Path("bench/runtime/cp4z-mixed-static-first-production-acceptance-worker.mts")

target_main = Path("bench/runtime/cp4ab-dead-routing-metadata-production-acceptance.mts")
target_worker = Path("bench/runtime/cp4ab-dead-routing-metadata-production-acceptance-worker.mts")
freeze_doc = Path("docs/benchmarks/competitive-cp4ab-dead-routing-metadata-production-acceptance-freeze.md")

candidate = "2114489c11d555edfc13db2a6336435fd4879931"
production = "af4e5102046def1b163435333563b8d08f919bf5"

text = source_main.read_text()
# Replace longer/specific identities before their shorter substrings so the
# generator remains assertion-driven without overlapping-token failures.
replacements = [
    ("1b4057ad9d12bc28d2ab2ca7917924368fe99444", candidate),
    ("cp4z-mixed-static-first-production-acceptance-worker.mts", "cp4ab-dead-routing-metadata-production-acceptance-worker.mts"),
    ("gelis-cp4z-production", "gelis-cp4ab-production"),
    ("Frozen CP4-Z mixed-static-first direct production acceptance gates", "Frozen CP4-AB dead routing metadata direct production acceptance gates"),
    ("CP4-Z MIXED-STATIC-FIRST DIRECT PRODUCTION ACCEPTANCE GATE", "CP4-AB DEAD ROUTING METADATA DIRECT PRODUCTION ACCEPTANCE GATE"),
    ("CP4-Z LOCAL MIXED-STATIC-FIRST PRODUCTION ACCEPTANCE RUN: COMPLETE", "CP4-AB LOCAL DEAD ROUTING METADATA PRODUCTION ACCEPTANCE RUN: COMPLETE"),
    ("CP4-Z production worktree remained after cleanup", "CP4-AB production worktree remained after cleanup"),
    ("src/** differs from frozen CP4-Z source", "src/** differs from frozen CP4-AB source"),
    ("CP4-Z CORRECTNESS PROBE", "CP4-AB CORRECTNESS PROBE"),
    ("CP4-Z requires a clean worktree", "CP4-AB requires a clean worktree"),
    ("CP4-Z requires Bun", "CP4-AB requires Bun"),
    ("CP4-Z source", "CP4-AB source"),
    ("CP4-Z mixed-static-first direct production acceptance", "CP4-AB dead routing metadata direct production acceptance"),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"missing expected token: {old}")
    text = text.replace(old, new)

if "CP4-Z" in text or "cp4z" in text:
    raise SystemExit("residual CP4-Z identity in generated harness")

target_main.write_text(text)
target_worker.write_text(source_worker.read_text())

freeze_doc.write_text(f'''# CP4-AB dead routing metadata — direct production acceptance freeze

- Production source: `{production}`
- Candidate source: `{candidate}`
- Routes: 5,000
- Samples: 12 mirrored fresh-worker pairs per cell pair (6 production→candidate, 6 candidate→production)
- CI timing: forbidden; CI may run correctness only.
- First valid completed local timed run is authoritative as-is.
- No rerun because of favorable, unfavorable, or near-threshold output.

Frozen gates are unchanged from CP4-Y/CP4-Z:

- static-only raw <= 1.0200x
- mixed static raw <= 1.0200x
- mixed dynamic raw <= 1.0200x
- mixed dynamic JSON <= 1.0200x
- mixed dynamic geomean <= 0.9800x
- mixed same-length dynamic raw <= 1.0200x
- pure trailing dynamic raw <= 0.9400x
- pure trailing dynamic JSON <= 0.9500x
- generic dynamic raw <= 1.0300x
- forced collision raw <= 1.1500x
- ALL dynamic raw <= 1.0500x
- static registration <= 1.0500x
- static retained heap <= 1.0500x

CP4-AB is a new source candidate. Its production-code delta from CP4-Z removes dead `fastMapKind` and `staticPathLengthMin` metadata while retaining `staticPathLengthMax` and CP4-Z request semantics.
''')
