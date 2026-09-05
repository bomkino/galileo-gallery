# Native implementation boundary

The shipping product is `native/`, an Apple-silicon macOS 14+ application. `native/VERSION` is the release version. The npm application and historical platform adapters are retained only as reference source.

## Responsibilities

- **GalileoCore:** versioned document data, input validation, integer/fractional frame schedule, scene geometry and centre-spotlight timing.
- **GalileoNative:** owned media, immutable render snapshots, Core Image/Metal composition, source-video seeking, native export and checked destination replacement.
- **GalileoGallery:** AppKit document lifecycle, SwiftUI editing surfaces, selection, native menus, frame transport, scene audition and export UI.

The document's editor transactions update an immutable save snapshot and native change counts. The private edit undo manager is not also installed into NSDocument's automatic notification bookkeeping: each edit, undo and redo must be counted once, not twice. Successful native save/autosave owns clearing the corresponding save boundary. The actual packaged-app journey checks the integration, including grouped undo to saved content and a failed save.

Preview allows one in-flight render and one newest pending frame. New playback ticks do not continually cancel rendering. A revision token rejects output from an obsolete document revision; hit testing uses the geometry of the image actually displayed. Export does not depend on preview scheduling.

The export dialog obtains its count from the complete RenderPlan, including spotlight additions. Changing export frame rate retains the selected still's time, rather than reinterpreting the old frame index at the new rate.

## Meaningful checks

`swift test --package-path native` covers core timing and native media/output contracts. In particular, a separately encoded three-second video must loop during an eight-second spotlight, survive project save/reopen, and agree between native preview pixels and independently decoded output. The synthetic video's RGB buffers and encoder are explicitly tagged Rec.709; the pixel thresholds were not relaxed to hide an untagged-fixture discrepancy.

The bundled application's `--smoke <empty-directory>` path opens an actual document window and runs import, edit, undo/redo, save, failing save, autosave, close/reopen, painted playback, frame inspection and native movie export. It writes synthetic scene samples, window captures and a machine-readable receipt. This is integration evidence, not human acceptance or exhaustive accessibility testing.

The release job records its exact source SHA and machine, builds on arm64 macOS, exercises that app, then verifies the DMG-mounted app signature, architecture and binary identity. Matching ZIP/DMG/checksum files are published together. Passing unit tests alone do not publish a release.

## Known limitations

- No audio playback/export in the native product, including source-video audio and preserved legacy soundtrack data.
- Native scene motion is reauthored. Legacy IDs and manifests are preserved, not pixel-identical choreography.
- No WebM export, HDR mastering guarantee, native Intel build or non-Mac product.
- Ad-hoc signing only; no Developer ID identity or notarization is claimed.
- Low-memory sustained playback, sleep/wake, multiple external displays, prolonged editing and comprehensive VoiceOver/navigation acceptance still need real-device evaluation. CI does not substitute for those observations.
- No automatic updating of installed applications. Install a downloaded release to update.

## Documentation and rollback

README, INSTALL and this directory are current. Other programme/design-system/atelier reports are historical evidence unless explicitly linked as current. Preserve history, notices and old releases. Use the previous app with an untouched legacy project to roll back; do not overwrite a legacy project during native migration.
