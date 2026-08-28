# Atelier 06 review lab

Open `index.html` locally after serving the `scene-ateliers/atelier-06/` directory or through the repository’s normal development tooling.

The lab is a human-review convenience, not a Product screen. It:

- loads only the canonical browser studies;
- switches 16:9, 9:16, 1:1, and 4:5 review frames;
- keeps the four identity/truth boundaries visible;
- exposes three focused review questions per Scene;
- resets an isolated study without mutating Project data;
- preserves every verdict as pending.

It must not become a second Scene registry, control system, or generic renderer. `BROWSER_ENTRYPOINTS.json` remains the machine-readable authority for executable studies.
