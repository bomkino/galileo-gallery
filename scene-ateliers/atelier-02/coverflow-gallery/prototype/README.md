# Coverflow Gallery atelier prototype

Label: **atelier prototype, not Product Scene**.

Run locally without installing dependencies:

```bash
node check.mjs
node generate-evidence.mjs
```

Serve this directory locally (for example `python -m http.server`) and open `index.html`; some browsers block ES modules under `file://`. The exact-time scrubber, real-time Play control, and evidence generator import the same pure `evaluator.mjs`. Generated artwork is local geometric SVG only. No network code, media, font, analytics, Product import, or historical asset is used.

Controls: Play/Pause, exact-time scrub, fixture/canvas/Timeline/direction, five Scene parameters, Restart, Remount, Dispose, SVG capture. Keyboard outside form controls: Space play/pause, Home restart, Left/Right one fixed 24 fps frame.

The browser animation handle is presentation only. Story truth is the explicit `storyTimeMs` passed into the evaluator.
