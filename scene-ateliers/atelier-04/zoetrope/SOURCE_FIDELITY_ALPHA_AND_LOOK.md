# Zoetrope — source fidelity, alpha, and Look

## Clean source contract

Imported artwork renders at opacity 1 with normal blend and no filter, shader tint, lighting multiplication, blur, vignette, grain, border, reflection, or material overlay. `contain` is default. `cover` is explicit per-frame intent. Cylinder depth changes geometry only.

## Alpha

Transparent Project output keeps the canvas clear and the apparatus world absent. Every fully transparent output pixel must have RGB zero. Soft source edges preserve premultiplied-alpha correctness when composited over black, white, red, blue, and checkerboard backgrounds.

## Look boundary

A future Look may render a deterministic background behind the cylinder. It may not alter source pixels. Decorative grain is separate, decorrelated, deterministic, and excluded when alpha is zero. Luminance remains stable through motion.

## Failure behaviour

Missing or failed media retain their ID, order, gate slot, and readable placeholder. Failure never causes neighbouring media to reindex or the cylinder to close the gap invisibly.

## Evidence required before promotion

- decoded source RGB comparison using real user media;
- transparent and opaque captures at canonical phases;
- alpha composites over four solid colours and checkerboard;
- source video at multiple story-time samples;
- human confirmation that depth does not read as artwork dimming.
