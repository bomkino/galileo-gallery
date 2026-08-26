# Implementation status

Updated: 27 August 2026

Repository start: `bomkino/galileo-gallery@2762043bb733aa28a6c63fe26564504b9f257564`

Task branch: `codex/g01a-safe-archive-import`

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

State: **source-ready and reviewed; runtime UI observation blocked**

Protected now:

- clean `galileo-gallery-project` schema v2 with explicit product/engine identity;
- deterministic canonical serialization and exact unknown-field policy;
- ordered media identities, safe archive paths, byte sizes, SHA-256 hashes, detected signatures, and per-frame intent;
- distinct canvas, Scene v1, Look v1, visual Timeline, audio-intent v1, and export-default records;
- exact missing/unexpected entry policy and complete hash/signature validation through G01A staging;
- app-owned media promotion only after full validation, followed by the existing one-result current-Project replacement seam;
- atomic destination replacement only after a complete validated save archive exists;
- safe experimental-v1, wrong-product, future, malformed, cancelled, and corrupt-media failure without prior-state or source-byte mutation.

Source checks cover save/open/reopen canonical equality, ordered hashes, privacy exclusions, semantic failure matrix, cancellation before staging and during media promotion, staging cleanup, and prior destination/Project preservation. A real Electron dialog/UI journey is not yet run because the local Electron binary is absent and installation is not authorized.

## Known unsafe or unproved surfaces

- current reversible path-encoded media URLs and broad media protocol authority;
- IPC sender/origin/generation/runtime-schema hardening outside import calls;
- decoded video/proxy/export cache budgets and eviction;
- packaged Electron security and lifecycle;
- exact Garuda and Apple-Silicon target behaviour;
- UI import capture and human interaction review; the local Electron launcher would download a binary, so the attempted smoke was stopped before installation.

Next product ticket after the G01B Electron save/open/reopen observation: `G02` Quiet Carousel browser tracer.
