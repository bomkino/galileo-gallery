# S0 charter candidate — Deck River: Chapter Reveal

Status: candidate. Verdict: pending. Production implementation: no.

## Motion and anti-motion sentence

**Motion:** A finite depth-corridor journey inherits its forward momentum, selects one source, straightens and grows it into an authored chapter arrival, holds, then completes a composed takeover without teleporting.

**Anti-motion:** Never a website loader, visit-once splash, session gate, query-controlled intro, body portal, progress indicator, arbitrary stop, or visual skip that silently mutes audio.

## Emotional and material metaphor

A chapter threshold: the deck approaches through a projection corridor, one frame becomes the next room, and the transition resolves rather than loops. It should feel editorial and inevitable, not promotional loading theatre.

## Coordinate, depth, topology, and source roles

- Finite open path. No loop seam and no recycling.
- Fixed camera and horizon. Frames enter from distant alternating corridor lanes and accelerate toward an off-centre camera pass.
- Product selects the target. At acquire, current x, y, width and height plus all four derivatives become the start conditions for derivative-matched arrival curves.
- Arrival straightens and grows the target at the canvas centre. Supporting frames continue corridor motion until geometric clearance. Hold freezes target geometry while source-video story time continues.
- Exit is a source-faithful forward takeover: target expands through the camera/canvas, not an opacity fade or teleport.
- Source owns ratio, fit, alpha, media pixels, and video duration. Scene owns only geometry.

## Phrase and landmarks

1. **Distant entry** `0–0.16`.
2. **Accelerating corridor** `0.16–0.62`.
3. **Target acquire** `0.62–0.74`.
4. **Straighten / grow / arrival** `0.74–0.86` with inherited derivative.
5. **Arrival hold** `0.86–0.95`.
6. **Composed takeover** `0.95–1.00`.

All boundaries are continuous. The finite end is intentionally not equal to the start.

## Automatic, fixed, and directed mapping

- **Automatic:** deterministic last unmuted source; duration scales within bounded limits from media count.
- **Fixed duration:** exact requested duration when it meets the six-stage minimum; shorter requests are rejected rather than silently compressed.
- **Directed:** Product supplies target source and explicit durations for all six stages. Each stage has a minimum span; invalid phrases are rejected.
- Reverse mirrors corridor side and takeover drift while preserving phrase order.
- Product-directed casino rhythm may shape the corridor segment only. Arrival landmarks cannot be erased by a generic cycle compiler.

## Portable visual skip role

Proposed Product intent: `visualNavigation.landmark = "chapter-reveal:target-acquire"`. A skip action seeks visual story time to the compiled acquire landmark. It does not mute, remove, restart, or rewrite source-video, presenter, soundtrack, or master audio. Audio policy remains explicit and separate.

## Defaults and essential Scene-only controls

- Corridor frame scale `0.24` short axis.
- Depth spacing `1.00` world scale.
- Lane spread `3.00` world units.
- Near passage `1.90` world units.
- Arrival scale `0.66` short axis.

Timeline owns duration, target, direction, hold, and skip. Look owns room and handoff treatment.

## Media counts, ratios, and canvases

- 0: empty finite phrase; Product should disable selection.
- 1: one source travels, arrives, holds, and takes over.
- 2: one supporting source plus target.
- 3–256: stable source order; non-targets pass the camera and clear physically.
- Mixed ratios keep source geometry. Arrival scale is cross-axis based; no source crop is invented.
- Landscape and portrait use the same fixed-camera world with recomposed horizon/lateral projection, not a rotated DOM.
- Failed target remains selectable only if Product policy permits; default automatic chooses last unmuted identity and preserves failed placeholders otherwise.

## Video, alpha, Look, and audio

Exact source-video story time continues through corridor, arrival, hold, and takeover. Visual reverse never reverses playback. Soft-alpha target cannot fake an opaque chapter wipe: Look remains visible through holes, and Product must author any next-Scene handoff separately. Scene never tints, dims, blurs, lights, or changes audio.

## Reduced motion and accessibility

Reduced motion presents the selected source directly at the static arrival pose. No corridor travel, grow, or takeover. Skip and replay controls require explicit labels and focus. Moving stage media is not focusable; Product source selection remains outside the Scene.

## Lifecycle and resources

One pose per source; no virtual loop instances. Non-visible corridor sources unmount after safe guard conditions. Reuse decodes; pause hidden video; cancel animation frames; disconnect observers/listeners; dispose textures/contexts/object URLs. Context-loss fallback is the static arrival pose.

## Risks

Arrival interpolation can feel like a generic hero zoom if momentum inheritance is weak. Takeover may imply opacity for transparent sources. Fast corridor acceleration can nauseate. Directed durations can compress landmarks below readability. These require hard bounds and human review.

## Later human decisions

Approve or reject: finite six-landmark phrase; automatic target policy; derivative-matched arrival; centre hold; full-frame takeover; explicit visual skip role; portrait composition; reduced-motion direct arrival. Formal charter approval remains pending.
