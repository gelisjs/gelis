# Competitive Performance v0.1 — CP4-AB local authoritative result

Classification: **VALID / AUTHORITATIVE / FAIL / REJECTED AS PRODUCTION CANDIDATE / ACCEPTED AS DIRECT PRODUCTION EVIDENCE**.

## Identity

- Harness SHA: `49608a099989b9d3499d636ab11807328c917e4d`
- Production source: `af4e5102046def1b163435333563b8d08f919bf5`
- Candidate source: `2114489c11d555edfc13db2a6336435fd4879931`
- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Routes: 5,000
- Samples: 12 mirrored fresh-worker pairs/cell pair

## Authoritative ratios

| Gate                          | Candidate / production |      Limit | Result |
| ----------------------------- | ---------------------: | ---------: | ------ |
| static-only raw               |                1.0111x | <= 1.0200x | PASS   |
| mixed static raw              |                1.0211x | <= 1.0200x | FAIL   |
| mixed dynamic raw guard       |                0.9169x | <= 1.0200x | PASS   |
| mixed dynamic JSON guard      |                0.9254x | <= 1.0200x | PASS   |
| mixed dynamic geomean         |                0.9211x | <= 0.9800x | PASS   |
| mixed same-length dynamic raw |                0.9997x | <= 1.0200x | PASS   |
| pure trailing dynamic raw     |                0.9096x | <= 0.9400x | PASS   |
| pure trailing dynamic JSON    |                0.9150x | <= 0.9500x | PASS   |
| generic dynamic raw           |                1.0124x | <= 1.0300x | PASS   |
| forced collision raw          |                0.9431x | <= 1.1500x | PASS   |
| ALL dynamic raw               |                0.9131x | <= 1.0500x | PASS   |
| static registration           |                1.0744x | <= 1.0500x | FAIL   |
| static retained heap          |                0.9982x | <= 1.0500x | PASS   |

The first valid completed local timed run is authoritative as-is. CP4-AB must not be rerun because the result is unfavorable or close to a threshold.

The two blockers are mixed-static raw and static registration. Since CP4-AB removes registration metadata work relative to CP4-Z yet the registration median regressed in this direct run, follow-up should use balanced same-run attribution before another production-source change.
