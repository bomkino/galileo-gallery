# Edge, resource, and accessibility policy — Spiral Image Vortex

## Count policy

| Count | Behaviour | Evaluated state | Render budget |
| ---: | --- | ---: | ---: |
| 0 | Product empty state | 0 | 0 |
| 1 | settled near station | 1 | 1 |
| 2 | two safe interior stations, reversible handoff | 2 | 2 |
| 8 | recommended visible thread | 8 | ≤8 |
| 21 | dense mixed-ratio thread | 21 | ≤21 landscape / ≤17 portrait |
| 127 | full ordered identity state + geometric virtualization | 127 | ≤23 landscape / ≤17 portrait |

No source is duplicated for seam or density. `renderSlots` is a view over stable identities.

## DOM/GPU/media budget

- DOM/CSS 3D candidate; no WebGL engine, particle buffer, texture atlas, or context lifecycle.
- Source nodes: maximum 23 landscape, 17 portrait.
- Constant geometry: stage; optional development guide absent in transparent output.
- Image decoding: visible and guard-band sources only.
- Video: one near/active and one approaching warm decoder; other sources pause/release surfaces under Product policy.
- No per-frame allocation proportional to history, no random generator, no canvas trail, no blur filter.

## Failed/delayed media

A failed source remains on the helix at its stable `u`; it uses a clear placeholder with faithful opacity/filter/blend. Its failure does not close the gap, reorder later items, or change seam timing.

Delayed decode swaps pixels into the existing plane after readiness. Geometry continues deterministically.

## Lifecycle and fallback

- Mount/remount evaluate from config, media order, story time, canvas.
- Resize recomputes radius/pitch; no stale coordinates survive.
- Pause stops transport; no hidden velocity exists.
- Export freezes one snapshot before fixed-step evaluation.
- DOM path has no GPU context to lose.
- Honest fallback is a static depth-thread with previous/next near-station inspection. Do not substitute a flat spiral, generic orbit, or Quiet Carousel.

## Offscreen, remount, and disposal

- Offscreen endpoint-tunnel slots are not focusable and do not keep warm decoders.
- Remount at identical config/media/story time reconstructs the same `u`, crossing order, culling, and source-video seek.
- Disposal cancels transport, disconnects observers/listeners, pauses/releases media guards, and drops ephemeral render slots; no path history survives.

## Reduced motion

- Set current serialized source at canonical near station.
- Retain enough settled cards to show one helix silhouette.
- No pulsing, fade loop, or random drift.
- Keyboard/manual authoring inspection may step source order.
- System preference does not change exported Project truth without an authored variant.

## Keyboard/focus

- Previous/next (or up/down) selects source-order near station for inspection.
- Home/end moves first/final source.
- Focus order follows source order, not depth sort.
- Offstage/virtual cards are not tab stops.
- Announce media name/caption, `n of N`, and whether source failed.
- Enter delegates to Product inspection; no hidden Spotlight identity is created.

## Unsupported

- flat 2D spiral mode;
- free camera orbit;
- particle swarm or random card motion;
- opacity seam/fade windows;
- central singularity;
- glow/streak/fog required by Scene;
- simultaneous 127-video decoding;
- WebGL-only output.
