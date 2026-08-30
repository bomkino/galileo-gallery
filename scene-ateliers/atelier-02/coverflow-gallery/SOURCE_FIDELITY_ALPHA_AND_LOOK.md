# Source fidelity, alpha, and Look boundary — Coverflow Gallery

## Binding clean default

- Frame fit: contain.
- Artwork opacity: exactly 1.
- Artwork filter: exactly `none`.
- Blend: exactly `normal`.
- No tint, light, sweep, texture, grain, border, RGB split, blur, vignette, reflection, shadow, padding, radius, chromatic edge, floor, or wash touches artwork.
- Geometry may occlude another frame; no artwork pixel treatment communicates hierarchy.

## Canvas versus frame intent

Canvas ratio changes stage composition only. Per-frame fit/crop/focal intent remains a separate Product field. The Scene evaluates a stable frame box from media ratio metadata; asynchronous decode must not move the stage.

## Alpha

Transparent Scene output emits no background geometry. Fully transparent pixels must remain `(R,G,B,A)=(0,0,0,0)`. Partial source alpha is preserved. Look may later render behind/around artwork but cannot contaminate transparent source/output pixels.

Evidence:

- `evidence/alpha-transparent.png` — actual transparent raster.
- `evidence/alpha-black.png`, `alpha-white.png`, `alpha-red.png`, `alpha-blue.png`, `alpha-checker.png` — same Scene sample composited only for inspection.
- `evidence/alpha-scan.json` — measured alpha-zero RGB, partial, opaque, and contamination counts.

## Source fixture policy

Prototype uses generated local geometric artwork only. Source-art colours and alpha live inside the generated artwork group. Scene renderer adds no filter or overlay. Failed media uses an explicit generated placeholder while retaining identity/order/ratio.

## Video

Each generated video fixture has a non-zero source offset. Evaluated media time equals source offset plus Product story time through travel, hold, occlusion, finale, reverse, and exit. Scene never restarts media on selection or reorder.

## Look boundary

A neutral reviewer matte/checker in evidence is outside Scene output and is labelled as such. Grid, paper, theme, material, vignette, light, shadow, grain, and animated world treatment remain future Look work. This packet does not prebuild G10D.

## Verification limits

Generated fixtures prove the evaluator/render policy and alpha mechanics in this laboratory. They do not prove pixel-for-pixel equivalence for arbitrary user media, codec colour management, Product renderer integration, or human visual acceptance.
