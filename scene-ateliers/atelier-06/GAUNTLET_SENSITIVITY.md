# Gauntlet sensitivity — tests that must fail when behaviour regresses

The final pass rejects tests that merely assert their own setup or compare labels. Every mutation below changes observable evaluator, source, timing, lifecycle, or truth-boundary output and must be caught by at least one invariant.

## Shared mutations

| Mutation | Required failure |
| --- | --- |
| Replace source filter `none` with tint/brightness/drop-shadow | Source-clean invariant fails |
| Give directed mode automatic duration/output with a different label | Mode-distinction invariant fails |
| Accept `NaN` or infinity | Finite-input validation fails |
| Change reverse velocity without inverting path | Reversal invariant fails |
| Change reduced-motion state at seam | Stable reduced-motion invariant fails |
| Recreate source/stage nodes each frame | Browser node-identity/remount check fails |
| Retain a phase for absent caption/guides/stage | Dynamic-duration/dead-phase check fails |
| Offset the final return pose by one pixel | Exact return/seam check fails |

## Light Table

Mutations additionally cover dense 24-item overlap, failed-item collapse, and loupe path corruption. Tests inspect actual rectangles, stable IDs, and seam poses.

## Before / After

Mutations cover one-source duplication, role swap under reverse, positive return velocity, hard 100%→0% reset, and source grading. Tests inspect reveal fraction, velocity, role IDs, and full seam state.

## Slide Anatomy

Mutations cover an inferred semantic source layer, ghost caption plane, plane-order crossing, altered closing path, and source treatment. Tests count source planes and compare opening/closing poses.

## The Build

Mutations cover approval stamp/palette/cursor/wireframe fabrication, semantic-layer inference, readable-floor bypass, absent-stage padding, fake directed timing, and source treatment. Tests inspect stage IDs, duration floor, actual compiled duration, and final source output.

## Prohibited assertion shapes

The packet verifier rejects literal always-pass patterns such as `assert.ok(true)`, `assert.equal(true, true)`, and unreachable `if (false)` branches. A passing test must depend on evaluator or browser-study output.

Automated sensitivity proves the checks can detect named regressions. It does not approve visual taste.
