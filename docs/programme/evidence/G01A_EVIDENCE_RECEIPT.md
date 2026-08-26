# G01A evidence receipt

Ticket: G01A — safe archive containment, quotas, staging, cancellation, cleanup, and prior-project preservation

## Identity

- Repository: `bomkino/galileo-gallery`
- Starting branch/SHA: `main@2762043bb733aa28a6c63fe26564504b9f257564`
- Task branch: `codex/g01a-safe-archive-import`
- First implementation commit: `dbd18e14bccdadb72c4f1fc806b259def4e6cb12`
- Final reviewed revision: this receipt's containing commit
- Runtime: Linux 6.18.35 x86_64; Node `v24.19.0`; npm `11.9.0`
- Highest state: **tested**. Not packaged, installed, released, or accepted.

## Public seams exercised

- `withStagedProjectArchive()` archive/staging ownership boundary
- `rejectUnsupportedProjectArchive()` G01A manifest-classification boundary
- Electron `project:open` and `project:cancel-open` command path
- preload `openProject()` / `cancelProjectOpen()` result vocabulary
- `projectConfigAfterOpen()` current-state replacement boundary used by `App`

## Quotas

| Limit | Production value |
| --- | ---: |
| Archive bytes | 16 GiB |
| Entries | 4,096 |
| Individual expanded entry | 8 GiB |
| Total expanded bytes | 32 GiB |
| Individual compression ratio | 200:1 |
| Aggregate compression ratio | 100:1 |
| Manifest | 2 MiB |
| Archive path / segment | 1,024 / 255 UTF-8 bytes |
| Free-space reserve | 1 GiB |

Tests inject smaller values through the same interface so each limit is breached without consuming production-scale resources.

## Fixture matrix

| Fixture | Expected observation | Result |
| --- | --- | --- |
| Canonical safe container | Streamed to contained staging; callback reads exact bytes; staging removed | Pass |
| Absolute, drive, UNC, traversal, backslash, NUL | `unsafe_entry_name`; no escaped file; no residue | Pass |
| Empty/dot segment, reserved device, trailing dot, non-NFC | `unsafe_entry_name`; no residue | Pass |
| Case-normalized duplicate and file/child conflict | `duplicate_entry`; no residue | Pass |
| Archive bytes / entry count / individual / total | Corresponding stable quota code; no residue | Pass |
| Forged roughly 4 GiB expanded-size header | `entry_too_large` before allocation/extraction | Pass |
| Individual and aggregate compression pressure | Unsafe ratio rejected; safe mixed JSON/media aggregate accepted | Pass |
| Unix symlink semantics | `unsupported_archive_entry`; no link created | Pass |
| Abort after first extracted entry | `cancelled`; no residue | Pass |
| Gallery/Opening Reel experimental v1 | `legacy_project_unsupported`; source SHA-256 unchanged | Pass |
| Wrong product / future Gallery version | Stable causal failure; source and prior project unchanged | Pass |
| Abandoned staging / live process-owned staging | Abandoned UUID directory removed; live and unrelated directories retained | Pass |
| Symlinked staging parent | `internal_error`; redirected target retained byte-equal | Pass |
| Application failure/cancel result | Same prior Project object retained; replacement only on success variant | Pass |
| Public failure projection | No source path or raw error content | Pass |

## Commands and results

- `sha256sum -c CHECKSUMS.sha256` in attached build kit: all 77 listed files OK.
- `npm ci --ignore-scripts`: dependencies installed for source verification; no app installed.
- `node scripts/verify-project-import.cjs`: pass.
- `node --experimental-strip-types scripts/verify-project-open.mjs`: pass; Node emits a non-failing typeless-package warning.
- `npm test`: pass; build plus existing source/timing/file-operation checks and both G01A behavioural checks.
- `npm run verify:source`: pass.
- `node --check electron/project-import.cjs electron/main.cjs electron/preload.cjs` (run individually): pass.
- `npm audit --omit=dev`: zero known production vulnerabilities.
- full `npm audit`: nine high-severity advisories remain in pre-existing development-tool dependencies.
- `git diff --check`: pass after review fixes.

## Dependency/security decision

`adm-zip@0.5.16` was affected by `GHSA-xcpc-8h2w-3j85`. It is now pinned to patched `0.6.0` and is not used for hostile import. Import uses MIT-licensed `yauzl@3.4.0` plus `pend@1.2.0`, lazily scanning and streaming through the one owned boundary. Exact integrity hashes are locked; notices were updated.

## Fixed-point review

### Spec axis

G01A satisfies the user-authorized split: archive authority and rollback are implemented without inventing the G01B schema or a legacy renderer. Experimental v1, wrong-product, future-version, hostile, cancelled, and invalid inputs cannot reach current-state replacement. Binding backgrounds/source-fidelity requirements and both annotated Manali/Jenai walkthrough PDFs are retained in `PRODUCT_SPEC.md`.

No Spec blocking finding remained. Successful clean Project import/save/reopen is correctly deferred to G01B, so original unsplit G01 and G02 are not claimed complete.

### Standards axis

Two findings were verified against `2762043...HEAD` and fixed:

1. Aggregate compression ratio was initially checked after every prefix, which could reject a safe archive whose compressed manifest precedes largely stored media. It is now checked after the complete structural scan; individual ratios remain bounded. A mixed-compression regression fixture was added.
2. Abandoned-stage cleanup could remove another Gallery process's live import. Each stage now has a restrictive owner marker; cleanup skips a running owner and tests both live and abandoned cases.

Markdown whitespace and dependency-notice/lockfile churn were also reconciled. Focused and full gates passed after fixes.

## Unrun checks and residual risks

- No Electron dialog/UI capture: current environment has no interactive desktop journey. `Cancel open` is source-built and its application/result seams are tested, but no screenshot is claimed.
- No package build, install, signing, notarization, release, merge, or publication.
- G01B manifest/media/hash/Scene/Timeline/audio validation and successful state commit do not exist yet.
- Existing path-encoded media grants, broad media protocol, IPC sender/origin/generation validation, and decoded cache budgets remain outside G01A and unsafe/unproved.
- Packaged Electron, exact Garuda, and Apple-Silicon behaviour remain unproved.
- Human visual/accessibility acceptance and final annotated Manali/Jenai walkthrough PDFs remain pending.

Newly unblocked: G01B only. G02 remains blocked until G01B completes the clean Project boundary.
