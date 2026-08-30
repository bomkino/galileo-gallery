# Source fidelity, alpha, and Look boundary — Wide Ellipse

## Clean source invariant

For every evaluated source card:

```text
artwork opacity = 1
artwork filter = none
artwork blend = normal
```

The Scene may change only its container transform, container opacity, depth order, clipping required by the resolved frame, and visibility/mount state. At front hold, container opacity is exactly `1`; readable shoulders remain at or above the declared container floor. No source color is used to infer geometry.

## Readable zones

- **Front gate:** exact analytical depth maximum; container alpha `1`; full source fidelity.
- **Approach/departure shoulders:** camera-facing, bounded scale, container alpha at least `0.72` in canonical configuration.
- **Rear:** source pixels remain unmodified; only container alpha and geometric scale recede.

No brightness, saturation, contrast, tint, blur, blend, light sweep, vignette, grain, glow, shadow, or “cinematic grade” may touch artwork by default.

## Frame ownership

Product/Frame owns:

- contain vs cover;
- source ratio and custom ratio;
- crop and focal intent;
- frame padding, corner treatment, caption, and failure placeholder contract;
- source decode and video frame selection.

Wide Ellipse owns centre path, rotated-plane depth, perspective, z-order, mount window, and container alpha. A card's path centre never changes because contain/cover changes.

## Mixed ratios

Base width is common. Height follows resolved ratio. Perspective applies uniformly, then a ratio-aware stage cap limits projected width/height. The cap never changes angular position, depth, source order, alpha law, or readable hold duration. Tall frames remain tall; wide frames remain wide.

## Look boundary

G10D Look may render world/background treatment behind or around cards. It cannot alter the Scene's front gate, axes, yaw/pitch, depth, alpha, source pixels, z-order, Timeline phase, or path. Scene supplies no mandatory orbit line, floor, glow, stars, shadow, paper, or light apparatus.

## Transparent composite contract

- Scene background: transparent when requested.
- No implicit matte or checkerboard in output.
- Fully transparent output pixels: `R=0, G=0, B=0, A=0`.
- Grain/decor stays absent from alpha-zero pixels.
- Partial alpha comes only from card-container edge/opacity composition.
- Evidence composites must include black, white, red, blue, and checkerboard.

## Video

Product samples the video frame from story time before Scene composition. Ellipse position cannot seek, accelerate, pause, loop, or change source-video opacity/filter/blend. At readable holds, the currently sampled video frame receives the same source-fidelity invariant.

## Failed media

A failed source keeps stable ID, order, ratio fallback, angle, depth, front turn, and focus semantics. Renderer substitutes the Product failure surface inside the same frame bounds. It never collapses the slot or allows a later source to steal its z-order tie-break.

## Audio

No Scene audio state exists. Source-video, presenter, soundtrack, ducking, gain, mute/solo, and master remain Product services.

## Evidence claim boundary

The isolated packet proves generated fixture geometry, alpha compositing, deterministic story-time sampling, and declared source-treatment state. It does not prove decoded RGB equivalence for external user media, Product renderer/export integration, codec behavior, or human source-respect acceptance.
