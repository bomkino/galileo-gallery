# G05 evidence receipt — deterministic audio

Ticket: G05 — deterministic source-video, presenter, soundtrack, and master audio

## Identity and state

- Repository: `bomkino/galileo-gallery`
- Branch: `codex/g05-deterministic-audio`
- Starting local SHA: `1d8b996`
- Ending local SHA: `17037d9b9386c97b1a2c6df45d68d25ab629a025`
- Ending remote SHA: `078acf4254ce04dca748d73532af9a9247a706a9`
- Exact shared tree: `7ce53b5ebfa60db6830043a815e3991c2313067e`
- Runtime: local Node `v24.19.0`, npm `11.9.0`; CI Electron `43.1.0`, Chromium `150.0.7871.47`, Node `24.18.0`, Linux x64.
- Highest state: **edited, causally source-tested on Linux/macOS/Windows, Vite-built, Linux packaged-directory built, and real packaged Electron save/relaunch/reopen tested**. Final mux/export, installer, exact Garuda/Mac packages, release, listening acceptance, and human taste acceptance remain unclaimed.

## Public seam

- Rational 48 kHz story clock and deterministic, chunk-invariant PCM mixer.
- Source-video, presenter, soundtrack, and master intent with placement, source-in/span, looping, fades, gain, mute, solo, and deterministic ducking.
- Source-video audio normalized to exact visual duration with leading-offset preservation and trailing pad.
- Opaque grant-backed audio choice, bounded decode, waveform, prepare, cancel, revoke, and cleanup operations through the existing frozen HostPort.
- Portable v2 Project identity for three audio roles; external PCM assets save atomically and reopen with exact hashes, decoded identity, lane controls, and fresh grants.
- One active bounded FFmpeg job, per-source/aggregate quotas, disk reserve, timeout, cancellation, transactional cache, mutation verification, and startup/disposal cleanup.
- Package-owned, approved `ffmpeg-static` b6.1.1 / `7.0.2-static` binary. Linux x64 SHA-256: `e7e7fb30477f717e6f55f9180a70386c62677ef8a4d4d1a5d948f4098aa3eb99`.

## Causal evidence

- The packaged journey imports a deterministic two-second video whose audio begins at 250 ms and ends at 1.75 s. Runtime output is exactly 96,000 stereo frames: 12,000 leading silent frames, preserved content timing, and trailing pad to the visual loop boundary.
- Save authors three lanes: source-video, soundtrack, and presenter. All three produce 48-bucket waveforms.
- Gain, mute, solo, master mute, ducking, and reset each change or restore exact PCM hashes. Master mute produces peak `0.000`; the final authored mix produces peak `0.901` with zero clipped samples.
- The final diagnostic hash is `3c2ff692cfbdc1e1e7c68810647c4c8830e0563f64230fcb2c1f92784632b33c` before save and after relaunch/reopen.
- Reopen restores the three roles, soundtrack gain `0.60`, presenter start `1000 ms`, ducking, waveforms, and exact PCM diagnostic.
- Import controls are transactionally locked and visibly cancellable. Raw paths and grant values are absent from DOM/evidence.
- Highly compressible authored PCM is stored when necessary so app-authored projects stay inside the unchanged hostile-import ratio limits. Per-entry, manifest, total-expanded, entry-count, compression, and final archive limits are enforced before atomic destination replacement.

## Runtime evidence

- Workflow run: `33055407716` — success.
- Packaged renderer job: `98460833564` — success.
- Linux/macOS/Windows source-test jobs: success.
- Artifact: `g05-deterministic-audio-renderer-evidence`, ID `9639381800`, 1,161,453 bytes.
- Artifact archive digest: `sha256:2ee786bc36b5dffe0e7c482399737190596d8a380dfc6fe58893f3fab30572a2`.
- Save PNG: `sha256:73af64b1afd5402ac489db603d2ffc76c6571bee84594182cbe09bcdcf856801`.
- Reopen PNG: `sha256:d0f9d952d4c3b58f0b1e175916b074716ec6fb77b34ae5c311a1d324d001a9db`.
- Portable Project canonical hash reported by the verifier: `f4d8a9bb8feb572abcdc62a6d40b85310b68d7af2132e231c7b17686cc1a86b8`.
- Downloaded artifact digest and receipts were independently rechecked with `scripts/verify-g05-renderer-artifacts.cjs`; both 1280×893 PNGs were visually inspected for matching three-lane state and save/open status.
- Durable summary: `G05_RENDERER_CI_RECEIPT.json`.

## Commands and results

- `npm test` — pass locally and on Linux/macOS/Windows CI.
- `node scripts/verify-linux-video-audio-runtime.cjs` — pass.
- `node scripts/verify-linux-host-controller.cjs` — pass.
- `npm run prepare:ffmpeg` — pass.
- `npm run verify:packaged-ffmpeg` — pass.
- `npm run package:linux:g03` — pass locally and in CI.
- `scripts/verify-g05-renderer-artifacts.cjs` against the downloaded CI artifact — pass.
- `git diff --check` — pass.
- Production audit — zero known vulnerabilities. Nine high-severity development-tool findings remain.

## Fixed-point review and frontier

Separate Spec and Standards reviews fixed visual/audio duration divergence, timestamp-offset loss, external sample-rate ambiguity, save/open transaction races, cache/residue/cancellation defects, inherited FFmpeg environment/protocol exposure, missing package identity, Windows-only permission assertions, React-controlled smoke input, and app-authored compression self-rejection. Final review reported no blocker/high finding.

G05 engineering is closed. G06 now owns immutable export jobs, verified PNG Frames and H.264/AAC mux/output. G08's platform-neutral Interface Scale core can proceed in parallel, but its UI/HostPort integration must follow G06 serially. G04 remains Apple-Silicon-runner gated.
