# Before / After prototype

Self-contained clean-room comparison prototype. Open `index.html` directly. No network or Product integration.

```sh
node check.cjs
CHROMIUM_BIN=<chromium> python capture.py --output ../evidence
python verify_evidence.py ../evidence
```

The range input, automatic playback, scrubber, and fixed-step capture all use the scalar split returned by `scene-core.js`.
