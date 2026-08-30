# Light Table evidence

Generated from the self-contained prototype. No Product renderer or historical asset was used.

## Commands

```sh
node prototype/check.cjs
CHROMIUM_BIN=<chromium> python prototype/capture.py --output ../evidence
python prototype/verify_evidence.py ../evidence
```

## Contents

- `canonical/`: fourteen 1920×1080 stills at canonical timestamps and authored boundaries.
- `ratios/`: exact 1920×1080, 1080×1920, 1080×1080, and 1080×1350 compositions.
- `fixtures/`: one, two, five, six, twenty-four, failed, source-video, colour-chart, and reduced-motion states.
- `light-table-real-speed.mp4`: ten-second 15 fps real-speed evaluator playback.
- `REAL_SPEED_FRAMES.sha256`: hashes of the 150 fixed-step frames used to encode the clip; frames were removed after verification to bound packet size.
- `DIAGNOSTICS.json`: seam, source-contamination, luminance, accessibility, and lifecycle observations.
- `CAPTURE_MANIFEST.json`: file sizes, SHA-256 hashes, and exact relative commands.

## Limitation

The clip is deterministic fixed-step browser capture, not a recording of Product runtime. Automated evidence does not establish visual taste or human acceptance. Light Table is intentionally opaque-only, so alpha composite captures do not apply.

- `SILHOUETTE.png`: silhouette-only distinctness still derived from `fixtures/ordinary-six.png`.
- `STORY_STATE_DIAGRAM.svg`: authored state topology.
