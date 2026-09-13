# CP4-AD — dead routing metadata component attribution freeze

CP4-AD is a measurement-only attribution phase. It isolates the two metadata removals that CP4-AB combined. It does not override or reopen any prior production-acceptance classification.

## Frozen identity

- CP4-Z anchor: `1b4057ad9d12bc28d2ab2ca7917924368fe99444`
- MIN-only source: `031c5cea5c855256c35e14f63d524c544293b29f`
- KIND-only source: `408f9856f814184ca0204aa49d3812af8660f077`
- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Routes: 5,000
- Samples: 12 balanced fresh-worker triplets per cell
- Orders: all six source permutations, each repeated twice per cell

## Source isolation

Both component sources are direct children of CP4-Z and differ from CP4-Z only at `src/runtime/router.ts`.

MIN-only removes only the `staticPathLengthMin` metadata family:

- the `MethodRoutes.staticPathLengthMin` field;
- initialization in `createMethodRoutes()`;
- cloning in `cloneMethodRoutes()`;
- registration-time minimum-length update.

It retains `fastMapKind` and `staticPathLengthMax` exactly from CP4-Z.

KIND-only removes only the `fastMapKind` metadata family:

- `FastMapKind` and its constants;
- the `MethodRoutes.fastMapKind` field;
- initialization and cloning;
- static/trailing registration transitions;
- deletion when a table migrates to the generic trie.

It retains `staticPathLengthMin` and `staticPathLengthMax` exactly from CP4-Z.

Neither component changes CP4-Z request-dispatch logic in `matchRequestUrl()`.

## Frozen cells

1. static-only raw
2. mixed-static raw
3. mixed dynamic raw
4. pure trailing dynamic raw
5. generic dynamic raw
6. ALL dynamic raw
7. static registration

## Interpretation contract

CP4-AD answers only whether removing either dead metadata component individually produces a repeatable performance effect relative to CP4-Z under the same balanced run.

The primary comparisons are:

- MIN-only / CP4-Z;
- KIND-only / CP4-Z;
- KIND-only / MIN-only.

A lower ratio is faster for every frozen cell.

CP4-AD is not a production-promotion gate. Even a favorable component result requires a separately frozen direct production acceptance phase before promotion.

The first valid completed local timed CP4-AD run is authoritative attribution evidence as-is. It must not be rerun because the result is favorable, unfavorable, or surprising. CI may run correctness only; CI timing is forbidden.
