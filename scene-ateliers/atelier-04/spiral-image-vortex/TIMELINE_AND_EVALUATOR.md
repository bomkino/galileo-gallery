# Spiral Image Vortex — timeline and evaluator

## Inputs

`timeMs`, ordered media identities, radius, pitch, visible turns, plane scale, direction, Timeline mode, canvas dimensions, fit, background, and reduced-motion flag.

## Pure phase

For looping modes, `phase = positiveModulo(sign × timeMs / durationMs, 1)`. Each item receives a stable longitudinal coordinate `u = positiveModulo(index / count − phase + 0.5, 1) − 0.5`. Helix angle, vertical position, depth, plane rotation, z-order, and wrap opacity derive from `u` only.

A frame may cross the modulo seam only inside the declared offstage band. The opacity/window function reaches zero before the geometric jump. Tests treat any jump with either neighbouring sample above the visibility threshold as failure.

## Timeline modes

- Automatic: one complete helix phase.
- Fixed duration: same path and object order; rate changes to hit the exact duration.
- Directed: explicit cycle/hold segments. Casino rhythm compiles only when Product intent requests it.
- Reverse: exact inverse phase and same offstage seam.

## Spotlight

Determine front-passage candidates from signed camera-space depth and projected readability, not raw angle alone. Compile finite seek, settle, hold, and inverse release. The phase at every boundary is continuous; no modulo snap is allowed at a finite endpoint.

## Reduced motion

Quantise phase into a bounded sequence of stable tableaux. Holds are exact; no in-between frame drift. Source order and the helix’s front/back meaning remain visible.

## Renderer parity

DOM and WebGL consume the same pure semantic frame state. WebGL may pack matrices and atlas coordinates but may not own time, camera intent, ordering, or source treatment. A renderer comparison is invalid if either path silently changes quality or semantics.

## Required continuity samples

Dense 5 ms full-cycle sampling; every wrap at `±ε`; Spotlight boundaries; reverse seam; one/two/24/96 items; 16:9, 9:16, 1:1, 4:5; reduced-motion step boundaries; context loss; remount; deterministic repetition; input immutability.
