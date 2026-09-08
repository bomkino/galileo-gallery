# Native implementation and validation

## Ownership

The application source is `native/`: Apple silicon, macOS 14+. `native/VERSION` identifies the source version; the matching GitHub release identifies a published build. GalileoCore owns versioned state, validated schedules, geometry, source time and media budgets. GalileoNative owns media, immutable render snapshots, compatibility preparation, Core Image composition and AVFoundation picture export. GalileoGallery owns NSDocument, SwiftUI controls, transport and temporary audition.

The native Studio candidate writes schema 8 and opens older native schemas as protected untitled upgrade copies. Saving requires a new destination; the original package remains intact. See [Studio implementation and acceptance](STUDIO_UI_IMPLEMENTATION.md) for current proof and open gates. Legacy ZIPs become separate documents with conversion notes. Source audio is preserved only inside original files; sound controls, decoding and output are deliberately absent. Historical Electron/React code is reference, not a second runtime or product.

## Project and transaction boundaries

Import adoption, save and reopen share the same budgets: originals 512 MiB/file and 4 GiB unique; derived working files 4 GiB/file and 16 GiB aggregate. Both writing and reading enforce the actual 8 MiB encoded-manifest limit, including UTF-8/escaping overhead. Invalid or oversized content is rejected before a destination is replaced.

Editor transactions and the document change count are coordinated; native undo notification counting is not duplicated. One gesture stores its before-state once. Async imports and file-provider drops carry generation/ownership checks, preserve order, and report per-file failures. Closing/replacing a document cancels adoption rather than moving a late result into another state.

Originals are independently copied, using APFS copy-on-write clones where available, never hard-linked to user files. Integrity caches require a freshly read identical device/inode/size/mtime/ctime stamp. Recovery distinguishes a missing archived original from a missing working picture: an intact PDF page remains usable. Malformed/unsafe documents are not opened as permissive recovery. Unresolved included pictures cannot silently export.

Queued exports keep immutable snapshots and media ownership after the document window closes. The serial queue has at most four waiting jobs. Output ranges use document time but movie timestamps start at zero. Completed movies are decoded for timing/frame-count checks before destination publication; fresh destination identity protects concurrent external changes. No automatic poster sidecar.

## Media and performance

`SourceFrames` keeps an AVAssetReader's current and lookahead samples, reuses the image while the requested time is inside that sample's interval, and resets for backward/large seeks. It is worker-owned, not shared mutable reader state. Animated image timing is indexed once and searched by interval. Mutable video readers are bounded to eight / an estimated 256 MiB per worker; animation indexes to sixteen. Those estimates are not a hard total-process memory cap.

A shared CIContext and immutable caches avoid per-window duplicates. NSCache decoded-image / prepared-caption targets are 128/64 MiB, with counts and pressure flushing. Memory-pressure epochs clear worker media readers at the next render boundary. Temporary objects drain per frame. Minimized windows stop scheduling new preview renders and repaint when restored.

Source-image requests account for projected size and crop magnification in resolution tiers. This reduces prepared images, not necessarily a codec's full-source decode allocation. Crop, fill, rounded masks, reveals and fragments now use Core Image transformations rather than a new full-card CPU bitmap per fragment. Captions remain separately prepared and cached. Movie composition continues directly into encoder buffers. The logical output coordinates and original drift-background clock are retained.

The first source-frame interval regression makes fifteen output requests and asserts one prepared image with only current/lookahead decoding; forward/backward requests then check correctness after reuse. The hosted Mac sample logs elapsed time, preparation size and renderer for twelve 4K-canvas/640-preview frames. It is not an M2-mini/M1-Pro benchmark or a universal performance claim.

Heavy media work stays off the interface thread. Some AVAssetReader setup uses deprecated synchronous metadata getters on its worker; an async API migration remains engineering debt, not a hidden main-thread performance claim. Reader budgets, concurrent preparation and cache targets still need representative multi-window/long-session profiling on physical machines.

## Native compatibility tools

`build-codecs.sh` fetches exact FFmpeg/libvpx revisions, enables only local file/pipe protocols and required picture functions, and verifies arm64 plus system-only dynamic dependencies. GPL/nonfree FFmpeg configuration switches are not enabled. Source archives, configuration, licenses, binary hashes and build recipe are supplied with the release. This is a pinned build recipe, not a claim of byte-identical compilation across different toolchains.

The packaged app accepts tools only from its own resources. Source-tree tests may use `native/.codecs`, but a broken app does not fall back to PATH/Homebrew. Process arguments are arrays, not shell strings; time/output/diagnostic caps, disk checks and cancellation apply. WebM originals and ProRes working copies have distinct hashes and a versioned recipe. See [Media](MEDIA.md) for codec/colour boundaries.

## Validation and release

Build dependencies on a developer Mac: compatible Xcode/Metal tools, Python 3, Git, Make and pkg-config. The released application needs none of them. Build the pinned helpers once, then run:

```sh
bash scripts/native/build-codecs.sh
swift test --package-path native
bash scripts/native/package.sh /tmp/galileo-check
GALILEO_MEDIA_FIXTURES="$PWD/native/Tests/GalileoNativeTests/Fixtures" "/tmp/galileo-check/Galileo Gallery.app/Contents/MacOS/GalileoGallery" --smoke /tmp/galileo-journey
```

Use new package/journey directories. Checks cover the concrete timing/recovery/manifest cases, independent WebP animation references, WebM alpha/VFR/persistence, source-frame reuse, shared crop geometry, live editing and cancellation. Fixture generation is maintenance-only; Pillow and an encoder-enabled FFmpeg are not app dependencies. `scripts/native/generate-media-fixtures.py` records the fixture recipe.

The actual packaged journey additionally imports transparent WebM plus animated WebP, authors an eight-second centre hold, saves/reopens the NSDocument, inspects the source sheet, and exports 192 frames after closing the editor window. Independently decoded pictures must match preview within the retained threshold, loop at the expected phase, and contain no audio. The prior 62-frame journey and 72 packaged Drift-background renders remain separate checks.

`release.yml` checks the exact source, tests, package journey, mounted DMG/ZIP contents, embedded helper identity and corresponding source before publishing a matching tag/assets. Validation contains synthetic data only. Temporary integration workflows are removed after promotion; old releases, tests and authorship remain.

## Deliberate limits

No sound, Intel/Linux/Windows/browser product, cloud service, automatic updater, WebM export, AV1/HDR WebM intake or HDR mastering guarantee. UI screenshots are visual evidence, not a substitute for human VoiceOver/long-session/physical-hardware acceptance. Full legacy choreography equivalence is not claimed. Optional A/B comparison and new lens/halation effects are not part of this media-and-correctness release.

The release is ad-hoc signed, not Developer ID signed or notarized. Keep original projects before a schema upgrade. A successful suite does not establish that every possible bug is fixed.

## Drift provenance

Pinned original code, licensing and hashes live in `native/Vendor/DriftBackgrounds`. Regenerate with `python3 scripts/native/generate-drift-backgrounds.py` without contacting upstream. Packaging precompiles Core Image Metal; tests use the same generated source. A shader failure is reported, not replaced by an unrelated flat background. This release does not modify Drift itself.
