# Canonical final verification

Run:

```sh
node scene-ateliers/atelier-06/verify-release.mjs
```

This is the final acceptance entry point for the isolated Atelier 06 packet. It runs:

1. all four executable Scene verifiers;
2. the cross-Scene gauntlet;
3. packet completeness, JSON, source-neutrality, control-causality, negative-vector, mutation, provenance, lifecycle, and truth-boundary checks;
4. syntax checks against the canonical browser paths in `BROWSER_ENTRYPOINTS.json`;
5. keyboard, 44 px target, live-region, play/reset, cleanup, and external-dependency checks for those canonical browser studies.

The gauntlet deliberately retains its earlier verifier drafts and the original non-canonical Before / After HTML as evidence of defects the final loop caught. They are not execution entry points. `BROWSER_ENTRYPOINTS.json` and `verify-release.mjs` are authoritative.

Automated acceptance covers mechanics only. Every `HUMAN_REVIEW_PACKET.md` remains `verdict: pending`.
