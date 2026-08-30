# Before / After evidence

Generated from the self-contained prototype. No Product renderer or historical asset was used.

```sh
node prototype/check.cjs
CHROMIUM_BIN=<chromium> python prototype/capture.py --output ../evidence
python prototype/verify_evidence.py ../evidence
```

- `canonical/`: thirteen 1920×1080 stills, including every compiled phase boundary.
- `ratios/`: exact 1920×1080, 1080×1920, 1080×1080, and 1080×1350 compositions.
- `fixtures/`: missing pair, exact pair, preserved extras, failed sides, mixed dimensions/ratios, alpha edges, source video, and keyboard focus.
- `alpha-diagnostics/`: alpha-edged source composites over black, white, red, blue, and checkerboard. These are diagnostic only; transparent output remains unavailable.
- `before-after-real-speed.mp4`: 5.2-second, 15 fps fixed-step real-speed phrase.
- `DIAGNOSTICS.json`: registration, scalar parity, keyboard/ARIA, source hash, seam, boundary, and remount evidence.
- `CAPTURE_MANIFEST.json`: sizes, SHA-256 hashes, and exact relative commands.

The capture proves prototype mechanics, not Product integration, encoded alpha semantics, taste, or human acceptance.

- `SILHOUETTE.png`: silhouette-only distinctness still derived from `canonical/04-t-0_35.png`.
- `STORY_STATE_DIAGRAM.svg`: authored state topology.
