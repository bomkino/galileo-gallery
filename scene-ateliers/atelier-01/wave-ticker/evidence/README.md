# Browser evidence — Ribbon — Wave

Authority: isolated, generated-fixture prototype only. Human verdict: **pending**.

## Motion

- `motion-real-speed.webm` — full phrase recorded from the live canvas with `captureStream(30)` and `MediaRecorder`.
- Codec/frame: `vp9`, `960×540`.
- Decoded frames: `248`.
- Final packet end: `8.264 s`.
- Measured average: `30.01 fps` against a nominal 30 fps canvas stream.
- File size: `2191117` bytes.
- `clip-contact-sheet.png` — 12 evenly spaced full-phrase inspection frames.
- `motion-sequence-30fps/` — 48 deterministic fixed-step parity frames, separate from the wall-clock recording.

WebM/MediaRecorder can publish unreliable `r_frame_rate` metadata for variable-duration packets. `clip-metrics.json` therefore records decoded frame count and derives measured average FPS from the final packet end time.

## Stills and interaction

- `review-workbench-wide.png`, `review-workbench-narrow.png` — reviewer UI at two layouts.
- `review-workbench-control-variant.png` — first Scene control moved from default.
- `canonical-poses.png`, `canonical-poses-vertical.png` — generated fixture pose sheets.
- `horizontal/`, `vertical/`, `silhouettes/`, `controls/` — exact source captures.
- `empty-state.png`, `source-video.png`, `failed-media.png`, `mixed-alpha.png` — explicit edge subjects, each asserted visible before capture.
- `EVALUATOR_CHECK.txt` — direct Scene property-test receipt.
- `long-run-metrics.json` — bounded full-phrase browser observation; not a production soak.
- `browser-runtime.json` — exact local browser/tool boundary.

## Alpha

`alpha-transparent.png` is the actual canvas bitmap from `toDataURL('image/png')`, not a browser screenshot composited over the page.

- fully transparent pixels: `430,138`
- partial-alpha pixels: `2,858`
- opaque pixels: `85,404`
- non-zero RGB under alpha zero: `0`

`composites/` places the same soft-alpha subject over black, white, red, blue and checker fields.

## Integrity and limits

`CAPTURE_MANIFEST.json` hashes every evidence file except itself and this explanatory README. No network code or user media participates. These artifacts prove isolated mechanics, browser interaction and generated-fixture alpha. They do **not** prove Product renderer/export parity, arbitrary user-media RGB equality, packaged lifecycle, target-OS behavior, human taste or formal acceptance.
