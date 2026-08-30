# Light Table prototype

Self-contained clean-room prototype. Open `index.html` directly. No network or Product integration.

Checks:

```sh
node check.cjs
CHROMIUM_BIN=<chromium> python capture.py --output ../evidence
python verify_evidence.py ../evidence
```

The browser UI and capture runner call the same pure evaluator in `scene-core.js`. Capture mode uses query parameters such as `?capture=1&fixture=ordinary-six&t=0.5&ratio=16%3A9`.
