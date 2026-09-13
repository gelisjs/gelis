from pathlib import Path
import subprocess

SOURCE_COMMIT = "8cac0e4b9cfde14629d677a311f5e2035697bc96"
SOURCE_HARNESS = "bench/runtime/cp4ae-kind-only-production-acceptance.mts"
SOURCE_WORKER = "bench/runtime/cp4ae-kind-only-production-acceptance-worker.mts"
TARGET_HARNESS = Path("bench/runtime/cp4ai-lazy-capability-production-acceptance.mts")
TARGET_WORKER = Path("bench/runtime/cp4ai-lazy-capability-production-acceptance-worker.mts")


def git_show(path: str) -> str:
    return subprocess.check_output(
        ["git", "show", f"{SOURCE_COMMIT}:{path}"], text=True
    )


text = git_show(SOURCE_HARNESS)
worker = git_show(SOURCE_WORKER)

replacements = [
    (
        'const CANDIDATE_SOURCE = "408f9856f814184ca0204aa49d3812af8660f077";',
        'const CP4_Z_SOURCE = "1b4057ad9d12bc28d2ab2ca7917924368fe99444";\nconst CANDIDATE_SOURCE = "a7751059eef1d3074e6e0a1c2d227b49889affe4";',
    ),
    (
        'const WORKER = join(HERE, "cp4ae-kind-only-production-acceptance-worker.mts");',
        'const WORKER = join(\n  HERE,\n  "cp4ai-lazy-capability-production-acceptance-worker.mts",\n);',
    ),
    ('gelis-cp4ae-production-', 'gelis-cp4ai-production-'),
    (
        'type Variant = "production" | "candidate";',
        'type Variant = "production" | "cp4z" | "candidate";',
    ),
    (
        'const VARIANTS: readonly Variant[] = ["production", "candidate"];',
        'const VARIANTS: readonly Variant[] = ["production", "cp4z", "candidate"];',
    ),
    (
        '''const ORDERS: readonly (readonly Variant[])[] = [
  ["production", "candidate"],
  ["candidate", "production"],
];''',
        '''const ORDERS: readonly (readonly Variant[])[] = [
  ["production", "cp4z", "candidate"],
  ["production", "candidate", "cp4z"],
  ["cp4z", "production", "candidate"],
  ["cp4z", "candidate", "production"],
  ["candidate", "production", "cp4z"],
  ["candidate", "cp4z", "production"],
];''',
    ),
    ('CP4-AE', 'CP4-AI'),
    ('KIND-only direct production acceptance', 'lazy request-URL capability direct production acceptance'),
    ('KIND-ONLY DIRECT PRODUCTION ACCEPTANCE', 'LAZY-CAPABILITY DIRECT PRODUCTION ACCEPTANCE'),
    ('LOCAL KIND-ONLY PRODUCTION ACCEPTANCE RUN', 'LOCAL LAZY-CAPABILITY PRODUCTION ACCEPTANCE RUN'),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"missing replacement token: {old}")
    text = text.replace(old, new)

prod_worktree = '''const PRODUCTION_WORKTREE = resolve(
  REPOSITORY_ROOT,
  "..",
  `gelis-cp4ai-production-${process.pid}-${Date.now()}`,
);'''
replacement_worktrees = prod_worktree + '''
const CP4_Z_WORKTREE = resolve(
  REPOSITORY_ROOT,
  "..",
  `gelis-cp4ai-cp4z-${process.pid}-${Date.now()}`,
);'''
if text.count(prod_worktree) != 1:
    raise SystemExit("production worktree block mismatch")
text = text.replace(prod_worktree, replacement_worktrees, 1)

state_block = '''let productionWorktreeCreated = false;
let completed = false;
let probeCompleted = false;'''
state_new = '''let productionWorktreeCreated = false;
let cp4zWorktreeCreated = false;
let completed = false;
let probeCompleted = false;'''
if text.count(state_block) != 1:
    raise SystemExit("state block mismatch")
text = text.replace(state_block, state_new, 1)

create_block = '''  createWorktree(PRODUCTION_WORKTREE, PRODUCTION_SOURCE);
  productionWorktreeCreated = true;

  printHeader();'''
create_new = '''  createWorktree(PRODUCTION_WORKTREE, PRODUCTION_SOURCE);
  productionWorktreeCreated = true;
  createWorktree(CP4_Z_WORKTREE, CP4_Z_SOURCE);
  cp4zWorktreeCreated = true;

  printHeader();'''
if text.count(create_block) != 1:
    raise SystemExit("worktree creation block mismatch")
text = text.replace(create_block, create_new, 1)

header_source = '''  console.log(`Production src: ${PRODUCTION_SOURCE}`);
  console.log(`Candidate src:  ${CANDIDATE_SOURCE}`);'''
header_source_new = '''  console.log(`Production src: ${PRODUCTION_SOURCE}`);
  console.log(`CP4-Z source:   ${CP4_Z_SOURCE}`);
  console.log(`Candidate src:  ${CANDIDATE_SOURCE}`);'''
if text.count(header_source) != 1:
    raise SystemExit("header source block mismatch")
text = text.replace(header_source, header_source_new, 1)

samples_line = '`Samples:        ${SAMPLES} mirrored fresh-worker pairs/cell pair`'
if samples_line not in text:
    raise SystemExit("samples header mismatch")
text = text.replace(
    samples_line,
    '`Triplets:       ${SAMPLES} balanced fresh-worker triplets/cell`',
    1,
)

summary_title = '  console.log("Production vs candidate cells");'
if text.count(summary_title) != 1:
    raise SystemExit("summary title mismatch")
text = text.replace(
    summary_title,
    '  console.log("Production / CP4-Z / candidate cells");',
    1,
)

ratio_block = '''  console.log();
  console.log("Candidate / production ratios");
  console.log("| comparison | ratio | candidate delta |");
  console.log("| --- | ---: | ---: |");
  for (const pair of PAIRS) {
    const production = getSummary(summaries, pair.cell, "production");
    const candidate = getSummary(summaries, pair.cell, "candidate");
    console.log(
      `| ${pair.label} | ${(candidate.median / production.median).toFixed(4)}x | ${formatDelta(candidate.median - production.median, candidate.unit)} |`,
    );
  }
'''
ratio_new = '''  console.log();
  console.log("Direct same-run attribution ratios");
  console.log(
    "| comparison | Z / production | candidate / production | candidate / Z |",
  );
  console.log("| --- | ---: | ---: | ---: |");
  for (const pair of PAIRS) {
    const production = getSummary(summaries, pair.cell, "production");
    const cp4z = getSummary(summaries, pair.cell, "cp4z");
    const candidate = getSummary(summaries, pair.cell, "candidate");
    console.log(
      `| ${pair.label} | ${(cp4z.median / production.median).toFixed(4)}x | ${(candidate.median / production.median).toFixed(4)}x | ${(candidate.median / cp4z.median).toFixed(4)}x |`,
    );
  }
'''
if text.count(ratio_block) != 1:
    raise SystemExit("ratio reporting block mismatch")
text = text.replace(ratio_block, ratio_new, 1)

run_worker_start = text.index('function runWorker(\n')
preflight_start = text.index('\nfunction preflight(): void {', run_worker_start)
run_worker_old = text[run_worker_start:preflight_start]
run_worker_new = '''function runWorker(
  cell: Cell,
  variant: Variant,
  workerProbeOnly: boolean,
): WorkerResult {
  const sourceRoot =
    variant === "production"
      ? PRODUCTION_WORKTREE
      : variant === "cp4z"
        ? CP4_Z_WORKTREE
        : REPOSITORY_ROOT;
  const workerVariant = variant === "production" ? "production" : "candidate";
  const result = spawnSync(
    process.execPath,
    [
      WORKER,
      `--cell=${cell}`,
      `--variant=${workerVariant}`,
      `--source-root=${sourceRoot}`,
      `--probe-only=${workerProbeOnly ? "true" : "false"}`,
    ],
    {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      env: process.env,
      maxBuffer: 1024 * 1024,
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `Worker failed for ${variant} ${cell}\\nstdout:\\n${result.stdout}\\nstderr:\\n${result.stderr}`,
    );
  }

  const line = result.stdout.trim().split(/\\r?\\n/).filter(Boolean).at(-1);
  if (line === undefined) {
    throw new Error(`Worker emitted no result for ${variant} ${cell}`);
  }

  const parsed = JSON.parse(line) as Omit<WorkerResult, "variant"> & {
    readonly variant: "production" | "candidate";
  };
  if (parsed.cell !== cell || parsed.variant !== workerVariant) {
    throw new Error(`Worker identity mismatch for ${variant} ${cell}`);
  }

  return {
    ...parsed,
    variant,
  };
}
'''
text = text[:run_worker_start] + run_worker_new + text[preflight_start:]

candidate_ancestor = '''  const sourceAncestor = spawnSync(
    "git",
    [
      "-C",
      REPOSITORY_ROOT,
      "merge-base",
      "--is-ancestor",
      CANDIDATE_SOURCE,
      "HEAD",
    ],
    { encoding: "utf8" },
  );
  if (sourceAncestor.status !== 0) {
    throw new Error(
      `CP4-AI source ${CANDIDATE_SOURCE} is not an ancestor of HEAD`,
    );
  }
}'''
preflight_new = '''  const sourceAncestor = spawnSync(
    "git",
    [
      "-C",
      REPOSITORY_ROOT,
      "merge-base",
      "--is-ancestor",
      CANDIDATE_SOURCE,
      "HEAD",
    ],
    { encoding: "utf8" },
  );
  if (sourceAncestor.status !== 0) {
    throw new Error(
      `CP4-AI source ${CANDIDATE_SOURCE} is not an ancestor of HEAD`,
    );
  }

  const sourceNames = git([
    "diff",
    "--name-only",
    CP4_Z_SOURCE,
    CANDIDATE_SOURCE,
    "--",
    "src",
  ]);
  if (sourceNames !== "src/runtime/router.ts") {
    throw new Error(
      `Unexpected CP4-Z -> CP4-AI src/** delta:\\n${sourceNames}`,
    );
  }
}'''
if text.count(candidate_ancestor) != 1:
    raise SystemExit("candidate ancestry block mismatch")
text = text.replace(candidate_ancestor, preflight_new, 1)

cleanup_start = text.index('function cleanupWorktree(): void {')
git_start = text.index('\nfunction git(args: string[]): string {', cleanup_start)
cleanup_new = '''function cleanupWorktree(): void {
  if (cp4zWorktreeCreated) {
    spawnSync(
      "git",
      [
        "-C",
        REPOSITORY_ROOT,
        "worktree",
        "remove",
        "--force",
        CP4_Z_WORKTREE,
      ],
      { encoding: "utf8" },
    );
  }

  if (productionWorktreeCreated) {
    spawnSync(
      "git",
      [
        "-C",
        REPOSITORY_ROOT,
        "worktree",
        "remove",
        "--force",
        PRODUCTION_WORKTREE,
      ],
      { encoding: "utf8" },
    );
  }
}
'''
text = text[:cleanup_start] + cleanup_new + text[git_start:]

TARGET_HARNESS.parent.mkdir(parents=True, exist_ok=True)
TARGET_HARNESS.write_text(text, encoding="utf-8")
TARGET_WORKER.write_text(worker, encoding="utf-8")
