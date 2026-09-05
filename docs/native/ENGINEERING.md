# Native implementation and validation

## Product boundary

The shipping product is `native/`: Apple silicon, macOS 14+. `native/VERSION` is authoritative. Historical npm/Electron code and platform adapters are references, not active products or build dependencies. Sound is deliberately outside the product; do not add soundtrack/source-audio interfaces or audio output tracks. Preserve imported originals rather than stripping their audio streams destructively.

`GalileoCore` owns versioned document state, frame scheduling, scene geometry, source time, spotlight and closing cues, common media budgets and frame ranges. `GalileoNative` owns media copies, integrity, PDF intake, immutable render snapshots, Core Image composition and AVFoundation picture export. `GalileoGallery` owns AppKit documents, SwiftUI controls, selection, transport and audition.

Schema 5 reads schemas 3/4 through explicit in-memory migration. Legacy ZIP projects become separate native copies. Migration notes distinguish preserved and translated intent; old manifests are traceability, not proof of equivalent choreography.

## Project and output safety

Editor transactions update immutable save snapshots and native change counts. The private content undo manager does not also use NSDocument's automatic undo notification counting. Edits, grouped changes, undo and redo are counted once. Successful native save/autosave clears only its save boundary. The packaged-app journey checks undo back to saved content, a failed save, autosave and reopen.

`MediaBudget` is shared by import adoption, saving and opening: 512 MiB per file, 4 GiB unique managed media; original PDFs and preserved visual assets count. The per-file and aggregate checks happen before accepting a batch. Recovery requires a valid manifest; unresolved source rows retain their identity and settings. Export rejects unresolved included sources. Source paths, checksums, package entries and ZIP boundaries remain validated.

Owned media uses independent APFS copy-on-write clones where available, otherwise copies. Never hard-link saved documents to editable originals. Workspace-scoped integrity caches are valid only for an identical, freshly read device/inode/size/mtime/ctime stamp. Fallback copies are rehashed; changed sources prevent publication. A save checks space conservatively even on clone-capable volumes.

Exports retain a project snapshot and a source-frame interval. Output timestamps start at zero; source timing stays on the document clock. Movie/sequence work is capped at 216,000 frames; canvas/layer limits remain explicit. The queue is serial, accepts at most four waiting jobs and rejects duplicate destinations. Cancellation before commit preserves the prior file; publication checks fresh destination identity. No automatic poster sidecar is created.

## Rendering and performance

Preview scales geometry, image decoding, artwork preparation, captions and shadows to the requested viewport resolution before composition. At 100% it requests output-resolution pixels. One render runs per preview worker; only the newest pending frame is retained. Revision tokens discard stale output. Selection uses the geometry of the displayed frame and clips wipes/slices before hit testing.

A process-shared, thread-safe CIContext and immutable-image caches avoid duplicating those resources for each window. Decoded/prepared image eviction targets are 128/64 MiB, with count limits and memory-pressure clearing. These are NSCache targets, not hard total-memory guarantees. Mutable video generators remain worker-local and bounded. A frame's temporary objects are drained within an autorelease pool. Off-canvas layers are culled before bitmap preparation.

Movies render the composition directly into the encoder pixel buffer; they no longer allocate a full-frame CGImage followed by another CGContext copy. Exact-time source seeking remains AVAssetImageGenerator-based. A sequential decoder was not introduced without a separate media-format/lifecycle comparison. This is a remaining profiling opportunity, not a claim of full-rate playback for arbitrary multi-video projects.

The release's tests log a reproducible 4K-canvas/640-pixel-preview sample, elapsed time, largest prepared layer and backend. CI uses a hosted/paravirtual Apple-silicon GPU: those numbers are not measurements of an 8 GB M2 Mac mini or M1 Pro MacBook Pro, and do not certify a universal speedup. Real-device sustained memory, scrubbing and export measurements remain useful.

## Checks tied to actual risks

`swift test --package-path native` covers common timing/geometry and Mac filesystem/media/output contracts. The 2.1 regressions cover the thirteenth orbit image, Orrery source identity, Vitrine departure, paged loop handoffs, assembled Build spotlights, clipped hit testing, replacement trims, managed-media budgets, recovery/relink, independent saved copies, PDF pages/original preservation, output ranges, serial jobs and transparent ProRes output.

The independently encoded three-second video still must loop in an eight-second centre hold, survive save/reopen and agree with independently decoded export pixels. Its explicit Rec.709 fixture tags and original pixel thresholds are retained.

The packaged application's `--smoke <empty-directory>` opens a real native window and exercises import, edits, undo/redo, successful and failed saving, autosave, close/reopen, painted playback, cue navigation, native-pixel zoom and export. It captures populated light/dark/spotlight, mixed-selection and framing surfaces and renders synthetic samples of every variant. Screenshots support visual review; they are not export proof. Movie decoding is separate.

The release job identifies its exact source SHA and machine, runs those checks, verifies the mounted DMG's signature/architecture/binary identity and publishes matching assets and checksums. It does not publish from a failing run. The validation ZIP is synthetic and contains no client media.

## Deliberate limits

No sound, browser product, non-Mac build, Intel build, cloud account or automatic updater. No WebM or HDR mastering guarantee. Current composition prepares 8-bit sRGB artwork before Rec.709 output conversion. Native choreography is not legacy pixel parity. PDF pages are raster images with preserved originals, not editable text or vectors.

Distribution is ad-hoc signed, not notarized. CI is not comprehensive human VoiceOver acceptance, long-session testing or all hardware/display coverage. Keep rollback copies of projects. Read the current release notes rather than treating historical atelier/programme reports as shipping claims.
