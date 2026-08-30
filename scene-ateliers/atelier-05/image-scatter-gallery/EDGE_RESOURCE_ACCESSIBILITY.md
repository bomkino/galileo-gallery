# Edge cases, resources, and accessibility — Lively Prints

## Count table

| Count | Policy |
| ---: | --- |
| 0 | Reject/show capability copy. |
| 1 | One centred poster arrival and return. |
| 2 | Opposed field positions and distinct routes. |
| 3–6 | Sparse route field with preserved exclusion. |
| 7–12 | Primary simultaneous field. |
| 13–24 | Contiguous source-order cohorts, maximum 12 visible. |
| >24 | Reject; never truncate, repeat, or random-sample. |

## Cohort continuity

At cohort boundaries, the outgoing cohort has completed its owned return and is offstage before the next cohort begins. Identity records remain ordered. Product S1 must avoid decoding/mounting every cohort simultaneously and must release outgoing media resources safely.

## Ratios and failed media

Portrait, landscape, square, cinematic, and vertical ratios preserve individual readability. Card height derives from canvas; width is ratio-aware and bounded. Extreme wide sources must not erase the exclusion zone or cover unrelated cards.

Failed items retain route ID, cohort, slot, z role, and focus traversal position. Their placeholder cannot be removed from order.

## Reduced motion

Reduced motion shows a static complete field for the selected cohort. It removes arrival, circulation, lift animation, and exit. Arrow selection can move a static registration mark and switch cohorts deliberately. The Scene does not become a generic grid.

## Keyboard semantics

DOM focus and announcements follow full source order, including inactive cohorts and failed slots. Arrow keys advance one source; moving across source 12/13 changes the visible cohort without an animated flourish under reduced motion. Animation never moves DOM focus.

## Resource bounds

- accepted identities: ≤24;
- visible/renderable cards: ≤12;
- cloned loop copies: 0;
- random pack attempts: 0;
- timers/listeners inside evaluator: 0;
- retained prior frames: 0;
- generated fixture network requests: 0.

A 2,000-frame observation confirms stable counts. No heap profile, GPU/context-loss run, long decoded-video stress test, or Product remount evidence is claimed.

## Fallback

A Canvas2D/CSS renderer can preserve routes, zones, focus plane, and exclusion. WebGL is not identity-critical. On context loss, fall back to the static field or deterministic CSS paths, not a random re-pack.
