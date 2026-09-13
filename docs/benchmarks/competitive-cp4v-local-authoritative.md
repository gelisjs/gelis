# Competitive Performance v0.1 — CP4-V local authoritative balanced composition attribution

## Classification

**VALID / AUTHORITATIVE / ATTRIBUTION COMPLETE.**

CP4-V is attribution-only. It does not override the prior acceptance status of CP4-Q, CP4-T, or CP4-U, all of which remain failed viability candidates on their original authoritative runs.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- Harness SHA: `a2f456591de802e181aba84b09d69e5f6b5177ca`
- CP4-I: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- CP4-Q: `b268a99f58e6c055ed0255c30ea16783f85fb5f3`
- CP4-T: `bc519e56c599d7b325f0db13d1c6d318801b6024`
- CP4-U: `d00e9aa92bf36f59a4182d4602ca46392f5b3686`
- Routes: `5,000`
- Samples: `12` balanced fresh-worker quartets per cell
- Local correctness probe: `CP4-V CORRECTNESS PROBE: PASS (28/28)`
- Completion marker: `CP4-V LOCAL BALANCED COMPOSITION ATTRIBUTION RUN: COMPLETE`

## Direct ratios vs CP4-I

| Cell | CP4-Q | CP4-T | CP4-U |
| --- | ---: | ---: | ---: |
| static-only raw | 0.9831x | 0.9632x | 0.9919x |
| mixed static raw | 1.0232x | 1.0271x | 0.9919x |
| mixed dynamic raw | 0.9828x | 0.9996x | 1.0097x |
| pure trailing dynamic JSON | 1.0256x | 1.0292x | 1.0172x |
| generic dynamic raw | 1.0294x | 1.0067x | 1.0070x |
| forced collision raw | 1.0067x | 1.0080x | 1.0140x |
| ALL dynamic raw | 0.9878x | 0.9682x | 0.9913x |

## Mechanism pairwise ratios

| Cell | T / Q | U / Q | U / T |
| --- | ---: | ---: | ---: |
| static-only raw | 0.9798x | 1.0089x | 1.0297x |
| mixed static raw | 1.0037x | 0.9694x | 0.9658x |
| mixed dynamic raw | 1.0171x | 1.0274x | 1.0101x |
| pure trailing dynamic JSON | 1.0035x | 0.9918x | 0.9883x |
| generic dynamic raw | 0.9779x | 0.9783x | 1.0004x |
| forced collision raw | 1.0013x | 1.0073x | 1.0060x |
| ALL dynamic raw | 0.9801x | 1.0035x | 1.0239x |

## Frozen-threshold projection

- CP4-Q: `4/7` projected passing cells — projected fail.
- CP4-T: `5/7` projected passing cells — projected fail.
- CP4-U: `7/7` projected passing cells — projected all pass.

This projection is attribution evidence only and does not retroactively change original candidate classifications.

## Interpretation

The balanced same-run evidence identifies CP4-U as the strongest basis for the next genuinely new candidate. It is the only source that projects below every frozen threshold in this attribution run, including mixed-static `0.9919x`, trailing JSON `1.0172x`, generic raw `1.0070x`, collision raw `1.0140x`, and ALL raw `0.9913x`.

The result also demonstrates substantial run/code-layout sensitivity in cells that did not semantically execute the corresponding source delta during prior pairwise viability runs. Future acceptance should therefore use a balanced multi-source protocol frozen before timing instead of returning to a simple mirrored pair design.

CP4-U itself remains failed on its original authoritative viability run and must not be rerun or promoted directly. A new candidate must contain a real production-source change and be evaluated under a newly frozen balanced acceptance protocol.
