# Scene DNA — Coverflow Gallery

## Irreducible signature

Discrete front stops + restrained side depth + measured focus traversal.

## Invariants

1. Normalized stage with fixed camera, horizon, and front stop at centre. Rail moves; camera never orbits.
2. Front item is exactly yaw 0, scale 1, z=100. Side works retain opacity 1/filter none and differ only by geometry.
3. Nearer side frames cover farther frames by explicit integer z; no equal-plane overlap.
4. Every artwork sample remains opacity 1, filter none, normal blend.
5. Stable media identity survives every phase, reverse, failure placeholder, and reorder/focus change.
6. Source-video time follows shared story time without Scene remapping.
7. Terminal and loop samples are explicit.
8. Geometry is deterministic from immutable input; no wall clock, DOM query, React lifecycle, random render value, or GPU state.

## Forbidden substitutions

- Never become continuous carousel travel, a hero object, stack reorder, reflective jukebox, title-overlay gallery, or glossy nostalgia effect.
- No opacity, blur, brightness, saturation, tint, reflection, shadow, light, grain, paper, border, title overlay, or colour grading as hierarchy.
- No free-running interval or CSS transition as authored Timeline.
- No pointer-only truth.
- No generic family renderer with per-Scene constants.

## Spatial grammar

- Coordinate: Normalized stage with fixed camera, horizon, and front stop at centre. Rail moves; camera never orbits.
- Topology: One front plane, symmetric side rail, bounded visible range, monotonic depth falloff. Circular wrap changes representatives only while items are offstage.
- Negative space: Front frame retains 10% stage edge clearance. Side previews never overlap more than 32% of projected width.
- Edge policy: offstage means outside the safe-area plus the item’s projected bound; hidden state is causal, never an opacity trick.

## Temporal grammar

Departure → approach → exact front settle → dwell. Circular boundary uses virtual indices; no visible teleport.

At transition end, virtual focus is exactly an integer and the dwell event owns the sample. Representative wrap changes only when abs(offset) > visibleRange + 1.

## Identity under deletion

Nearest Scene(s): Quiet Carousel and Hero Deck Object.

Deleting Coverflow removes user-legible discrete browsing stops. Quiet Carousel still flows continuously; Hero still transfers authority inside one object.

## Silhouette and content-removal proof

`evidence/silhouette.png` removes colour, artwork content, texture, labels, and UI. `evidence/motion-contact-sheet.png` preserves only projected geometry across time. Human review must reject the candidate if its signature no longer reads there.

## Name and slot test

Catalogue slot is justified only if reviewers can identify the motion sentence from silhouette and real-speed evidence without labels. Otherwise consolidate; catalogue count has no value by itself.
