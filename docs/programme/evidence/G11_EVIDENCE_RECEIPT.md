# G11 evidence receipt — Vitrine v2 Product Scene

Date: 30 August 2026

State: **engineering-complete in source and a sandboxed packaged-directory Linux x64 Electron save/relaunch/reopen/PNG journey; not installed, released, or human-accepted**

## Identity

- Branch: `codex/g11-vitrine-v2`
- Reviewed local implementation commit: `a789bd8beb684554beeda5c63fed17e52967dbda`
- Exact remote CI implementation commit: `d935bcb8e3359030c01ef886ec65669df0d6e406`
- Exact shared implementation tree: `9c6c0dd8d6ac3e9e3f9ce4cb9ad6aeb4b82e4cee`
- Successful workflow: run `33311514966` (`#108`)
- Packaged Vitrine job: `99257315622`
- This receipt's containing commit is evidence-only and is not substituted for the package identity above.

The repaired atelier handoff used for provenance was independently downloaded and checked as ZIP
`sha256:8ea87dd8eb5ab6784b517b6cb65772fcf83663b98387f67befbcedfebe69f480`.
Rights remain unresolved. Historical material was treated as principle-level provenance evidence, not
as permission to copy code or assets.

## Product boundary delivered

- explicit portable `vitrine` Scene v2 with 1–127 ordered media identities;
- natural-ratio image and paused-video planes with preserved contain/cover/crop/focal intent;
- one pure compiler/evaluator for automatic, exact fixed-duration, directed, finite, repeat, loop,
  forward, reverse, entry, readable holds, exchange, finale, and exit;
- independent temporal direction and left/right spatial exchange direction;
- no more than two presented planes or live decoders, with bounded prewarming and verified video seeks;
- presentation scale, object turn, transition depth, exchange direction, and Placard controls, including
  grouped pointer transactions, keyboard operation, Reset, undo, and document-boundary undo clearing;
- deterministic 75%, 100%, and 200% Interface Scale plus canvas recomposition from 64 to 7,680 pixels,
  including portrait, extreme-wide, and extreme-tall pairs;
- transparent PNG Frames support with clean artwork defaults; H.264/AAC remains truthfully unavailable
  for Vitrine with the consequence `Quiet Carousel only · use PNG Frames`;
- atomic portable save/reopen, fresh media-authority rotation, corrupt-hydration preservation, and
  fail-fast missing-media export preflight.

Artwork planes retain opacity `1`, filter `none`, and normal blend. No light, dimming, tint, filter,
grain, border, or wash is applied over imported artwork. Placard is authored outside artwork and its
shadow is removed for transparent export.

## Causal verification

`npm test` passed on the final implementation tree. It includes the Vitrine compiler/evaluator verifier,
Project/schema/open checks, PNG and H.264 host boundaries, audio, security, and Interface Scale suites.
`git diff --check`, module syntax checks, and the production dependency audit also passed.

Workflow #108 passed:

- Ubuntu, macOS, and Windows source-test matrix jobs;
- the existing G08 renderer regression job;
- the G11 packaged Linux x64 Electron journey.

Generic Linux/macOS/Windows package jobs and `renderer-g02` were skipped by branch conditions; they are
not reported as passed.

The G11 package was Electron `43.1.0`, Chromium `150.0.7871.47`, Node `24.18.0`, with sandboxing,
context isolation, and no renderer Node integration. The package recorded:

- executable: 219,811,064 bytes, `sha256:2634af9941986102ad96e214a1650188099291e050d649d39ceba0905850fdd5`;
- `app.asar`: 9,290,002 bytes, `sha256:7ea9396d9f40d0667fd83e40cf6a173445ca9d666bdd0191c23e7edd43f85985`;
- approved FFmpeg: 79,826,272 bytes, `sha256:e7e7fb30477f717e6f55f9180a70386c62677ef8a4d4d1a5d948f4098aa3eb99`;
- root-owned mode-4755 sandbox helper: 15,232 bytes,
  `sha256:d7d2a29b6bd265950a83d583a3901c5b7d6daba6ab7eca9439076bcf99343cc9`.

## Artifact evidence

Artifact `g11-vitrine-positive-and-failure-evidence`:

- artifact ID `9732139199`;
- 1,286,025-byte archive;
- archive `sha256:20a1a71d77b989c20a91ddadfeb89f5242ed706cb43b3336d4465a5da165a656`;
- exactly 219 verifier-declared files;
- four 48-frame, 2,000 ms, 24 fps, `96×64` RGBA PNG sequences: 192 frames total;
- twelve editor screenshots across save, reopen, hold, exchange, 75%, 100%, 200%, and export success;
- save/reopen receipts, source fixtures, portable Project, corrupt-open receipt, and missing-media receipt.

Normal and forced-reduced-motion exports have byte-identical frame hashes and manifest digests. The
clean sequences contain 163,353 transparent, 22,250 partial-alpha, and 109,309 opaque sampled pixels,
with zero non-zero RGB beneath alpha zero. Every declared red/blue source tuple at alpha 64, 128, 192,
and 255 is observed within RGB tolerance 2. This is source-tuple preservation evidence, not a claim of
pixel-exact RGB reproduction for arbitrary external media. PNG audio is explicitly `none`; Project audio
intent remains unchanged.

The missing promoted-media journey failed before renderer/frame readiness with `verification_failed`,
preserved the prior destination sentinel, published no target, preserved current Project state, and left
no import/private-frame residue. Corrupt browser hydration preserved the accepted Project root, document,
semantic identity, and grants.

Artifact `g11-png-cancellation-regression-evidence`:

- artifact ID `9732139411`;
- 1,448,779-byte archive;
- archive `sha256:9fa8ba1f3c915704c1437806b5e38519bb997d622cd64cefb3e573a3d8e92a67`;
- cancellation after rendering began left the destination absent and transaction/audio residue empty.

The final artifact verifier was rerun locally against the downloaded archive and passed. A contact-sheet
inspection of all twelve screenshots plus sampled save/reopen frames found no obvious clipping, artwork
wash, stale layout, scale jump, or save/reopen divergence. This agent inspection is not human visual or
motion acceptance.

## Fixed-point review

Spec axis: **PASS**. The final package exercises the authored Vitrine identity, ordered media and framing,
five causal controls, Timeline modes, direction policies, reduced-motion preview, deterministic authored
export, Project persistence, clean alpha, failure preservation, and truthful format availability.

Standards axis: **PASS**. The fixed point retains opaque HostPort authority, sandboxed renderer settings,
bounded staging/decoders/frames, cancellation cleanup, 44px targets, keyboard/semantic status evidence,
and path-free receipts. Review also caught and corrected two browser-runtime defects before closure:
computed-perspective serialization was separated from the normative authored value while keeping strict
visible geometry parity, and a universal reduced-motion rule that accidentally created 80 ms transitions
was changed to zero-duration/zero-delay. Exact cross-preference frame hashes then passed.

Production audit: zero known vulnerabilities. Full development audit: nine high-severity findings remain
in build/test dependencies (`brace-expansion`, `concurrently`/`shell-quote`, `fast-uri`, `js-yaml`,
`nanoid`, `postcss`, `tar`, and `undici` paths). They remain a release-frontier task and are not in the
seven-package production dependency graph.

## Unrun or unclaimed gates

- exact Garuda/KDE and Apple-Silicon/native macOS packaged behavior;
- installation, AppImage/DMG/portable-installer testing, merge, tag, release, signing, and notarization;
- human interaction, visual, motion, screen-reader, assistive-technology, and taste acceptance;
- H.264/AAC or native-alpha video export for Vitrine; PNG Frames contain no audio;
- a packaged 127-item corpus, arbitrary external user-media corpus, and long-running heap/decoder stress;
- recorded real-time video.

Quiet Carousel and Vitrine v2 are now the two individually authored, end-to-end engineering-verified
Product Scenes. Registered IDs or atelier packets are not counted as completed Scenes.
