# Timeline and evaluator — Light Table

## Pure input

`evaluateLightTable({ items, parameters, timeline, timeMs, stageWidth, stageHeight, reducedMotion })`

The evaluator accepts serialisable values only. It does not read wall-clock time, browser layout after compilation, React state, media playback state, pointer position, or GPU state.

All numbers must be finite. Stage dimensions must be positive. Ratios are bounded to `0.05…20`. Item count is bounded to 256 at validation and 24 visible cells at this prototype layer. Duplicate identities fail.

## Compilation

### Automatic

One pass. Every stable item identity receives one review step. Step duration is `travelMs + holdMs`; total duration is exact.

### Fixed duration

The same semantic pass is retimed to the requested duration. Requested duration must be at least `itemCount × 250 ms` and no more than 24 hours. The last sample before the end approaches the same seam as automatic mode. Duration is not rounded to a convenient cycle.

### Directed

Default phrase:

1. fast scan, one full pass at pace scale 2;
2. fast scan, one full pass at pace scale 2;
3. regular read, one full pass at pace scale 1;
4. fast closing scan, one full pass at pace scale 2.

The compiler stores segment starts, ends, pass starts, and pass ends. Canonical tests prove directed duration and canonical timestamps differ from automatic mode.

## Evaluation

1. Map `timeMs` into the finite phrase with positive modulo only for repeating preview.
2. Resolve the active segment and local progress.
3. Resolve visit position and direction.
4. Use monotonic smootherstep for travel; hold is exact.
5. Derive active identity, stable cell positions, active scale, and z-order.
6. Emit source treatment separately: opacity 1, filter none, normal blend.

Reverse negates visit order without changing geometry. At the seam, every cell returns to exactly its start pose and the same identity owns the active state.

## Reduced motion

Reduced motion bypasses travel. It selects a deterministic representative item at index `floor((count - 1) / 2)` and emits a settled inspection state. Start, boundary, and end samples are identical. User scrub may still choose another stable item without animation.

## Video

A source-video cell receives `sourceVideoTime = loop ? positiveModulo(timeMs, sourceDuration) : min(max(timeMs, 0), sourceDuration)`. Preview, scrub, and fixed-step export call the same function. The prototype pauses native playback and seeks only when the deterministic target differs materially.

## No-caption rule

Caption reveal time exists only when the selected item has a non-empty caption and captions are not off. Empty captions do not reserve a hidden hold or create an apparently frozen phase.

## Resource bound

The evaluator emits at most 24 visible cell records plus one overflow consequence record. No hidden duplicate slot is created. Browser nodes remain keyed by media identity for the full mount.
