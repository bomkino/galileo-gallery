# G06A evidence receipt — verified PNG Frames export

Date: 27 August 2026

State: **engineering-complete; not released or human-accepted**

## Identity

- Local branch: `codex/g06-verified-png-export`
- Local implementation commits: `5404fcb`, `c71b7a7`, `68fc5b2`
- Reviewed local implementation tree: `f4481b7d72eaebc9c0166e10eba81b62bbf4610d`
- Remote CI commit: `1cfe60a25abc80be5115b90cf7168a5cc1bcbc4d`
- Remote CI tree: `d8b38f01b369a8b8a5a27fef1fb120c4aec21f6b`
- CI run/job: `33058623839` / `98471574527`

The connector-created remote history overlays the reviewed G06A files on the latest published G05
evidence tree. After replaying the non-overlapping G05 evidence commits locally, the local and
remote source trees are exactly `d8b38f01b369a8b8a5a27fef1fb120c4aec21f6b`.

## Public seam and behaviour

- HostPort exposes capabilities, immutable PNG preflight, one-shot destination selection, start,
  progress, and cancel without returning raw paths or grant tokens in evidence.
- The preflight freezes Scene, visual Timeline, ordered media, canvas, alpha intent, fps, duration,
  and exactly `round(duration × fps)` frame times at `n / fps`.
- PNG output preserves requested transparency and explicitly contains no audio; Project audio intent
  remains unchanged.
- Each PNG is bounded before parsing, fully CRC/inflate/dimension/alpha checked, SHA-256 verified,
  and recorded in a path-free manifest before transactional directory promotion.
- Cancellation after a real rendered frame preserves the exact prior destination and leaves no
  stage/backup residue.

## Source and review evidence

- `npm test`: pass.
- Focused PNG runtime, HostPort, private-cache, hardened-FFmpeg, renderer-adapter, and Quiet Carousel
  parity checks: pass.
- `npm run build`: pass.
- `npm audit --omit=dev`: zero known vulnerabilities.
- `git diff --check`: pass.
- Spec and Standards fixed-point reviews: no blocker/high findings.

The reviews found and closed destination restoration loss, missing Linux UI progress, weak IPC
payload validation, nested FFmpeg protocol exposure, shared-cache trust, frame-grant exhaustion,
source-video story-clock mismatch, unbounded decoded cache growth, hostile-media runner bounds,
Windows POSIX-mode rejection, and a terminal cancellation state that React stored but did not render.

## Packaged evidence

CI run `33058623839` passed the complete source suite on Ubuntu, macOS, and Windows. The sandboxed
packaged Electron renderer job passed real PNG success and mid-render cancellation journeys.

- Artifact: `g06-verified-png-renderer-evidence`, ID `9640730478`, 1,305,246 bytes.
- Archive digest: `sha256:378c78b6cf663f1b9ec93feb8c4959485b21f34b29bd995b908ab73589d20076`.
- Success: 43/43 independently rechecked `64×64` RGBA PNGs, 24 fps, 1,800 ms intent, audio `none`.
- Manifest digest: `sha256:1978f7d874298591e91bfd0a4d7104e8169c01bee73c53f4b7c9273b24c92e47`.
- Success screenshot digest: `sha256:f98b144f1e05c8b4f04df4b9175d029da5547073ab2dade06b10913dd2dc5659`.
- Alpha sample: 3,291 transparent pixels, 577 opaque pixels, and 110 opaque artwork pixels.
- Cancellation: observed preparing then rendering frame 1/43; terminal phase `cancelled`; prior
  destination entries exactly `["prior.txt"]`; no transaction residue.

The screenshot was visually inspected and shows the running Gallery export panel with a 64×64,
24 fps transparent Project and the semantic `PNG Frames verified` terminal state. This is
engineering evidence, not a human taste or comprehension verdict.

## Residuals and frontier

- Final destination operations are not dirfd-relative; a hard crash can strand unpredictable
  stage/backup residue in a user-selected parent, and post-commit backup cleanup is best-effort.
- Opaque RGBA output is structurally checked but not separately exhaustively scanned for alpha 255.
- The packaged smoke uses image media; source-video parity is covered by source, injected, and
  direct held-FD runner evidence rather than this packaged packet.
- H.264/AAC is G06B. Native ProRes 4444 and HEVC Alpha are later native-platform work.
- Exact Garuda, Apple-Silicon, install, release, and human visual acceptance are unrun and unclaimed.
