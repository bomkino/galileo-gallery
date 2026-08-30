# Slide Anatomy evidence

Generated from the self-contained flat-source prototype. No Product renderer, historical asset, semantic-layer inference, or shared phase engine was used.

```sh
node prototype/check.cjs
CHROMIUM_BIN=<chromium> python prototype/capture.py --output ../evidence
python prototype/verify_evidence.py ../evidence
```

- `canonical/`: twelve straight-alpha 1920×1080 stills at canonical times and every authored boundary.
- `ratios/`: exact 1920×1080, 1080×1920, 1080×1080, and 1080×1350 transparent compositions.
- `fixtures/`: caption/no-caption, extras, blocked explicit-many proposal, transparent, failed, and source-video states.
- `alpha-composites/`: straight-alpha output plus black, white, red, blue, and checker composites.
- `slide-anatomy-real-speed.mp4`: seven-second, 15 fps fixed-step phrase on a bounded display background.
- `DIAGNOSTICS.json`: exact path reversal, source hashes, alpha scan, seam, phase, and remount evidence.
- `CAPTURE_MANIFEST.json`: sizes, SHA-256 hashes, and exact relative commands.

The alpha scan found 519,338 fully transparent pixels, zero contaminated RGB values under zero alpha, and 310,957 partially transparent pixels in the representative capture. Automated evidence does not establish taste or formal charter acceptance.

- `SILHOUETTE.png`: silhouette-only distinctness still derived from `canonical/06-t-0_5.png`.
- `STORY_STATE_DIAGRAM.svg`: authored state topology.
