# Source fidelity, alpha, and Look boundary — Dealer's Pick

## Clean source contract

During every approach readability zone and declared crown hold, source artwork renders with:

- `opacity: 1`;
- `filter: none`;
- `mix-blend-mode: normal`;
- no Scene tint, brightness, contrast, saturation, blur, glow, grain, vignette, light sweep, or shader;
- no hidden duplicate used to fake the crown.

Container opacity may fade only in the offstage guard zone and entry/exit. It is exactly one at the crown.

## Geometry versus Look

Dealer's Pick owns pivot, radial path, stage-plane card rotation, presentation lift, scale, occlusion, depth order, and bounded windowing. G10D Look owns background material, authored world marks, stable luminance, and decorrelated grain behind/around cards. Look may not infer crown state and wash artwork with a light treatment.

The prototype's paper edge and generated colours are evidence fixtures, not proposed shipping Look.

## Fit, ratio, crop, and focal ownership

- Project/Frame owns `contain` versus `cover`, source ratio override, padding, crop, and focal intent.
- Scene receives resolved outer card dimensions and source box.
- Scene may reduce effective card width to avoid collisions; it may not alter the source ratio or crop to manufacture uniform cards.
- Bottom-centre alignment belongs to Scene geometry. Internal image alignment belongs to Frame.
- Ratio metadata may resolve late only at a stable checkpoint; identity/order cannot change.

## Video

Video uses the same source box and card path as images. Product story time supplies decoded frame time. The crown does not restart, pause, or accelerate video. Preview may lower offscreen decode demand, but output sampling remains deterministic.

## Failed media

A failed source retains ID, ratio fallback, source index, path, crown eligibility, and accessibility name. A neutral generated placeholder occupies the exact card; neighbours do not close the gap or renumber.

## Alpha-safe staging

Transparent mode emits no Scene background and no mandatory shadow, line, glow, or matte. The isolated evidence pipeline verifies:

1. transparent source PNG;
2. composites over black, white, red, blue, and checkerboard;
3. zero non-zero RGB values wherever alpha equals zero after deterministic sanitization;
4. identical card geometry across all composites.

Partial alpha may exist only at antialiased card/art edges. Source artwork alpha is preserved; the Scene does not premultiply colour into transparent pixels.

## Audio boundary

The Scene has no audio parameter. Product audio lanes, trims, loops, gain, mute/solo, ducking, and master remain authoritative. A crown hold may coexist with continuing audio; the Scene must not infer a pause.

## Unproved until integration

- decoded RGB equivalence against external user media;
- Product renderer colour-management parity;
- encoded alpha codec behavior;
- HDR/wide-gamut behavior;
- final G10D Look interaction;
- human source-respect verdict.
