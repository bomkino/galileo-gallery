# Lively Prints isolated prototype

Status: atelier-local, removable, non-runtime.

## Run

Open `index.html` in a modern browser for real-time play, pause, scrub, automatic/fixed/directed mode, canvas ratio, reduced motion, generated source-count fixtures, reset, keyboard focus, and debug geometry. No network media or third-party code is used.

## Deterministic checks

```sh
node prototype/verify.mjs
node prototype/capture.mjs
```

Both preview and capture call `evaluateScene()` from `evaluator.mjs`. Capture uses fixed story-time samples; the browser transport supplies story time but does not enter the evaluator.

## Keyboard

- Space: play/pause.
- Arrow keys: change the explicit selected/focus index used by reduced-motion and keyboard evidence.
- Home/End: inspect the exact seam endpoints.

## Removal

Delete this Scene directory. Nothing under Product source, registry, package manifests, workflows, or shared contracts refers to it.
