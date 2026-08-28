# The Orrery — source fidelity, alpha, and Look

## Clean source contract

Artwork is never made “planetary” by default. Imported RGB and alpha remain untouched: opacity 1, normal blend, and filter none. No tint, simulated light, glow, bloom, blur, grain, vignette, border, reflection, desaturation, atmosphere, starfield wash, or depth fade touches artwork. Hierarchy comes from geometry, scale, occlusion, and authored negative space.

## Alpha

Transparent output clears to RGBA zero. Fully transparent pixels contain zero RGB. The WebGL comparison samples source RGB directly and applies only a bounded visibility term to alpha when a body is genuinely outside the rendered world. Soft edges are composited over black, white, red, blue, and checkerboard.

## Look boundary

A future Look may place deterministic orbital guides or a world field behind artwork. It cannot multiply source colour or alpha. Decorative grain remains a separate decorrelated pass and is absent beneath alpha zero. Luminance stays stable through ring travel and centre exchange.

## Media policy

`contain` is default. Explicit `cover` remains per-frame intent and does not change Project canvas ratio. Failed media retain stable IDs, ring membership, centre eligibility, and order. Source-video samples Product story time; the Scene does not own audio, decode, playback, or mute truth.

## Promotion evidence

Real user media must prove decoded RGB/alpha parity, exchange continuity, failed-media identity, transparent composites, and source-video timing. Generated atlas evidence proves mechanics only.
