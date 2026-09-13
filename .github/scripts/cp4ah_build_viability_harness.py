from pathlib import Path

source = Path("bench/runtime/cp4ag-z-kind-blockwise-stability.mts")
target = Path("bench/runtime/cp4ah-kind-primary-z-viability.mts")
text = source.read_text(encoding="utf-8")

replacements = [
    (
        'const KIND_ONLY_SOURCE = "408f9856f814184ca0204aa49d3812af8660f077";',
        'const CANDIDATE_SOURCE = "0ec95837e912921624fa1b1d9d4f18c28dfe82cc";',
    ),
    (
        'cp4ag-z-kind-blockwise-stability-worker.mts',
        'cp4ah-kind-primary-z-viability-worker.mts',
    ),
    ('gelis-cp4ag-cp4z-', 'gelis-cp4ah-cp4z-'),
    ('gelis-cp4ag-kind-only-', 'gelis-cp4ah-candidate-'),
    ('KIND_ONLY_WORKTREE', 'CANDIDATE_WORKTREE'),
    ('KIND_ONLY_SOURCE', 'CANDIDATE_SOURCE'),
    ('kindOnlyWorktreeCreated', 'candidateWorktreeCreated'),
    ('kindOnly', 'candidate'),
    ('kindValues', 'candidateValues'),
    ('kindMedian', 'candidateMedian'),
    ('"kind-only"', '"candidate"'),
    ('KIND-only src:', 'Candidate src:'),
    ('KIND-only', 'candidate'),
    ('KIND / Z', 'candidate / Z'),
    ('KIND-faster', 'candidate-faster'),
    ('Z/KIND blockwise stability', 'Z/candidate KIND-primary viability'),
    ('3 Z→KIND + 3 KIND→Z pairs per block', '3 Z→candidate + 3 candidate→Z pairs per block'),
    ('CP4-AG', 'CP4-AH'),
    ('LOCAL Z-KIND BLOCKWISE STABILITY RUN', 'LOCAL KIND-PRIMARY Z VIABILITY RUN'),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"missing replacement token: {old}")
    text = text.replace(old, new)

old_final = '''  console.log();
  console.log(
    "CP4-AH STABILITY ONLY: no acceptance gates; prior CP4-Z/CP4-AE classifications remain unchanged.",
  );
}'''
new_final = '''  console.log();
  console.log("Frozen CP4-AH KIND-primary Z viability gates");
  console.log("| gate | candidate / Z | limit | result |");
  console.log("| --- | ---: | ---: | --- |");

  const limits = new Map<Cell, number>([
    ["static-only-raw", 0.995],
    ["mixed-static-raw", 1.01],
    ["mixed-dynamic-raw", 1.02],
    ["trailing-dynamic-raw", 1.02],
    ["generic-dynamic-raw", 1.02],
    ["all-dynamic-raw", 1.02],
    ["static-registration", 1.02],
  ]);

  let passed = true;
  for (const spec of CELLS) {
    const cp4z = getSummary(summaries, spec.cell, "cp4z").median;
    const candidate = getSummary(summaries, spec.cell, "candidate").median;
    const ratio = candidate / cp4z;
    const limit = limits.get(spec.cell)!;
    const result = ratio <= limit ? "PASS" : "FAIL";
    if (result === "FAIL") passed = false;
    console.log(
      `| ${spec.label} | ${ratio.toFixed(4)}x | <= ${limit.toFixed(4)}x | ${result} |`,
    );
  }

  console.log();
  console.log(
    `CP4-AH KIND-PRIMARY Z VIABILITY GATE: ${passed ? "PASS" : "FAIL"}`,
  );
  console.log(
    "CP4-AH is viability-only; no production promotion is inferred from this phase.",
  );
}'''

if text.count(old_final) != 1:
    raise SystemExit(f"expected one CP4-AH final stability block, found {text.count(old_final)}")
text = text.replace(old_final, new_final, 1)

target.write_text(text, encoding="utf-8")
