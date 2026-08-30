# G11 evidence receipt — Shelf v2 Product Scene

Date: 30 August 2026

State: **implemented and tested in source; packaged Linux x64 Electron CI pending; image-only PNG package harness authored but not locally run; Shelf video export unsupported; not installed, released, or human-accepted**

## Identity

- Repository: `bomkino/galileo-gallery`
- Branch: `codex/g11-scenes-integration`
- Integration base: `61418d63f57dc3a779bf0071ce965c75f816c123`
- Exact Shelf closure commit: `bf4598da0ce79ad9f0579f94b6ba43475bc5a83e`
- Exact Shelf closure tree: `7ac34074099ea4dd29549a7d127365cd1b248df0`
- The integration branch contains later bounded Light Table engine work. That work is not substituted for the Shelf identity above.
- No Shelf CI run, packaged job, artifact ID, archive digest, or package-binary identity is claimed yet.

The repaired atelier handoff used for provenance was verified as ZIP
`sha256:8ea87dd8eb5ab6784b517b6cb65772fcf83663b98387f67befbcedfebe69f480`.
Rights remain unresolved. Historical material was treated as checksum-pinned principle-level provenance
evidence, not permission to copy code or assets wholesale.

## Delivered source boundary

- Explicit portable `the-shelf` Scene v2 for 1–127 ordered image/video identities.
- Natural-ratio planes with persisted contain/cover, crop, focal, and ordered-media intent.
- Pure automatic, fixed-duration, and directed Timeline evaluation with forward/reverse and finite,
  repeat, and loop semantics.
- One horizontal baseline, identity-stable lean, Spotlight/finale behavior, reduced-motion semantics,
  bounded observed nodes, and source-faithful opacity/filter/blend contracts.
- Five persisted causal controls: card height, breathing room, edition lean, Shelf lift, and direction,
  with grouped undo, Reset, keyboard operation, and document-boundary clearing.
- Bounded two-worker video admission, serialized Project mutation/open, same-ID replacement, failure
  recovery, decoder retirement, source-keyed poster retirement, and stale-frame rejection contracts.
- Frozen-canvas publication only after a current seek and current frame callback agree; prior proved
  pixels remain visible while a newer target is pending. Sparse VFR and short-video fixtures are pinned
  to the packaged Electron `43.1.0` / Chromium `150.0.7871.47` harness.
- Image-only Shelf v2 PNG Frames source support with exact Shelf Timeline clocks. Any Shelf Project
  containing video remains rejected before export work is allocated.

## Verification run at the closure tree

- `npm test` — pass.
- `npm run build` — pass through the full suite.
- Shelf evaluator, poster-cache, video-admission, App, Project schema/open, export-clock, PNG contract,
  HostPort, and renderer-adapter source checks — pass through `npm test`.
- `git diff --check` — pass before commit.
- Production dependency audit (`npm audit --omit=dev`) — zero known vulnerabilities.
- Full development audit — nine high-severity findings remain in build/test tooling.
- Fresh Spec/Standards fixed-point review — pass after correcting the packaged VFR fixture verifier from
  one source to the actual two sources and adding the image-only PNG readback contract.

These are source checks. They do not prove the packaged Chromium renderer, exact VFR presentation,
decoder ownership in Electron, save/relaunch/reopen, generated PNG bytes, package identity, or a target
platform.

## Authored packaged harness, still pending execution

`electron/shelf-renderer-smoke.cjs`, `scripts/run-shelf-renderer.cjs`, and the `renderer-g11` workflow
contain normal and forced-reduced-motion packaged Linux x64 journeys. The harness covers:

- original and same-ID replacement media, corrupt and cancelled open, prior-state preservation, and
  cleanup;
- ten distinct source videos, the two-decoder ceiling, poster/source pixel correlation, sparse VFR,
  a 20 ms single-frame source, stale callback rejection, and zero playback calls in the VFR probe;
- one image-only `64×64`, 30 fps, 1,000 ms transparent PNG export per motion mode, exact 30-frame
  manifests and hashes, native pixel readback, mixed alpha, artwork pixels, and zero RGB beneath alpha 0;
- package/source identity, sandbox helper mode, renderer sandboxing, staging cleanup, decoder teardown,
  screenshots, and exact artifact manifests.

This package harness cannot run in the present root container because a sandboxed Electron display needs
an unprivileged X runner. It will run only after the branch is pushed to the existing GitHub Actions G11
job. Until that succeeds, none of those packaged observations are claimed as evidence.

## Unrun or unclaimed gates

- Packaged Shelf CI and artifact verification.
- Exact Garuda/KDE, Windows, and native Apple-Silicon behavior.
- Shelf video PNG, MP4, ProRes, HEVC Alpha, or other video export.
- Installation, merge, release, signing, notarization, and publication.
- Human interaction, visual, motion, accessibility, audio, and taste acceptance.
- Arbitrary external-media and long-running decoder/heap stress.

