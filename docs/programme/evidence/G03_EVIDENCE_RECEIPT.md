# G03 evidence receipt — Linux HostPort and packaged origin

Ticket: G03 — Linux HostPort security boundary

## Identity and state

- Repository: `bomkino/galileo-gallery`
- Branch: `codex/g03-linux-host-port`
- Starting local SHA: `6f6f956`
- Ending local SHA: `306a27ce5b508a371a2b396566a3ce56ce89d3fc`
- Ending remote SHA: `e15ad65ae9b5c0a1460fc08ca48057ba2f196c15`
- Exact shared tree: `340b44e7bdcd2a0c88bdbdfb1166cdc4ab6c5d18`
- Runtime: local Node `v24.19.0`, npm `11.9.0`; CI Electron `43.1.0`, Chromium `150.0.7871.47`, Linux x64.
- Highest state: **edited, causally source-tested on Linux/macOS/Windows, Vite-built, Linux packaged-directory built, and real packaged Electron save/relaunch/reopen tested**. No installer, exact Garuda package, app installation, release, or human acceptance claim.

## Public security seam

- Strict `gallery-app://app` packaged origin with containment, MIME, CSP, no symlink escape, and isolated Electron session.
- Frozen preload exposes only a versioned named `galleryHost` interface on one IPC channel.
- Main derives the request owner from `webContents`; strict request/response envelopes enforce protocol, generation, state, operation, size, and rate.
- Random 256-bit media grants are owner/generation/scope/expiry bound. Reads are verified and bounded; ranges, suffix ranges, streaming, concurrency, revocation, and cleanup are enforced.
- Project open is two phase: stage and hydrate candidate grants, then accept or discard without mutating the prior Project on failure or cancellation.
- Startup, navigation, renderer failure, cancellation, replacement, and window disposal clean pending or obsolete authority.
- The hardened G03 profile is separate from the incomplete legacy Linux package path.

## Causal checks

- Real PNG import becomes an opaque `reel-media://grant/<64 hex>` URL; raw paths and grant values do not enter DOM, portable Project, errors, or evidence.
- Portable save preserves one ordered source frame, `1080x1920` canvas, vertical axis, Scene, and Timeline.
- The exact packaged-directory executable quits, relaunches with the same user-data directory, opens the archive, hydrates media, accepts the candidate, and reproduces the same Project state with a fresh grant.
- Sandbox is enabled with the Electron helper owned by root and mode `4755`; no `--no-sandbox` launch.
- Popup, top-frame navigation, permission, download, remote request, and legacy raw-media request attempts are denied and counted.
- Renderer has no `process` or `require`; storage contains no Project authority.
- Cross-platform source suite passes on Ubuntu, macOS, and Windows.

## Runtime evidence

- Workflow run: `33045232888`.
- Packaged renderer job: `98427574258` — success.
- Artifact: `g03-linux-host-port-renderer-evidence`, ID `9635371682`, 1,287,034 bytes.
- Artifact digest: `sha256:840e8a5e7f1ea34edcf07e1b534e301e961668f58dd40c29485970811beb5043`.
- Save PNG SHA-256: `5f43e9dee5bdd6baf598a4ddc4104cf07ea2649c15e142bf912378a340f0bfb0`.
- Reopen PNG SHA-256: `3e505a2aaea1ef27efeed18a09d0582d014a746c7e0ffb48cb697e7f77480249`.
- Downloaded artifact digest and both receipts were independently rechecked with `scripts/verify-g03-renderer-artifacts.cjs`; both PNGs were visually inspected for matching vertical Project state and save/open status.
- Durable machine receipt: `G03_RENDERER_CI_RECEIPT.json`.

## Commands and results

- `npm test` — pass locally and on Linux/macOS/Windows CI.
- `node scripts/verify-linux-host-port.cjs` — pass.
- `node scripts/verify-linux-host-controller.cjs` — pass.
- `node --experimental-strip-types scripts/verify-g03-persistence-controller.mjs` — pass.
- `node scripts/verify-linux-protocols.cjs` — pass.
- `npm run package:linux:g03` — pass locally and in CI.
- `scripts/verify-g03-renderer-artifacts.cjs` against the downloaded CI artifact — pass.
- `git diff --check` — pass.
- Production audit remains zero known vulnerabilities; nine pre-existing high-severity development-tool findings remain.

## Fixed-point review

Spec and Standards were reviewed separately after implementation. Findings fixed before closure included normal-package capability regression, candidate-generation cancel/retry races, failed-open grant cleanup, reload/crash cleanup, pre-accept hydration, stream concurrency and full-read bounds, startup residue cleanup, exact packaged identity, Windows open-handle behavior, macOS realpath behavior, invalid automatic Timeline persistence, and truthful top-frame navigation event classification.

The final packet stays bounded to a hardened Linux HostPort tracer/profile. It does not claim the final Garuda package, final product installer, audio/export/MCP, or human visual acceptance.

## Frontier

G03 engineering is closed. G05 deterministic audio is the next cloud-buildable ticket. G04 remains Apple-Silicon runner-gated and must reuse the settled HostPort boundary.
