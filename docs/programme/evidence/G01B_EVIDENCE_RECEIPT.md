# G01B evidence receipt

Ticket: G01B — clean versioned Project schema and atomic round trip

## Identity and state

- Repository: `bomkino/galileo-gallery`
- Branch: `codex/g01a-safe-archive-import`
- Starting local SHA: `08377179340b63a468ce6a797f5ef58d64a0ad24`
- Tree-equivalent starting remote SHA: `256e82f2584d9907ef2b06d152cc89a5f0e7b78f`
- Implementation commit reviewed: `4e1c1530a487c41517b6146474e48310309dbba4`
- Final reviewed revision: this receipt's containing commit
- Runtime: Linux `6.18.35` x86_64; Node `v24.19.0`; npm `11.9.0`
- Highest state: **tested in source**. Not packaged, installed, released, or human-accepted.

The local and remote G01A histories diverge because the prior Work session made a
tree-equivalent GitHub connector commit. Both starting trees were
`14a80e73c2b67d03e80f5a71e5552bd28e1311ad`; no source was reset or discarded.

## Schema map

| Record | Portable truth |
| --- | --- |
| Identity | `format=galileo-gallery-project`, `product=galileo-gallery`, schema v2, engine v1 |
| Media | ordered stable ID/name, kind, exact archive path, bytes, SHA-256, signature, frame ratio/aspect/caption/spotlight/mute |
| Canvas | format, output dimensions, ratio intent, custom ratio, safe padding |
| Scene | stable ID, version 1, bounded causal parameters |
| Look | stable ID, version 1, bounded colour/background parameters |
| Visual Timeline | automatic/fixed-duration/directed identity plus playback, repeat, axis, direction, entry/cycle/hold/finale/exit timing |
| Audio | `gallery-audio-intent` v1, per-media source policy, empty later-expandable lanes, master gain/mute |
| Export default | creator quality choice |

Host URLs/paths, grants, Interface Scale, panel/window state, MCP state,
waveform/decode caches, jobs, secrets, and machine identity are excluded.

## Canonical fixture and round trip

| Order | Fixture | Bytes | Signature | SHA-256 |
| ---: | --- | ---: | --- | --- |
| 1 | `First frame.png` | 27 | `png` | `bfbcb1abe53c9daf76ee657ea0f01728da78d97cdecb3fd25143c6a5482827e7` |
| 2 | `Second frame.webp` | 31 | `webp` | `a4e7d5949b9e852283a1980002c0d090f018df9ddaf5cd5a47b34b0aff657628` |

`save → G01A stage → validate → promote → open → save` produced equal canonical
manifest text, equal ordered hashes, equal Scene/Look/Timeline/audio identity, and
equal runtime creative config after substituting the expected new app-owned media
URLs. Canonical JSON recursively sorts keys and ends with one newline.

## Failure and preservation matrix

| Case | Stable result | Prior Project/source/staging |
| --- | --- | --- |
| Experimental Gallery v1 | `legacy_project_unsupported` | unchanged / byte-equal / empty |
| Wrong product | `wrong_product` | unchanged / byte-equal / empty |
| Future schema | `future_version_unsupported` | unchanged / byte-equal / empty |
| Missing / unexpected media | `media_missing` / `unexpected_archive_entry` | unchanged / byte-equal / empty |
| Hash / signature mismatch | `media_hash_mismatch` / `media_signature_mismatch` | unchanged / byte-equal / empty |
| Malformed canvas / Scene / Look / Timeline / audio | causal typed code | unchanged / byte-equal / empty |
| Cancel before staging | `cancelled` | unchanged / byte-equal / empty |
| Cancel during promoted-media copy | `cancelled` | unchanged / byte-equal / partial promoted root removed |
| Failed save over prior destination | `media_missing` | prior destination byte-equal; no sibling residue |

## Public seams exercised

- `validatePortableProject()` and `canonicalProjectJSON()`
- `savePortableProjectArchive()`
- `openPortableProjectArchive()` over G01A `withStagedProjectArchive()`
- existing Electron `project:save` / `project:open` delegation and preload commands
- `projectConfigAfterOpen()` single-result current-state replacement boundary

## Commands and results

- Mega-kit `sha256sum -c CHECKSUMS.sha256`: all 694 entries passed before work.
- `node scripts/verify-project-schema.cjs`: pass.
- `npm test`: pass; build and all existing/source/G01A/G01B behavioural checks.
- `npm run verify:source`: pass.
- `node --check` on main/import/persistence/schema modules: pass.
- `git diff --check`: pass.
- `npm ls adm-zip yauzl --depth=0`: `adm-zip@0.6.0`, `yauzl@3.4.0`.
- `npm audit --omit=dev --json`: zero production vulnerabilities.
- full `npm audit --json`: nine high-severity development-tool findings remain
  (`brace-expansion`, `concurrently`/`shell-quote`, `fast-uri`, `js-yaml`,
  `nanoid`, `postcss`, `tar`, `undici`). No dependency update/install was made.

## Fixed-point review

### Spec axis

The reviewed `0837717...4e1c153` diff keeps G01A as the sole hostile-archive
reader, creates one clean v2 schema instead of a v1 migration renderer, validates
the complete manifest/file set before one replacement result, and owns no Scene
renderer, full audio engine, HostPort, export, MCP, Interface Scale, or studio
redesign. Schema, ordered media, canvas, Scene, Look, Timeline, audio identity,
canonical serialization, failure preservation, and portable privacy criteria have
causal source evidence.

One acceptance observation remains unrun: a real Electron dialog/UI
save/open/reopen journey. The checked-out Electron launcher has no local binary
and attempted to download one; the attempt was stopped because installation and
external communication are not authorized. No runtime UI or screenshot claim is
made.

### Standards axis

Review found and fixed two concrete issues:

1. Media display names and Look `ground`/`paper` values were bounded but could
   still contain path-shaped strings. Names now reject separators/control bytes;
   Look colours accept only empty or bounded hex values. A path-leak fixture fails
   with `look_invalid`.
2. If runtime config hydration failed after validated media promotion, its new
   app-owned directory could remain. The hydration boundary now removes that
   directory before propagating failure.

Focused and full gates passed after both fixes. A separate long-lived opened-media
retention/revocation policy remains part of the G03 opaque HostPort authority
work; G01B does not claim that broader repair.

## Unrun evidence and frontier

- No Electron UI capture or interactive dialog journey: blocked by absent runtime
  plus the explicit no-install/no-external-communication gate.
- No package, exact Garuda, Apple-Silicon, install, signing, notarization, merge,
  release, publication, visual acceptance, motion evidence, audio playback, or
  output artifact evidence.
- G01B is source-ready. Ticket closure and dependency activation are withheld until
  the real Electron save/open/reopen observation runs, so G02 is not claimed active.
- Existing path-encoded renderer media authority, IPC sender/origin/generation
  validation, durable opened-media retention, and decoded cache budgets remain
  explicit later HostPort/security risks.
