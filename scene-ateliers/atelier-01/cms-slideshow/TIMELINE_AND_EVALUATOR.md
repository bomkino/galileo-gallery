# Timeline and evaluator — Quiet Carousel

## Pure boundary

```text
compile({mediaCount, paceMs, direction, durationMs}) -> compiledTimeline
evaluate({items, parameters, compiledTimeline, timeMs, stageWidth, stageHeight,
          axis, reducedMotion, fitIntent}) -> state
```

No wall clock, render timing, media decode state, random seed, DOM geometry, storage, or GPU state enters evaluation. `storyTimeMs` stays global and unwrapped even while the visual cycle uses modulo time.

## Closed metric track

Each source keeps one identity and one variable-width anchor. The evaluator resolves a minimum requested gap, adds evenly distributed sparse-count negative space when the stage needs more track, and closes one loop extent. This is why the reviewer UI says **Minimum gap**, not a promise that sparse two-item layouts can use exactly that gap while preserving one instance per source and an offstage seam.

```text
phase = positiveModulo(direction × cycles × localTime / duration, 1)
positionᵢ = wrap(anchorᵢ - origin - phase × loopExtent, loopExtent)
```

Focus depth is geometric scale falloff around the centre aperture. Source opacity stays `1`; filter stays `none`; blend stays normal. No edge fade touches artwork.

One item uses a 2.5% sinusoidal major-axis breath. Reduced motion disables it.

## Ownership

Scene parameters: `frameScale`, `gap`, `focusDepth`.

- Axis, direction, pace, cycle count, holds, finale and story time belong to Product Timeline.
- Background and world treatment belong to Look.
- `contain`/`cover` is media/frame intent. The evaluator accepts `fitIntent` but it never changes Scene geometry.

This corrects the earlier candidate mistake that treated fit as a fourth Scene control.

## Timeline mapping

- **Automatic:** one complete source-order cycle at bounded Product pace.
- **Fixed duration:** nearest positive integer cycle count reaches the exact requested duration.
- **Directed:** the Scene consumes Product-compiled cumulative phase and hold intent. The isolated prototype does not duplicate the shared segment compiler. Fast ×2 / regular ×1 / fast ×1 remains valid Product data, not Scene personality.
- **Reverse:** negates track velocity. It never reverses source bytes or video playback.

## Holds and source video

A hold freezes phase at a source-order focus landmark. Source-video visual time remains `storyTimeMs`, modulo or clamped only by the media service. A finale may park a frame in the aperture; it does not enlarge, dim, tint, or spotlight it.

## Mechanical proof

`prototype/check.cjs` proves deterministic output, exact visual seam, unwrapped source time, three causal Scene controls, media-owned fit, 0/1/2/many behavior, vertical recomposition, source-treatment invariants, reverse, and reduced motion. `tools/verify-gauntlet.cjs` adds randomized finite/bounded tests; `tools/verify-browser-ui.py` verifies the human-review workbench.

Product preview/scrub/export integration remains unclaimed.
