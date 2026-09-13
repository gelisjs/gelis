from pathlib import Path

src = Path('bench/runtime/cp4j-full-production-acceptance.mts').read_text()
src = src.replace('const CANDIDATE_SOURCE = "c18f231374d0008b7cc3e01bacbf9f81aff9a273";', 'const CANDIDATE_SOURCE = "efaa228231c920fee78053edeb5c8c094f324aca";')
src = src.replace('const SAMPLES = 11;', 'const SAMPLES = 12;')
src = src.replace('cp4j-full-production-worker.mts', 'cp4y-direct-production-revalidation-worker.mts')
src = src.replace('CP4-J', 'CP4-Y')
src = src.replace('cp4j', 'cp4y')
src = src.replace('full production acceptance', 'direct production revalidation')
src = src.replace('FULL PRODUCTION ACCEPTANCE', 'DIRECT PRODUCTION REVALIDATION')
src = src.replace('LOCAL FULL PRODUCTION ACCEPTANCE RUN', 'LOCAL DIRECT PRODUCTION REVALIDATION RUN')
Path('bench/runtime/cp4y-direct-production-revalidation-acceptance.mts').write_text(src)
Path('bench/runtime/cp4y-direct-production-revalidation-worker.mts').write_text('import "./cp4j-full-production-worker.mts";\n')

freeze = '''# Competitive Performance v0.1 — CP4-Y Direct Production Revalidation Freeze\n\n## Identity\n\n- Production source: `af4e5102046def1b163435333563b8d08f919bf5`\n- CP4-X candidate source: `efaa228231c920fee78053edeb5c8c094f324aca`\n- Runtime: Bun `1.4.2`\n- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`\n- Routes: `5,000`\n- Samples: `12 balanced fresh-worker pairs/cell pair`\n- Pair order: 6 production→candidate and 6 candidate→production for every cell\n- CI timing is non-authoritative and must not be run.\n- The first valid completed local timed run is authoritative as-is.\n\n## Cells\n\n1. static-only raw\n2. mixed static raw\n3. mixed dynamic raw\n4. mixed dynamic JSON\n5. mixed same-length dynamic raw\n6. pure trailing dynamic raw\n7. pure trailing dynamic JSON\n8. generic dynamic raw\n9. forced collision raw\n10. ALL dynamic raw\n11. static registration\n12. static retained heap delta\n\n## Frozen production gates\n\nThese are the same thresholds used by CP4-J; none are relaxed for CP4-Y.\n\n- static-only raw: `candidate/production <= 1.0200x`\n- mixed static raw: `<= 1.0200x`\n- mixed dynamic raw guard: `<= 1.0200x`\n- mixed dynamic JSON guard: `<= 1.0200x`\n- mixed dynamic geomean: `<= 0.9800x`\n- mixed same-length dynamic raw: `<= 1.0200x`\n- pure trailing dynamic raw: `<= 0.9400x`\n- pure trailing dynamic JSON: `<= 0.9500x`\n- generic dynamic raw: `<= 1.0300x`\n- forced collision raw: `<= 1.1500x`\n- ALL dynamic raw: `<= 1.0500x`\n- static registration: `<= 1.0500x`\n- static retained heap: `<= 1.0500x`\n\nPASS requires every frozen gate to pass.\n\nA PASS is direct production acceptance evidence for exact CP4-X source `efaa2282...`; a FAIL rejects production promotion while preserving the run as authoritative evidence.\n'''
Path('docs/benchmarks/competitive-cp4y-direct-production-revalidation-freeze.md').write_text(freeze)
