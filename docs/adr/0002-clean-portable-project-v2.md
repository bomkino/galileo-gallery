# ADR 0002: use one clean portable Gallery Project v2

Status: accepted for G01B

Date: 27 August 2026

## Context

The experimental archive stored a renderer-shaped `config` object under a v1
manifest and carried relative URLs without content identity. It could not prove
ordered media, reject undeclared media, separate canvas from frame treatment, or
round-trip Scene, Look, visual Timeline, and audio intent as product concepts.
There is no real v1 user corpus to justify a migration renderer.

## Decision

Gallery's first supported portable format is
`format: galileo-gallery-project`, `product: galileo-gallery`,
`schemaVersion: 2`, `engineVersion: 1`.

The canonical manifest owns:

- an ordered media table with stable ID, display name, archive path, byte size,
  SHA-256, detected signature, media kind, and per-frame intent;
- canvas format, dimensions, ratio, and safe padding independently from frame
  fit/aspect intent;
- Scene and Look identity, version, and parameters;
- visual Timeline mode, phases, direction, and repeat intent;
- explicit v1 audio-intent identity, per-media source-video policy, empty lane
  table for later expansion, and deterministic master defaults;
- the creator's export-quality default.

Serialization recursively sorts object keys and emits one trailing newline.
Unknown, missing, malformed, wrong-product, and future-version fields fail.
No migration exists: experimental v1 files retain their bytes and receive the
existing causal unsupported message.

G01A remains the only untrusted ZIP reader. G01B validates the fixed manifest,
exact expected file set, every signature/size/hash, and only then promotes media
to a new app-owned directory and returns one replacement runtime config. Save
builds and validates the manifest before the staged sibling archive atomically
replaces its destination.

`adm-zip@0.6.0` remains confined to app-authored ZIP output. It does not parse or
extract untrusted archives; G01A's streamed `yauzl` boundary owns that path.

## Consequences

- G02 can adopt stable Project/media/canvas/Scene/Look/Timeline/audio identities
  without owning or revising persistence.
- Host paths, grants, Interface Scale, MCP state, caches, waveform data, jobs,
  secrets, and machine identity are absent from the portable manifest.
- Full audio lanes, Scene upgrades for real post-v2 versions, and the Scene
  renderer remain later tickets.
- Existing path-encoded runtime media authority remains a G03 HostPort risk; it
  is not mistaken for portable Project truth.
