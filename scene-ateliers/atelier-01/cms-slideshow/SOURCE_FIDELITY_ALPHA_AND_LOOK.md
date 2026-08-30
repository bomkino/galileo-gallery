# Source fidelity, alpha, and Look — Quiet Carousel

## Clean default

- Artwork opacity: `1`.
- Artwork filter: `none`.
- Blend mode: normal.
- Frame fit: `contain`.
- No border, paper, tint, grain, texture, shadow, glow, vignette, mask, overlay, or caption.
- Geometric scaling is permitted. Pixel treatment is not.

## `contain` and `cover`

`contain` protects the complete imported frame and remains default. `cover` is explicit authorial
crop intent. Changing canvas ratio never silently changes `contain` to `cover`.

## Alpha

- Source alpha is preserved through transform and compositing.
- Fully transparent source pixels must retain zero RGB contamination in encoded alpha-capable
  output.
- Scene contributes no opaque backing plane.
- A transparent Project Look stays transparent outside and through source alpha.
- Soft-alpha video edges follow the same geometric transform without prerendered matte.

## Look boundary

Look may render authored fields behind or around the track. It may not change artwork RGB, alpha,
opacity, luminance, or sharpness. World grain is decorrelated and excluded from fully transparent
pixels. This packet does not implement G10D Look.

## Legacy background policy

`quiet-carousel@1` currently stores solid/transparent background with Scene parameters. Preserve
that representation and rendering for all existing v1 Projects.

Candidate v2 policy:

1. New authoring stores background under Project Look.
2. `cms-slideshow` resolves to the canonical Quiet Carousel authoring identity, not another renderer.
3. A Project upgrade is explicit and versioned.
4. Upgrade maps legacy background only when no conflicting authored Look exists.
5. Ambiguous Projects remain v1 and render unchanged.

## Failed media

A failure placeholder is Product-authored, source-name-readable, ratio-stable, and visually neutral.
It occupies the same ordered track slot. It is not skipped, duplicated, or substituted with another
source.

## Evidence boundary

The isolated prototype uses generated fixtures. It can prove geometry, source opacity policy,
transparent canvas behaviour, and composite consistency. It cannot prove decoded RGB equivalence
for external user media or production encoder alpha.
