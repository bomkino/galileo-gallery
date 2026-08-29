# G06B evidence receipt — verified opaque H.264/AAC export

Date: 29 August 2026

State: **engineering-complete in source and sandboxed packaged Electron CI; not installed, released, or human-accepted**

## Identity

- Branch: `codex/g06b-verified-h264-aac`
- Starting commit: `214e7153cba81a84b1619f7c4cc0414242db941a`
- Local implementation/fix commits: `8af5c9208cc4707fb31b5ebfb8bee8e8e8167d31`, `fcf628c860e3fa4fd9ae898bea01740d2530729a`, `014d8a06ddf61bd75092f73596eef91ae252a76c`
- Reviewed local tree: `8290216b3e32a95864959f993c60b429d9f3d2c3`
- Remote implementation/fix commits: `e741b97f1beae44bd5ea85711ba7832e205c22f4`, `200d01c431f164f8ebf907b23a7e0599722c5b48`, `fe935cd4b0f12d77642b2458cf22fc4bd2b1ae20`
- Exact remote tree: `8290216b3e32a95864959f993c60b429d9f3d2c3`
- Successful final CI run/job: `33279747975` / `99172780527`

The connected GitHub writer created remote commits with the exact reviewed local trees because the
shell checkout has no push credential. No PR, merge, tag, release, or app publication occurred.

## Public seam and behaviour

- Linux HostPort advertises a path-free `mp4-h264-aac` capability and freezes one immutable export
  snapshot before any destination is selected.
- G06B is deliberately bounded to opaque Quiet Carousel, H.264 High progressive `yuv420p8`,
  BT.709 limited range, AAC-LC 48 kHz stereo, and the exact authored Project mix.
- Once, repeat, and loop Projects use the same cycle/finale clock as preview and scrub, including the
  terminal partial cycle and exact frame/audio duration relationship.
- PCM is mixed deterministically in bounded chunks, staged owner-only behind one-shot IPC, and closed
  before encode starts. Decode work, staging bytes, IPC rate, process lifetime, diagnostics, and output
  bytes are bounded and cancellable.
- The MP4 verifier checks canonical brands/fast-start structure, two-track identity, exact edit/media/
  sample clocks, sync cadence, H.264 SPS/container agreement, BT.709, AAC-LC identity, and full decoded
  video/audio readback. A separately encoded reference AAC decode detects reordered or substituted
  audio content.
- Publication is no-overwrite and atomic through an exclusive owner-only stage plus hard-link commit.
  Destination races preserve the foreign destination. Cancellation before that commit point publishes
  nothing and removes private PCM and MP4 residue; a later cancellation finishes as verified success.
- The renderer exposes preparing, rendering, encoding, verifying, done, and cancelled states and gives
  the exact unavailable consequence for unsupported Scene, transparency, or audio intent.

## Source, package, and review evidence

- `npm test`: pass after the CI portability repair.
- `npm run verify:source`: pass.
- Focused export-clock, H.264 contract, MP4 inspector, process/publication, HostPort/IPC, and renderer
  adapter suites: pass.
- `git diff --check`: pass.
- Production audit: zero known vulnerabilities.
- Full development audit: nine high-severity findings remain in pre-existing build/test tooling.
- Fresh Spec fixed point: clean.
- Fresh Standards fixed point: clean.

The first push run, `33279078779`, correctly failed two cross-platform test fixtures: macOS FFmpeg
normalized a generated variable-cadence sample back to CFR, and Windows does not expose POSIX mode
bits. The repair creates a deterministic, structurally valid two-run `stts` forgery and retains the
owner-mode assertion on POSIX while proving a regular staged file everywhere. Run `33279241706`
then passed Ubuntu, macOS, Windows, and the packaged renderer journey.

The fresh post-CI reviews then found and closed two commit-boundary defects: a settled host start
rejection could latch renderer ownership until restart, and cancellation during post-link hashing
could report cancelled after publishing a destination. Causal tests now prove immediate retry after
a settled start rejection and define the atomic hard link as the non-cancellable commit point.

Final run `33279747975` passed Ubuntu, macOS, Windows, and the packaged renderer journey after those
review fixes. The packaged renderer reported embedded source commit
`fe935cd4b0f12d77642b2458cf22fc4bd2b1ae20`, source tree
`8290216b3e32a95864959f993c60b429d9f3d2c3`, and build ID `g03-mtezbmfs` on save and reopen.

An exact local Linux x64 directory package was rebuilt from local commit
`014d8a06ddf61bd75092f73596eef91ae252a76c`, tree
`8290216b3e32a95864959f993c60b429d9f3d2c3`, Electron `43.1.0`, and build profile
`g03-linux-host-port` with build ID `g03-mtezbp8n`. Its app bundle carries that identity. The executable SHA-256 is
`2634af9941986102ad96e214a1650188099291e050d649d39ceba0905850fdd5`; `app.asar` is
`17b61d939d2ab9a09fa63f6d1f4ae3e631c5cb349b5a165f229c8debdece06e7`; bundled FFmpeg is byte-identical
to approved b6.1.1/7.0.2-static SHA-256
`e7e7fb30477f717e6f55f9180a70386c62677ef8a4d4d1a5d948f4098aa3eb99`. The package was not installed.

## Packaged CI evidence

Artifact `g06-verified-export-renderer-evidence`, ID `9722631997`, is 1,600,905 bytes with archive
digest `sha256:b73fd01dc40d030560a66b79688ff760bd1aaf8d327e97bb1f50886b223a2e71`.

- Real renderer success: 86 frames, 64×64, 24 fps, H.264 High progressive yuv420p BT.709 plus
  AAC-LC 48 kHz stereo; semantic terminal state `H.264/AAC verified`.
- MP4: 11,794 bytes, SHA-256
  `be4c8bc06a3e4f9e7ecdfc3a0532702ee02a4726837afd20aa5914a12a73424f`.
- Independent readback: 688,128 decoded audio bytes with peak 24,977; 12,288 first-frame RGB bytes
  with 128 chromatic source-artwork pixels.
- Observed progress reached preparing, every rendered frame, encoding, verifying, and done.
- Cancellation occurred after rendering frame 1/86; destination remained absent; terminal state was
  `Export cancelled.`; transaction and private-audio residue lists were empty.
- Success screenshot SHA-256:
  `225a7a9e82c90015c087acff3592d59a166911b5b600466d50a57d3f29a2b156`.

The screenshot was visually inspected and coherently shows the real packaged Gallery Export panel,
selected MP4 capability, source artwork, exact 64×64/24 fps summary, and verified terminal state.
This is engineering evidence, not a human taste, motion, or listening verdict.

## Residuals and frontier

- MP4 currently supports Quiet Carousel, opaque output, 48 kHz stereo Project masters, and a new
  destination only. Overwrite, reveal, and ETA are not claimed.
- Native ProRes 4444 and supported HEVC Alpha remain native-platform work.
- Exact Garuda/KDE and Apple-Silicon candidates, app installation, human watch/listen/visual review,
  release, signing, and notarization remain unrun and unclaimed.
- G08 now owns Interface Scale and the bold, spacious editor UI/HostPort integration. G04 remains
  deferred until an Apple-Silicon runner is available.
