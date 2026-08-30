# Isolated prototype

Dependency-free generated-fixture study for the candidate `filmstrip-river` charter. It is not imported by Galileo Gallery and contains no Product implementation.

- `evaluator.js`: pure closed-loop evaluator; browser and CommonJS compatible.
- `app.js`: scrub/play harness and generated canvas fixtures.
- `check.cjs`: deterministic seam, two-lane, counter-flow, count, orientation, hold, and reduced-motion checks.

Run: `node check.cjs`. Open `index.html` in a browser where local files are permitted. The evidence runner in this packet inlines these same bytes because its managed Chromium policy blocks `file://` and local listening sockets.
