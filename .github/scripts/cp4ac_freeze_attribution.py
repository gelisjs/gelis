from pathlib import Path
import subprocess

AA_REF = "origin/work/competitive-cp4aa-production-x-z-attribution"
AB_SOURCE = "2114489c11d555edfc13db2a6336435fd4879931"


def git_show(path: str) -> str:
    return subprocess.check_output(
        ["git", "show", f"{AA_REF}:{path}"], text=True
    )


harness = git_show("bench/runtime/cp4aa-production-x-z-attribution.mts")

replacements = [
    (
        'const CP4X_SOURCE = "efaa228231c920fee78053edeb5c8c094f324aca";\nconst CP4Z_SOURCE = "1b4057ad9d12bc28d2ab2ca7917924368fe99444";',
        'const CP4Z_SOURCE = "1b4057ad9d12bc28d2ab2ca7917924368fe99444";\nconst CP4AB_SOURCE = "2114489c11d555edfc13db2a6336435fd4879931";',
    ),
    (
        'const WORKER = join(HERE, "cp4aa-production-x-z-attribution-worker.mts");',
        'const WORKER = join(HERE, "cp4ac-production-z-ab-attribution-worker.mts");',
    ),
    ("gelis-cp4aa-production-", "gelis-cp4ac-production-"),
    (
        'const CP4X_WORKTREE = resolve(\n  REPOSITORY_ROOT,\n  "..",\n  `gelis-cp4aa-cp4x-${RUN_TOKEN}`,\n);',
        'const CP4Z_WORKTREE = resolve(\n  REPOSITORY_ROOT,\n  "..",\n  `gelis-cp4ac-cp4z-${RUN_TOKEN}`,\n);',
    ),
    ('type Source = "production" | "cp4x" | "cp4z";', 'type Source = "production" | "cp4z" | "cp4ab";'),
    ('const SOURCES: readonly Source[] = ["production", "cp4x", "cp4z"];', 'const SOURCES: readonly Source[] = ["production", "cp4z", "cp4ab"];'),
    ('["production", "cp4x", "cp4z"],', '["production", "cp4z", "cp4ab"],'),
    ('["production", "cp4z", "cp4x"],', '["production", "cp4ab", "cp4z"],'),
    ('["cp4x", "production", "cp4z"],', '["cp4z", "production", "cp4ab"],'),
    ('["cp4x", "cp4z", "production"],', '["cp4z", "cp4ab", "production"],'),
    ('["cp4z", "production", "cp4x"],', '["cp4ab", "production", "cp4z"],'),
    ('["cp4z", "cp4x", "production"],', '["cp4ab", "cp4z", "production"],'),
    ("let cp4xWorktreeCreated = false;", "let cp4zWorktreeCreated = false;"),
    (
        "  createWorktree(CP4X_WORKTREE, CP4X_SOURCE);\n  cp4xWorktreeCreated = true;",
        "  createWorktree(CP4Z_WORKTREE, CP4Z_SOURCE);\n  cp4zWorktreeCreated = true;",
    ),
    (
        '`CP4-AA CORRECTNESS PROBE: PASS (${CELLS.length * SOURCES.length}/${CELLS.length * SOURCES.length})`',
        '`CP4-AC CORRECTNESS PROBE: PASS (${CELLS.length * SOURCES.length}/${CELLS.length * SOURCES.length})`',
    ),
    (
        'console.log("CP4-AA LOCAL PRODUCTION-X-Z ATTRIBUTION RUN: COMPLETE");',
        'console.log("CP4-AC LOCAL PRODUCTION-Z-AB ATTRIBUTION RUN: COMPLETE");',
    ),
    (
        '"Competitive Performance v0.1 — CP4-AA production/X/Z balanced attribution",',
        '"Competitive Performance v0.1 — CP4-AC production/Z/AB balanced attribution",',
    ),
    ('console.log(`cp4x       src: ${CP4X_SOURCE}`);', 'console.log(`cp4z       src: ${CP4Z_SOURCE}`);'),
    ('console.log(`cp4z       src: ${CP4Z_SOURCE}`);', 'console.log(`cp4ab      src: ${CP4AB_SOURCE}`);'),
    (
        'console.log("| comparison | CP4-X | CP4-Z | Z / X |");',
        'console.log("| comparison | CP4-Z | CP4-AB | AB / Z |");',
    ),
    (
        '    const cp4x = getSummary(summaries, spec.cell, "cp4x").median;\n    const cp4z = getSummary(summaries, spec.cell, "cp4z").median;\n    console.log(\n      `| ${spec.label} | ${(cp4x / production).toFixed(4)}x | ${(cp4z / production).toFixed(4)}x | ${(cp4z / cp4x).toFixed(4)}x |`,\n    );',
        '    const cp4z = getSummary(summaries, spec.cell, "cp4z").median;\n    const cp4ab = getSummary(summaries, spec.cell, "cp4ab").median;\n    console.log(\n      `| ${spec.label} | ${(cp4z / production).toFixed(4)}x | ${(cp4ab / production).toFixed(4)}x | ${(cp4ab / cp4z).toFixed(4)}x |`,\n    );',
    ),
    (
        '"CP4-AA ATTRIBUTION ONLY: prior CP4-X/CP4-Z acceptance classifications remain unchanged.",',
        '"CP4-AC ATTRIBUTION ONLY: prior CP4-Z/CP4-AB acceptance classifications remain unchanged.",',
    ),
    (
        '      : source === "cp4x"\n        ? CP4X_WORKTREE\n        : REPOSITORY_ROOT;',
        '      : source === "cp4z"\n        ? CP4Z_WORKTREE\n        : REPOSITORY_ROOT;',
    ),
    ('if (Bun.version !== EXPECTED_BUN) {\n    throw new Error(`CP4-AA requires Bun ${EXPECTED_BUN}, got ${Bun.version}`);', 'if (Bun.version !== EXPECTED_BUN) {\n    throw new Error(`CP4-AC requires Bun ${EXPECTED_BUN}, got ${Bun.version}`);'),
    ('`CP4-AA requires Bun revision ${EXPECTED_BUN_REVISION}, got ${Bun.revision}`', '`CP4-AC requires Bun revision ${EXPECTED_BUN_REVISION}, got ${Bun.revision}`'),
    ('throw new Error(`CP4-AA requires a clean worktree:\\n${dirty}`);', 'throw new Error(`CP4-AC requires a clean worktree:\\n${dirty}`);'),
    (
        '      CP4Z_SOURCE,\n      "HEAD",',
        '      CP4AB_SOURCE,\n      "HEAD",',
    ),
    ('throw new Error(`src/** differs from frozen CP4-Z source ${CP4Z_SOURCE}`);', 'throw new Error(`src/** differs from frozen CP4-AB source ${CP4AB_SOURCE}`);'),
    ('if (cp4xWorktreeCreated) removeWorktree(CP4X_WORKTREE);', 'if (cp4zWorktreeCreated) removeWorktree(CP4Z_WORKTREE);'),
]

for old, new in replacements:
    if old not in harness:
        raise RuntimeError(f"missing expected CP4-AA token: {old[:120]!r}")
    harness = harness.replace(old, new, 1)

if "CP4-AA" in harness or "cp4x" in harness or "CP4X" in harness or "CP4X_WORKTREE" in harness:
    raise RuntimeError("unexpected CP4-AA/CP4-X residue in generated harness")

Path("bench/runtime/cp4ac-production-z-ab-attribution.mts").write_text(harness)
Path("bench/runtime/cp4ac-production-z-ab-attribution-worker.mts").write_text(
    'import "./cp4ab-dead-routing-metadata-production-acceptance-worker.mts";\n'
)

freeze = f"""# CP4-AC — production/Z/AB balanced attribution freeze

CP4-AC is a measurement-only attribution phase. It does not override or reopen any prior acceptance classification.

## Frozen identity

- Production: `af4e5102046def1b163435333563b8d08f919bf5`
- CP4-Z: `1b4057ad9d12bc28d2ab2ca7917924368fe99444`
- CP4-AB: `{AB_SOURCE}`
- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Routes: 5,000
- Samples: 12 balanced fresh-worker triplets per cell
- Orders: all six source permutations, each repeated twice per cell

## Frozen cells

1. static-only raw
2. mixed-static raw
3. mixed dynamic raw
4. pure trailing dynamic raw
5. generic dynamic raw
6. ALL dynamic raw
7. static registration

The first valid completed local timed run is authoritative attribution evidence as-is. It must not be rerun because the result is favorable, unfavorable, or surprising. No production promotion can be inferred from this attribution run.
"""
Path("docs/benchmarks/competitive-cp4ac-production-z-ab-attribution-freeze.md").write_text(freeze)
