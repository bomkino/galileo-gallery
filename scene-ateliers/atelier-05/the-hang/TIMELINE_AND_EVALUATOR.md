# Timeline and evaluator — The Hang

## Pure boundary

The same `evaluateScene()` serves real-time preview, scrub, reduced motion, fixed-step capture, and test vectors. Inputs are ordered items, controls, compiled Timeline, story time, canvas, reduced-motion flag, debug flag, and selected index. No prior-frame state exists.

## Anchor compiler

For each source the compiler derives:

```text
pivotX, pivotY, anchorRow, anchorColumn, anchorSpacing,
fullLength, periodScale, phaseDelay, frameWidth, frameHeight
```

Portrait/count-aware layout may create two upper rails. Frame width is capped at 46% of local anchor spacing for counts above two. Height follows source ratio. This preserves horizontal collision margin without privileging landscape art.

## Pendulum equation

After the source-order impulse reaches a frame:

```text
angle = clamp(
  impulse × exp(-dampingRate × localTime)
  × sin(2π × oscillations(length) × localTime),
  -safeAngle,
  +safeAngle
) × phaseEnvelope × focusRestraint
```

`safeAngle` derives from anchor spacing and wire length. Period scale uses the square root of normalized length. This is a deliberate closed-form motion model, not a high-fidelity gravity simulator.

## Phase map

| Range | State |
| --- | --- |
| 0.00–0.14 | length 0→full; angle 0 |
| 0.14–0.24 | shared impulse gain 0→1 with ordered phase delay |
| 0.24–0.78 | explicit damped oscillation and focus restraint |
| 0.78–0.90 | remaining angle multiplied continuously to 0 |
| 0.90–1.00 | length full→0; angle 0 |

Start/end vectors match exactly.

## Focus

During settle, source-order attention can restrain one frame’s angle and shorten its current wire by a bounded amount. Finale uses the last source. Source pixels, frame identity, pivot, base length, and non-focused frames remain unchanged.

## Collision matrix

`verify.mjs` evaluates:

- fixtures: 1, 2, 6, 10;
- canvases: 1920×1080, 1080×1920, 1080×1080, 1080×1350;
- all canonical timestamps and boundaries.

The structural bounding-box collision list must remain empty. The study fixed an early blocker by introducing two upper rails for narrow/many compositions, spacing-derived frame widths, and swing travel clamps. This is an atelier finding, not human acceptance.

## Reverse and directed time

Reverse maps phase through `1 − phase`, yielding exact geometric retrace. Directed mode compiles four complete phrases at fast/regular/fast cadence. Neither mode changes physical parameters.

## Video time and seam

Source video time is a pure positive-modulo/clamped function of story time. Start/end position, angle, and current-length deltas are zero in generated evidence. Debug capture shows pivots and possible arcs only.

## Tests

Checks cover seam, fixed pivots/lengths, collision matrix, one/two/many, causal impulse/damping, reduced-motion invariance, reverse retrace, source-video time, and 2,000-frame bounded state. `TEST_VECTORS.json` stores numeric/structural expected outputs and remains atelier-local.
