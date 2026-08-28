# Zoetrope — Timeline and evaluator

## Inputs

`timeMs`, ordered media identities, radius, advance duration, gate hold, perspective, direction, Timeline mode, canvas dimensions, reduced-motion flag.

## Compilation

One step duration is `advanceMs + gateHoldMs`. One full cycle is `mediaCount × stepDuration`. Automatic mode uses one full cycle. Fixed mode scales advance and hold proportionally to the requested duration while preserving a minimum 160 ms advance and 250 ms hold. Directed casino rhythm compiles complete revolutions only when Product intent requests it.

## Pure evaluation

1. Clamp and canonicalise all parameters.
2. Convert story time to a segment-local time using positive modulo only for looping modes.
3. Determine stable source index and signed shortest angular offset.
4. During advance, apply one monotonic cubic ease to angular position. During hold, velocity is exactly zero.
5. Compute every frame transform from stable media index, never DOM order or wall time.
6. Return geometry, z-order, visibility, source-fit intent, and untouched source treatment.

At an exact finite endpoint, evaluation returns the endpoint—not modulo zero—unless the caller explicitly requests loop sampling. Preview, scrub, and fixed-step export must use this same function.

## Spotlight

Spotlight compiles `accelerate → selected gate settle → hold → inverse release`. Selection changes only at a phase boundary. The selected frame is always the actual front passage, never the rear object sharing a similar angle.

## Reduced motion

Rotation is replaced by discrete stable gate states. A change happens only at the boundary between holds. The evaluator never interpolates a partial cylinder turn under reduced motion.

## Continuity tests

Sample `boundary−ε`, `boundary`, `boundary+ε` for every advance/hold transition; full revolution seam; reverse; one item; two items; 64 items; all supported canvas ratios. Any large position discontinuity must occur only for an object already outside the visible and accessible window.
