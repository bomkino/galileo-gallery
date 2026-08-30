# Focus Strip evidence

Generated from local synthetic fixtures only.

```sh
node prototype/verify.mjs
node prototype/capture.mjs
```

`stills/` holds canonical times and phase boundaries. `ratios/` holds exact 1920×1080, 1080×1920, 1080×1080, and 1080×1350 compositions. `fixtures/` covers one, two, recommended, bounded-many, and one failed source. `motion/` is a 48-frame fixed-step sequence at 24 fps. `silhouette/` contains a still and 24-frame silhouette playback. `alpha/` contains black, white, red, blue, and checkerboard composites. `debug/` exposes the fixed station and track geometry only.

The browser prototype displays captions and indices. The dependency-free rasteriser does not include a font engine; `TEST_VECTORS.json` records stable source order, label mode, selected index, and failed-slot identity. Diagnostics state this and all other limits. No browser recording, Product export, or human verdict is claimed.
