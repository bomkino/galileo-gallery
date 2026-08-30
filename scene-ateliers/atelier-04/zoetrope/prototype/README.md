# Zoetrope prototype

Self-contained deterministic laboratory. No Product imports, network media, dependency-manifest edits, historical code reuse, or wall-clock evaluator state.

Run mechanical checks:

```sh
node verify.mjs
```

Open `index.html` in a module-capable local static server for interactive scrub/play. The Play button uses requestAnimationFrame only as a transport that advances explicit story time; `evaluateZoetrope` remains a pure function.

Regenerate captures in the supplied runner:

```sh
python capture.py
```

The capture script inlines the module sources into an isolated Playwright page because this runner blocks browser navigation. It samples the same evaluator, then writes evidence and hashes outside `prototype/`.
