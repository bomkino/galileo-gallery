# Scene DNA — Swipe Stack

## Irreducible signature

Top-card exit + consequential deck advance + visible rear tuck + exact identity continuity.

## Invariants

1. Normalized stage origin at deck centre. Resting deck baseline and centre of mass remain fixed; throw direction is a signed horizontal axis.
2. Active top proof > advancing deck > returning rear proof. Identity, not array position, owns the moving card.
3. The active card may switch from front to rear z only when its projected bounds are at least 92% covered by the pile mask. The evaluator emits occlusion explicitly.
4. Every artwork sample remains opacity 1, filter none, normal blend.
5. Stable media identity survives every phase, reverse, failure placeholder, and reorder/focus change.
6. Source-video time follows shared story time without Scene remapping.
7. Terminal and loop samples are explicit.
8. Geometry is deterministic from immutable input; no wall clock, DOM query, React lifecycle, random render value, or GPU state.

## Forbidden substitutions

- Never disguise an array rotation with a crossfade, CSS transition, offscreen teleport, or generic index swap.
- No opacity, blur, brightness, saturation, tint, reflection, shadow, light, grain, paper, border, title overlay, or colour grading as hierarchy.
- No free-running interval or CSS transition as authored Timeline.
- No pointer-only truth.
- No generic family renderer with per-Scene constants.

## Spatial grammar

- Coordinate: Normalized stage origin at deck centre. Resting deck baseline and centre of mass remain fixed; throw direction is a signed horizontal axis.
- Topology: Front flight plane, occlusion gate, rear return plane, and ordered resting depth slots. Z changes only during verified pile coverage.
- Negative space: At least 30% stage width remains clear on authored throw side; pile itself stays inside a 42% × 62% central envelope.
- Edge policy: offstage means outside the safe-area plus the item’s projected bound; hidden state is causal, never an opacity trick.

## Temporal grammar

Rest → anticipation → release → front flight → occlusion crossing + deck advance → rear tuck → settle.

Permutation changes only at cycle end. The active card’s z-band changes inside occlusion crossing only when the evaluator also emits occluded=true. [start,end) ownership prevents double identities.

## Identity under deletion

Nearest Scene(s): Calm Stack.

Deleting Swipe Stack removes decisive impulse and rear-tuck continuity. Calm Stack remains complete because it has no throw, overshoot, or front-flight plane.

## Silhouette and content-removal proof

`evidence/silhouette.png` removes colour, artwork content, texture, labels, and UI. `evidence/motion-contact-sheet.png` preserves only projected geometry across time. Human review must reject the candidate if its signature no longer reads there.

## Name and slot test

Catalogue slot is justified only if reviewers can identify the motion sentence from silhouette and real-speed evidence without labels. Otherwise consolidate; catalogue count has no value by itself.
