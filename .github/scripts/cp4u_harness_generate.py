from pathlib import Path

CONTROL = "c18f231374d0008b7cc3e01bacbf9f81aff9a273"
CANDIDATE = "d00e9aa92bf36f59a4182d4602ca46392f5b3686"

acceptance = Path("bench/runtime/cp4t-all-table-miss-fallback-acceptance.mts").read_text()
acceptance = acceptance.replace("cp4t-all-table-miss-fallback-worker.mts", "cp4u-unbound-all-url-specialization-worker.mts")
acceptance = acceptance.replace("gelis-cp4t-control-", "gelis-cp4u-control-")
acceptance = acceptance.replace("bc519e56c599d7b325f0db13d1c6d318801b6024", CANDIDATE)
acceptance = acceptance.replace("CP4-T", "CP4-U")
acceptance = acceptance.replace("ALL table-miss fallback viability", "unbound ALL URL specialization viability")
acceptance = acceptance.replace("ALL TABLE-MISS FALLBACK VIABILITY", "UNBOUND ALL URL SPECIALIZATION VIABILITY")
acceptance = acceptance.replace("CP4-U LOCAL ALL TABLE-MISS FALLBACK RUN: COMPLETE", "CP4-U LOCAL UNBOUND ALL URL SPECIALIZATION RUN: COMPLETE")
Path("bench/runtime/cp4u-unbound-all-url-specialization-acceptance.mts").write_text(acceptance)
Path("bench/runtime/cp4u-unbound-all-url-specialization-worker.mts").write_text('import "./cp4p-mixed-positive-packed-state-worker.mts";\n')

freeze = f'''# Competitive Performance v0.1 — CP4-U unbound ALL URL specialization viability freeze

## Purpose

CP4-T preserved mixed-static recovery and improved ALL routing, but still failed unrelated method-hit guards after changing shared `Router.matchRequestUrl()` code shape. CP4-U therefore restores `router.ts` exactly to CP4-Q and specializes only routers that actually register `app.all()`.

Unlike CP4-S, the URL specialization does not capture a bound copy of `router.matchRequestUrl`. It stores `Router.prototype.matchRequestUrl` once at module scope and invokes it with `.call(router, ...)`, removing the extra bound-function layer while leaving ordinary non-ALL routers untouched.

This is a direct CP4-I control-versus-candidate decomposition. No prior ratio chaining is used for acceptance.

## Frozen identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Control source: `{CONTROL}`
- Candidate source: `{CANDIDATE}`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Timed cells: `10` request-dispatch cells
- Correctness probes: `20/20` required before timing

## Frozen gates

- static-only raw guard: `<= 1.0200x`
- mixed-static recovery: `<= 0.9963x`
- mixed dynamic raw guard: `<= 1.0200x`
- mixed dynamic JSON guard: `<= 1.0200x`
- mixed same-length dynamic raw guard: `<= 1.0200x`
- pure trailing dynamic raw guard: `<= 1.0200x`
- pure trailing dynamic JSON guard: `<= 1.0200x`
- generic dynamic raw guard: `<= 1.0200x`
- forced collision raw guard: `<= 1.0200x`
- ALL dynamic raw guard: `<= 1.0200x`

## Protocol

The first valid completed local timed run on the authoritative machine is evidence as-is. Do not rerun because the result is unfavorable. Do not change source, harness, sample count, or gates after timing begins.

A PASS authorizes direct production revalidation only; it does not itself promote production.
'''
Path("docs/benchmarks/competitive-cp4u-unbound-all-url-specialization-freeze.md").write_text(freeze)
