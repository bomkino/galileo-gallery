# Quiet Drift evidence

Generated only from local synthetic fixtures.

Commands:

```sh
node prototype/verify.mjs
node prototype/capture.mjs
```

Contents:

- `stills/`: 12+ canonical times and phase boundaries at 1920 × 1080;
- `ratios/`: all four canonical Project compositions;
- `fixtures/`: 1, 2, recommended, bounded-many, and mixed/failed cases;
- `motion/`: 48 fixed-step frames at 24 fps, 480 × 270;
- `silhouette/`: one still plus 24 silhouette-only playback frames;
- `alpha/`: black, white, red, blue, and checkerboard composites;
- `debug/geometry.png`: baseline centres and current vectors;
- `diagnostics.json`: seam, alpha, source treatment, resources, and limitations;
- `CAPTURE_RECEIPT.json` and `SHA256SUMS`: exact capture seam and hashes.

The frame sequence is fixed-step real-speed evidence, not a recorded browser video. No human or Product acceptance is inferred.
