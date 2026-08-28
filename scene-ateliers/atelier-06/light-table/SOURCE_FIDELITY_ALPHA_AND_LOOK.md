# Source fidelity, alpha, and Look — Light Table

## Clean invariant

Every imported frame renders with:

- opacity `1`;
- filter `none`;
- blend mode `normal`;
- no Scene-authored tint, exposure change, blur, vignette, grain, texture, sweep, border, shadow, glow, or material overlay;
- contain fit by default;
- explicit user warning when cover is selected because cover may crop.

The active inspection state changes world-space scale and z-order only. It does not brighten, wash, spotlight, or recolour source pixels.

## Table illumination

The light-table world may contain a bounded neutral backing, aperture, grid, or falloff behind and around media. Those layers must be separate siblings beneath the source element. They may not be composited into the source texture or placed above it with non-normal blend.

Stable world luminance is required. A deterministic subtle phase may move through the table backing, but its average luminance must remain within the documented tolerance and it may not encode item identity.

## Alpha

Transparent source pixels remain source-transparent. Where the future shared Look supports transparent output, alpha-zero output pixels must have RGB zero and decorrelated world grain must not leak into those pixels. The candidate prototype records this boundary but does not claim Product export alpha integration.

`background: transparent` means the table backing is absent. It does not flatten transparent media against white, add a checkerboard to export, or change source alpha.

## Failure state

A failed or missing item retains its cell, identity, order, ratio fallback, and caption identity. The placeholder is Scene UI outside source pixels. It must not be mistaken for replacement media or silently removed from visit order.

## Look boundary

Light Table proposes no G10D Look implementation. It requests only these future services:

- solid or transparent world background;
- optional authored table backing behind media;
- deterministic subtle world phase;
- decorrelated world grain behind media;
- stable luminance;
- clean straight-alpha output.

Audio remains Project-owned and unchanged by the Scene.
