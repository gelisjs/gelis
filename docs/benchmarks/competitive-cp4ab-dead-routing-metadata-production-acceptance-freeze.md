# CP4-AB dead routing metadata — direct production acceptance freeze

- Production source: `af4e5102046def1b163435333563b8d08f919bf5`
- Candidate source: `2114489c11d555edfc13db2a6336435fd4879931`
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
