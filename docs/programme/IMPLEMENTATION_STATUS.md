# Implementation status

Updated: 26 August 2026

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

State: **not started**

Still required before any archive can replace the current Project:

- canonical manifest and product/schema rules;
- ordered media list, expected/unexpected entry policy, sizes, signatures/decoder acceptance, and hashes;
- Scene identity, version, parameters, and upgrade rules for post-rebuild versions;
- deterministic visual Timeline intent;
- audio source/clip/lane/mix identity;
- validated commit into the runtime/save boundary and save/reopen fixture.

## Known unsafe or unproved surfaces

- current reversible path-encoded media URLs and broad media protocol authority;
- IPC sender/origin/generation/runtime-schema hardening outside import calls;
- decoded video/proxy/export cache budgets and eviction;
- packaged Electron security and lifecycle;
- exact Garuda and Apple-Silicon target behaviour;
- UI import capture and human interaction review.

Next product ticket after G01B: `G02` Quiet Carousel browser tracer.
