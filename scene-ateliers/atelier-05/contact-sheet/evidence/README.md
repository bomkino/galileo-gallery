# Contact Sheet evidence

Generated from local synthetic fixtures only.

```sh
node prototype/verify.mjs
node prototype/capture.mjs
```

`stills/` holds canonical timestamps and every recommended-phrase segment boundary. `ratios/` holds exact 1920×1080, 1080×1920, 1080×1080, and 1080×1350 compositions. `fixtures/` covers one, two, recommended, bounded-many, and failed media. `motion/` is a 48-frame fixed-step sequence at 24 fps. `silhouette/` contains a still and 24-frame silhouette playback. `debug/geometry.png` exposes cell and traversal geometry only.

Transparent output is intentionally unavailable. `alpha/UNAVAILABLE.md` records the exact opaque-material consequence; diagnostics prove the 960×540 raster has 518,400 opaque pixels and no zero/partial alpha. The browser prototype renders labels; the dependency-free raster uses deterministic index marks because it has no font engine. No browser recording, Product export, or human verdict is claimed.
