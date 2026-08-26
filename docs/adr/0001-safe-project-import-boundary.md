# ADR 0001: stream untrusted project archives through owned staging

Status: accepted for G01A

Date: 26 August 2026

## Context

The v1 importer passed a user-selected archive directly to `adm-zip.extractAllTo()` inside a persistent project directory. It imposed no archive, entry, expansion, or compression-ratio quotas; trusted archive paths; recursively searched for a manifest; and retained extracted files before project validation. `adm-zip@0.5.16` is also affected by [GHSA-xcpc-8h2w-3j85](https://github.com/advisories/GHSA-xcpc-8h2w-3j85), where a crafted ZIP header can cause a roughly 4 GB allocation.

## Decision

`withStagedProjectArchive()` is the single G01A archive boundary.

1. Copy the selected source, with a byte cap and abort signal, into a mode-`0700` unpredictable directory under Gallery-owned staging.
2. Scan the staged ZIP central directory lazily before extraction. Reject unsafe names, path conflicts, special/encrypted/unsupported entries, and declared quota breaches.
3. Reopen and stream each accepted entry into a mode-`0700` contents root. Check the planned central-directory identity again, enforce actual byte counts, use exclusive mode-`0600` file creation, and prove canonical containment after host path resolution.
4. Run the schema consumer while staging remains owned. G01A's consumer only classifies and safely rejects experimental v1, wrong-product, future-version, or invalid manifests. G01B will supply the clean schema/media/hash validator and commit.
5. Remove only the owned import directory in `finally`. A later import removes abandoned directories matching the owned UUID naming contract; unrelated staging entries remain untouched.

Untrusted import uses `yauzl@3.4.0` because it reads entries lazily, streams file data, validates expanded sizes, and has a small MIT-licensed dependency surface. `adm-zip` is upgraded to patched `0.6.0` and retained only for the existing trusted save-writer path. Removing `yauzl` later requires preserving this one interface and its hostile fixture suite.

## Quotas

| Limit | Value |
| --- | ---: |
| Compressed archive | 16 GiB |
| Entries | 4,096 |
| One expanded entry | 8 GiB |
| Total expanded bytes | 32 GiB |
| One-entry compression ratio | 200:1 |
| Aggregate compression ratio | 100:1 |
| Manifest | 2 MiB |
| Portable archive path | 1,024 UTF-8 bytes |
| Path segment | 255 UTF-8 bytes |
| Free-space reserve after staging | 1 GiB |

G01B may lower limits from measured canonical fixtures. Raising them requires a new resource-budget review.

## Consequences

- Hostile or unsupported input cannot reach current Project mutation.
- Source archives and prior projects remain outside staging and untouched.
- Cancellation is cooperative at copy, scan, extraction, entry, and pre-consumer checkpoints.
- G01A intentionally opens no project successfully. Successful validation and commit belong to G01B; this avoids blessing the experimental v1 schema as a migration contract.
- `adm-zip` remains a save-path dependency until a separate writer decision; its hostile-import advisory no longer affects the import path and its installed version is patched.
