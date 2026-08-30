# Scene DNA — Opening Reel

## Irreducible signature

Finite screening + authored beat roles + one still climax + terminal exit.

## Invariants

1. A normalized stage with origin at centre. The proscenium focus line is x=0; stage camera and safe area remain fixed while the reel coordinate advances.
2. Ordinary travel frames < current Spotlight < finale. Hierarchy uses position, scale, z-order, and time only.
3. Travel cards may overlap only at offstage entrances. Spotlight neighbours are displaced, never covered. Finale competitors cross the safe-area edge before becoming non-rendered.
4. Every artwork sample remains opacity 1, filter none, normal blend.
5. Stable media identity survives every phase, reverse, failure placeholder, and reorder/focus change.
6. Source-video time follows shared story time without Scene remapping.
7. Terminal and loop samples are explicit.
8. Geometry is deterministic from immutable input; no wall clock, DOM query, React lifecycle, random render value, or GPU state.

## Forbidden substitutions

- Never become an endless ticker, equal-beat slideshow, collection browser, stack, or Look-driven spectacle.
- No opacity, blur, brightness, saturation, tint, reflection, shadow, light, grain, paper, border, title overlay, or colour grading as hierarchy.
- No free-running interval or CSS transition as authored Timeline.
- No pointer-only truth.
- No generic family renderer with per-Scene constants.

## Spatial grammar

- Coordinate: A normalized stage with origin at centre. The proscenium focus line is x=0; stage camera and safe area remain fixed while the reel coordinate advances.
- Topology: One planar travel lane with deterministic shallow y/rotation lanes. Spotlight temporarily becomes the front plane. Finale becomes the only onstage plane.
- Negative space: Default frame height leaves at least 18% canvas height above and below the lane. Spotlight keeps a minimum 7% stage-width gap after neighbour displacement.
- Edge policy: offstage means outside the safe-area plus the item’s projected bound; hidden state is causal, never an opacity trick.

## Temporal grammar

Travel leg → optional Spotlight grow → readable hold → return → next travel. Ordinary cards cross without stamped pauses.

Events own [start,end). At end, the next event owns the sample. Terminal time equals the explicit terminal frame and is never modulo-wrapped unless loop is authored.

## Identity under deletion

Nearest Scene(s): Filmstrip River and Quiet Carousel.

Deleting Opening Reel removes finite ceremony, role-aware holds, and authored finale; no continuous river or browsing Scene replaces that outcome.

## Silhouette and content-removal proof

`evidence/silhouette.png` removes colour, artwork content, texture, labels, and UI. `evidence/motion-contact-sheet.png` preserves only projected geometry across time. Human review must reject the candidate if its signature no longer reads there.

## Name and slot test

Catalogue slot is justified only if reviewers can identify the motion sentence from silhouette and real-speed evidence without labels. Otherwise consolidate; catalogue count has no value by itself.
