# Timeline and evaluator — Ribbon / Wave

## Pure evaluator

Inputs: ordered media, five bounded Scene parameters, Product-compiled time/direction/hold target, canvas and reduced-motion intent. Outputs: one closed path, phase/velocity, source-preserving render instances, analytic tangent rotation and clean render state.

No wall clock, random seed, per-card phase, DOM timing, storage, decode state or GPU feedback enters evaluation.

## C1 closed path

The minimum metric extent covers mixed-ratio frames, minimum gaps and offstage guard bands. The evaluator rounds that extent up to an integer number of requested wavelengths:

```text
extent = waveCount × wavelength
wave(position) = amplitude × sin(2π × position / wavelength + π/2)
```

Position and first derivative therefore match at the seam. Tangent angle is analytic and multiplied by bounded **Tangent follow**, then clamped to ±10° for typography protection. Cards travel; the path never runs on a second clock.

Sparse counts use bounded repeated render instances of the same media identities. They do not become independently bobbing cards.

## Timeline mapping

Automatic and fixed-duration compilation are exercised locally. Directed cycle/hold segments remain Product Timeline input; the Scene consumes compiled phase and preserves one stationary path. A hold centres the selected source at the crest and sets geometry velocity to zero while source-video story time continues.

## Mechanical proof

The Node check numerically compares x, y and rotation across the epsilon seam; confirms integer wavelength closure; proves all five controls causal; enforces the ±10° cap; checks crest hold, reverse, 0–256 sources, bounded virtual instances, portrait recomposition, source treatment and reduced motion. Randomized and browser UI gauntlets run separately.

Product renderer/export parity and human motion/readability acceptance remain pending.
