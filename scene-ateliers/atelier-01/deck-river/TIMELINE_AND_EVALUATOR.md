# Timeline and evaluator — Deck River / Continuous

## Pure boundary

```text
compile({mediaCount, paceMs, direction, durationMs}) -> timeline
evaluate({items, parameters, timeline, timeMs, stageWidth, stageHeight,
          reducedMotion}) -> state
```

The evaluator is independent of wall clock, renderer timing, random state, storage, decode state, and GPU state. Global `storyTimeMs` never modulo-wraps; only the closed visual phase does.

## One continuous camera-world

The corridor is a periodic cubic-Hermite centreline through authored approach, behind-camera bypass, recede, and far-return control points. A fixed 768-sample lookup table numerically reparameterizes that curve by arc length. Source `i` occupies:

```text
pathDistanceᵢ = positiveModulo(i / mediaCount - phase, 1)
```

Equal path-distance increments therefore represent equal world travel distance. This is no longer a future promise: the isolated prototype implements and tests it.

The far return meets the approach at the same world position and first-order motion. The previous hidden 2.2-world-unit depth jumps at both return joins were removed.

## Projection

- Camera and horizon stay fixed.
- World depth determines projected dimensions and screen acceleration.
- World lateral position uses the same perspective factor.
- Frames remain camera-facing: `yaw = 0`, roll = 0.
- The evaluator returns projected width/height plus diagnostic `perspective`; renderer scale remains `1`, preventing accidental double perspective.
- Visibility is only near-plane, visible-depth and canvas clipping. No brightness, opacity, haze, or blur simulates depth.

## Timeline mapping

- **Automatic:** one complete circulation at `clamp(mediaCount × 1050 ms, 4200 ms, 30000 ms)`.
- **Fixed duration:** integer circulation count reaches exact requested duration.
- **Directed:** Product compiles cycle/hold segments into cumulative path distance; the Scene evaluates that distance. The isolated prototype does not duplicate Product’s segment compiler.
- **Reverse:** traverses the same closed world in the opposite direction.

A hold freezes the complete world. Any later finale may park a source at the near-pass landmark, but must never straighten/grow into Chapter Reveal.

## Mechanical proof

The Node check probes 400 path samples, epsilon seam continuity, equal arc spacing, camera-centre clearance, no stalls/outliers at authored joins, fixed camera, yaw zero, all five controls, source treatment, reverse, reduced motion, and 0–256 sources. Randomized and browser UI gauntlets run separately.

Product renderer/export parity, decoded user-media equality, and human comfort remain pending.
