# Implementation status

Updated: 29 August 2026

Repository start: `bomkino/galileo-gallery@2762043bb733aa28a6c63fe26564504b9f257564`

Task branch: `codex/g06b-verified-h264-aac`

## G01A — safe archive import boundary

State: **tested in source; not packaged, installed, released, or human-accepted**

Protected now:

- `.galileo` import copies the selected source into unpredictable app-owned staging before parsing;
- lazy streaming ZIP reads replace `adm-zip` extraction for untrusted imports;
- explicit archive, entry-count, individual-expanded, total-expanded, per-entry-ratio, aggregate-ratio, manifest, path, and free-space-reserve limits;
- rejection of absolute, drive, UNC, traversal, NUL, backslash, empty/dot segment, non-NFC, reserved-device, alternate-stream, trailing-dot/space, duplicate-normalized, parent/file-conflict, encrypted, unsupported-compression, symlink, and special-file entries;
- canonical containment checked after host path resolution;
- staging removed after success, failure, or cancellation; abandoned app-owned import staging has a bounded cleanup path;
- typed path-free UI failures; experimental Gallery/Opening Reel v1, wrong-product, and future-version archives are rejected without mutating current state or source bytes;
- visible `Cancel open` action aborts an active import.

Dependency receipt:

- `adm-zip` moved from vulnerable `0.5.16` to patched `0.6.0` and remains only on the trusted project-save writer path;
- untrusted import uses `yauzl@3.4.0` with lazy entries, streamed extraction, and entry-size validation;
- production dependency audit reports zero known vulnerabilities at this source state.

The full development-tool dependency audit still reports nine high-severity advisories in pre-existing build/test transitive dependencies. They are outside the packaged production dependency graph and remain unremediated in G01A; they must be triaged before a release frontier.

## G01B — clean Project schema

State: **owned domain boundary source-, Electron-main-process-, and packaged-renderer-tested through G03; human acceptance remains unclaimed**

Protected now:

- clean `galileo-gallery-project` schema v2 with explicit product/engine identity;
- deterministic canonical serialization and exact unknown-field policy;
- ordered media identities, safe archive paths, byte sizes, SHA-256 hashes, detected signatures, and per-frame intent;
- distinct canvas, Scene v1, Look v1, visual Timeline, audio-intent v1, and export-default records;
- exact missing/unexpected entry policy and complete hash/signature validation through G01A staging;
- app-owned media promotion only after full validation, followed by the existing one-result current-Project replacement seam;
- atomic destination replacement only after a complete validated save archive exists;
- safe experimental-v1, wrong-product, future, malformed, cancelled, and corrupt-media failure without prior-state or source-byte mutation.

Source checks cover save/open/reopen canonical equality, ordered hashes, privacy exclusions, semantic failure matrix, cancellation before staging and during media promotion, staging cleanup, and prior destination/Project preservation. After explicit user approval, the package-lock-pinned Electron `43.1.0` development binary was installed and its real main-process save/open/reopen smoke passed with two ordered media files.

Xvfb and Xauth were later installed after direct continuation approval. This managed local runner still denies display socket creation, but the display-capable GitHub runner now proves the packaged G03 renderer save, quit, relaunch, open, hydration, and Project-state round trip.

G02 extends visual Timeline intent inside the still-unreleased v2 schema with an explicit fixed duration and bounded directed cycle/hold segments. Automatic/fixed/directed mode and segment identity now survive browser and portable Project round trips.

## G02 — Quiet Carousel browser tracer

State: **engineering-complete in source and real Electron renderer CI; human visual/motion acceptance remains unclaimed**

Implemented on reversible route `?tracer=quiet-carousel`:

- independent `quiet-carousel` v1 Scene module with canonical defaults, bounded control descriptors, pure compiler, and pure evaluator;
- immediate ordered eight-frame generated fixture in stable Frames / Stage / Inspector / visual Timeline geography;
- honest 16:9, 9:16, 1:1, and 4:5 canvas recomposition plus horizontal/vertical and forward/reverse policies;
- causal frame size, 1080-design-pixel gap, pace, depth, contain/cover, clean colour/transparent, and Reset controls;
- finite automatic, exact fixed-duration, and explicit fast x2 / regular x1 / fast x1 directed Timeline;
- preview/scrub through the same evaluator, truthful duration/frame count, bounded visible-frame rendering, failed-media placeholder without order loss;
- strict browser-development save/reload and exact G01B portable Timeline/Scene/media-order round trip;
- existing application retained as the default route.

Functional checks prove exact end/start state and epsilon continuity for 1, 2, 7, 8, and 127 frames; proportional preview/output-sized composition; control causality; source treatment state; bounded 256-frame observation; and automatic/fixed/directed literal examples.

Real Electron `43.1.0` / Chromium `150.0.7871.47` CI now proves the running renderer journey on Ubuntu 24.04/Xvfb with Chromium sandboxing enabled: ordered source decode, 4:5 vertical/reverse recomposition, causal controls, automatic/fixed/directed Timeline modes, explicit save/reset/reload, scrub, 768 ms same-frame real-time motion, keyboard focus progression, and failed-media order preservation. Three captured PNGs and a machine receipt are held in GitHub Actions artifact `9634400798` with archive digest `sha256:87e11dffe8ed4fdb90c23d671eac01b184a7bec50133193e77e256d08cd9aa20`; the exact receipt is also committed as `G02_RENDERER_CI_RECEIPT.json`.

The alpha packet contains 978,796 fully transparent pixels, 1,233 partial pixels, 163,011 opaque pixels, and zero non-zero RGB pixels under alpha zero. Source images decode at all eight declared ratios and retain opacity 1, filter none, normal blend, and selected cover fit.

Not proved: a recorded real-time video clip, long-running browser heap profile, decoded pixel-for-pixel RGB comparison against external user media, exact Garuda behaviour, or a human visual/motion verdict. These remain downstream evidence/acceptance gates; they do not keep the completed G02 engineering boundary active.

## G03 — Linux HostPort security boundary

State: **engineering-complete in source and a sandboxed packaged-directory Electron journey; exact Garuda and human acceptance remain unclaimed**

Implemented and proved:

- strict packaged `gallery-app://app` origin, isolated session, containment, CSP, MIME, and navigation/network/permission/download denial;
- one frozen versioned `galleryHost` preload boundary with strict envelopes and main-derived owner identity;
- 256-bit opaque owner/generation/scope/expiry grants with verified bounded ranges, suffix ranges, streaming, concurrency, revocation, and cleanup;
- two-phase Project open with candidate hydration before acceptance and prior-Project preservation on cancel or failure;
- cleanup across retry, replacement, reload, navigation, render failure, startup residue, and window disposal;
- exact embedded package/source identity and a separate hardened G03 package profile;
- real packaged Linux x64 import, save, quit, relaunch, reopen, fresh-grant, vertical-canvas, Scene, and Timeline journey with Chromium sandbox enabled.

CI run `33045232888` passed source tests on Ubuntu, macOS, and Windows plus packaged renderer job `98427574258`. Artifact `9635371682` has archive digest `sha256:840e8a5e7f1ea34edcf07e1b534e301e961668f58dd40c29485970811beb5043`; the durable receipt is `G03_RENDERER_CI_RECEIPT.json`.

## G05 — deterministic audio

State: **engineering-complete in source and a sandboxed packaged-directory Electron save/relaunch/reopen journey; final mux/export and human listening acceptance remain unclaimed**

Implemented and proved:

- rational 48 kHz story clock and chunk-invariant source-video/presenter/soundtrack/master mixer;
- placement, source-in/span, loop, fades, gain, mute, solo, master, and deterministic ducking;
- exact source-video visual/audio duration, timestamp-offset preservation, and trailing pad;
- opaque bounded HostPort choose/decode/waveform/prepare/cancel/revoke operations;
- portable three-role audio identity with atomic save, fresh-grant reopen, and exact PCM readback;
- bounded FFmpeg runtime and package-pinned approved binary identity;
- app-authored archive output contained within the unchanged G01A import quotas.

CI run `33055407716` passed source tests on Ubuntu, macOS, and Windows plus packaged renderer job `98460833564`. Artifact `9639381800` has archive digest `sha256:2ee786bc36b5dffe0e7c482399737190596d8a380dfc6fe58893f3fab30572a2`; the durable summary is `G05_RENDERER_CI_RECEIPT.json`.

## G06A — verified PNG Frames export

State: **engineering-complete in source and sandboxed packaged Electron CI; H.264/AAC, native alpha codecs, exact Garuda, and human acceptance remain unclaimed**

Implemented and proved:

- one immutable one-shot export snapshot with exactly `round(duration × fps)` frames evaluated at `n / fps`;
- explicit PNG Frames alpha intent and honest no-audio consequence without changing Project audio intent;
- one-shot opaque destination grants, held parent authority, private bounded source-video frame caches, and hardened held-FD FFmpeg decoding;
- complete PNG CRC/inflate/dimension/alpha/byte/hash verification plus a path-free manifest before transactional publication;
- prior destination preservation, early/mid-render cancellation, live semantic progress, cleanup, and one renderer-owned active job;
- production Quiet Carousel renderer with image-decode readiness and source-video story-clock preview/scrub/export parity;
- platform-correct Windows ACL handling while retaining POSIX owner/mode checks on Linux and macOS.

CI run `33058623839` passed source tests on Ubuntu, macOS, and Windows plus packaged renderer job `98471574527`. Artifact `9640730478` has archive digest `sha256:378c78b6cf663f1b9ec93feb8c4959485b21f34b29bd995b908ab73589d20076` and contains 43 independently verified `64×64` RGBA frames at 24 fps, the manifest, success screenshot, and causal cancellation receipt.

## G06B — verified opaque H.264/AAC export

State: **engineering-complete in source and sandboxed packaged Electron CI; exact Garuda, native Mac, and human acceptance remain unclaimed**

Implemented and proved:

- immutable Quiet Carousel-only opaque MP4 snapshots with exact once/repeat/loop cycle and finale clocks;
- deterministic bounded 48 kHz stereo PCM staging and the full authored Project mix;
- H.264 High progressive yuv420p8, BT.709 limited range, canonical two-second sync cadence, fast start, and AAC-LC;
- bounded hierarchical MP4 validation plus full video/audio decode and independent reference-audio comparison;
- one-shot path-free HostPort operations, rate and byte quotas, saturation-safe cancellation, and process reaping;
- exclusive owner-only no-overwrite staging, atomic hard-link publication, destination-race preservation, and residue cleanup;
- real packaged-renderer success and cancellation journeys with causal progress, source-artwork pixel readback, and non-silent audio readback.

CI run `33279747975` passed source tests on Ubuntu, macOS, and Windows plus packaged renderer job `99172780527`. Artifact `9722631997` has archive digest `sha256:b73fd01dc40d030560a66b79688ff760bd1aaf8d327e97bb1f50886b223a2e71` and contains the verified MP4, success screenshot/receipt, and zero-residue cancellation receipt. The exact implementation tree is `8290216b3e32a95864959f993c60b429d9f3d2c3`.

## Known unsafe or unproved surfaces

- legacy non-G03 package paths still exist and are not release candidates;
- decoded video/audio/proxy/export cache budgets and eviction beyond G03 media reads;
- exact Garuda and Apple-Silicon target behaviour;
- human interaction, visual, motion, and audio acceptance.

Current frontier: **G08 Interface Scale and editor UI/HostPort integration**. G06B is engineering-closed. Existing isolated G08 core and interface-polish branches must be reconciled against this exact tree before any UI claim. G04 remains deferred until an Apple-Silicon runner is available.
