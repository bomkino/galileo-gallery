# Resource and lifecycle notes — Zoetrope prototype

- Pure evaluator state: one record per ordered source; tested through 127.
- Browser render nodes: maximum 19 landscape / 15 portrait; verified by test vectors.
- Constant geometry: optional opaque-stage gate marker only; absent in transparent mode.
- Generated fixture images are data URLs; no network requests.
- Prototype transport uses one cancellable requestAnimationFrame loop. Reset and pause cancel the outstanding handle. Evaluator phase is never accumulated inside card nodes.
- Browser capture remounts from explicit state for every case; same-input/same-time JSON equality passed.
- No WebGL context, canvas texture, worker, audio node, observer, or persistent storage is allocated.
- Video timing is evaluated numerically in the edge fixture; this prototype does not claim production decoder lifecycle or decoded RGB parity.
- Failed media remains in order and geometry.
- Capture limitation: browser navigation is administratively blocked, so `capture.py` inlines local sources into a Playwright page. No network or Product source is introduced.
