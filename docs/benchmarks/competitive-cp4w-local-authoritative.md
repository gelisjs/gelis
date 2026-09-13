# Competitive Performance v0.1 — CP4-W local authoritative result

## Classification

**VALID / AUTHORITATIVE / FAIL / REJECTED AS SUFFICIENT COMPOSITION / ACCEPTED AS BALANCED ACCEPTANCE EVIDENCE.**

The first valid completed local timed run is authoritative as-is. Do not rerun CP4-W merely because the result is unfavorable or close to a frozen boundary.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- Harness SHA: `16bc33d1a101557721cfb976600ac92415535b5a`
- CP4-I control: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- CP4-U attribution anchor: `d00e9aa92bf36f59a4182d4602ca46392f5b3686`
- CP4-W candidate: `3e123c45969412b731c249cb65505747c1b207bd`
- Routes: `5,000`
- Samples: `12` balanced fresh-worker triplets per cell
- Balance: all six source permutations repeated twice
- Local correctness probe: `CP4-W CORRECTNESS PROBE: PASS (30/30)`
- Completion marker: `CP4-W LOCAL BALANCED ACCEPTANCE RUN: COMPLETE`

## Authoritative CP4-W / CP4-I ratios

- static-only raw: `1.0293x`, limit `<= 1.0200x` — **FAIL**
- mixed-static raw: `0.9964x`, limit `<= 0.9963x` — **FAIL**
- mixed dynamic raw: `0.9910x`, limit `<= 1.0200x` — PASS
- mixed dynamic JSON: `1.0089x`, limit `<= 1.0200x` — PASS
- mixed same-length dynamic raw: `0.9882x`, limit `<= 1.0200x` — PASS
- pure trailing dynamic raw: `0.9908x`, limit `<= 1.0200x` — PASS
- pure trailing dynamic JSON: `1.0138x`, limit `<= 1.0200x` — PASS
- generic dynamic raw: `0.9891x`, limit `<= 1.0200x` — PASS
- forced collision raw: `0.9693x`, limit `<= 1.0200x` — PASS
- ALL dynamic raw: `1.0064x`, limit `<= 1.0200x` — PASS

Gate marker: `CP4-W GUARDLESS ALL URL SPECIALIZATION BALANCED ACCEPTANCE GATE: FAIL`

## Same-run CP4-U attribution anchor

CP4-U was included only as a same-run attribution anchor and was not eligible for retroactive acceptance. Its direct ratios versus CP4-I were:

- static-only raw: `0.9968x`
- mixed-static raw: `0.9892x`
- mixed dynamic raw: `0.9802x`
- mixed dynamic JSON: `1.0067x`
- mixed same-length dynamic raw: `0.9745x`
- pure trailing dynamic raw: `1.0041x`
- pure trailing dynamic JSON: `1.0088x`
- generic dynamic raw: `1.0210x`
- forced collision raw: `0.9878x`
- ALL dynamic raw: `1.0110x`

Under the frozen CP4-W thresholds, the CP4-U anchor would pass nine of ten cells and miss only generic dynamic raw by `0.0010x`. This is attribution evidence only and does not override CP4-U's earlier authoritative FAIL.

## Interpretation

CP4-W differs from CP4-U by one production source line in `src/runtime/router-all.ts`: the redundant `method === ALL_ROUTE_METHOD` guard was removed from the specialized ALL URL wrapper. Workloads such as static-only, mixed-static, and generic do not register `app.all()` and therefore do not semantically execute that changed wrapper.

The balanced run still moved those non-ALL cells materially, including static-only `CP4-W/CP4-I = 1.0293x` and generic `0.9891x`. This confirms that at the current margin, code-shape/JIT/run effects can cross the 2% guard even when the changed branch is unreachable from the workload. The result remains a valid FAIL because gates were frozen before timing; it is not grounds for a rerun or threshold relaxation.

The next optimization should therefore not continue cosmetic changes in `router-all.ts`. The strongest mechanistic target is the CP4-U generic URL path, where `matchRequestUrl()` already resolves the method table but then calls `this.match(method, pathname)`, causing a second method-map lookup and capability dispatch. A new candidate should remove that redundant generic-path work while retaining CP4-U's ALL specialization semantics.
