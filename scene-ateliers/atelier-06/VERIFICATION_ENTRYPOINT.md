# Verification entry point

Canonical command:

```sh
node scene-ateliers/atelier-06/verify-final.mjs
```

`verify-final.mjs` runs all four Scene verifiers plus the cross-Scene gauntlet, then checks packet completeness, JSON validity, source neutrality, causal controls, negative vectors, mutation sensitivity, keyboard/lifecycle/touch-target hooks, provenance hygiene, human-verdict restraint, The Build’s G10C block, and Slide Anatomy’s flat-source boundary.

`verify-packet.mjs` and `verify-packet-v2.mjs` are retained as audit history of the gauntlet itself. The first used an over-literal prose substring check; the second corrected that but treated the standard SVG namespace as an external network dependency. Neither is the acceptance entry point. Their defects are documented rather than hidden because a test suite should remain examinable, including its own mistakes.

The canonical verifier permits the inert XML namespace declaration `http://www.w3.org/2000/svg`; it still rejects executable or loadable external network references.
