# Changelog

## 3.3.0 — 5 October 2026 (Galileo 2)

**New backgrounds from Backdrop 2.0, and backgrounds that loop seamlessly everywhere.**

- Six new backgrounds on the Colour page: **Caustics** (sunlight through moving water), **Iridescence** (a pearl sheen on a folding sheet), and the gradients **Solid**, **Linear**, **Radial** and **Conic**.
- The Frost, Rays and Dot Grid backgrounds no longer jump where the loop joins.
- Looks saved in Backdrop 2.0 keep their film finish and loop length in the library; Galileo still applies the scene's own finish.
- Comes with Backdrop 2.0.0, which now lives at [bomkino/backdrop](https://github.com/bomkino/backdrop).

## 3.2.0 — 5 October 2026 (Galileo 2)

**A contact sheet that rolls into a turning ring, and new finishes from pitch.dog's HoloCloth research.**

- **Unroll**, a new style of Contact: the works' contact sheet slides into one strip, curls into a ring that turns once and shows its far side, then unrolls and folds back into the sheet. A drum in a wide frame, a reel-like wheel in a tall one. Ripple sets the lines off one after another.
- **Satin**, a new surface on the Finish page: a woven sheen that gathers in folds and curls, with shade in their valleys, kept light on flat cards and off dark artwork.
- **Foil** is now a thin film: its colour comes from light interfering in the film, shifts as the card tilts, and shows only on the light parts of a work, so dark passages stay deep.
- Detail on tilted cards stays sharper: textures are filtered along the slant.
- Fixed: floor reflections in Orbit and Corridor showed the backs of the cards; they now show a faint mirror image of the work.
- The background now follows only the work facing you: a card turned away, such as the far side of a ring, no longer tints the room.

## 3.1.0 — 5 October 2026 (Galileo 2)

**Richer scenes from pitch.dog's carousel research, a room that takes on the colour of the work, and scrubbing that keeps up with you.**

- New scenes: **Rail** (one work at a time, flat at the centre, its neighbours tilting away) and **Focus** (a strip that zooms in on one work at a time and back out) join One at a time; **Vortex** (one work holds the centre while rings of the others orbit around it) and **Loom** (works weave together from threads and come apart at the top) join In motion.
- New styles: Flow as **Calm** or **Cascade** (each work arrives turned away and peels flat); Wall as **Tilted** or **Lanes** (three lanes rising at different speeds on slow waves); Contact as **Marks** or **Assemble** (the works fly in from depth and settle into a contact sheet).
- **Follow work**, on the Colour page, leans the background's colours towards the work in the middle of the frame as it changes. It is on by default where one work leads, as in Vitrine, Rail, Focus and Vortex.
- Scroll with two fingers over the stage to move through the loop the way the work flows, with the trackpad's own momentum; playback carries on when you let go. The playhead holds on the moments the cards land as you scrub past them (Option scrubs freely), and Command-[ and Command-] jump between them.

## 3.0.0 — 5 October 2026 (Galileo 2)

**Galileo 2: a ground-up native rebuild, made for 9:16 first.** Drop artwork, photographs or clips and they open as a moving gallery, previewed exactly as it exports.

- Every scene lays itself out for 1080 × 1920, and the work flows up the screen. 4:5, 1:1 and 16:9 are one click away in the toolbar; Cinema and 4K are in the menu.
- Fourteen scenes in four sections. One at a time: Vitrine, Hang, Compare. Walk-through: Corridor, Shelf, Wall. In motion: Flow, Orbit, Opening. On the table: Scatter, Hand, Deck, Story, Contact.
- Scenes sit beside the stage at the shape you are making. Rest the pointer on one to watch it on the stage; click to use it; the arrow keys step through.
- Loop lengths in one click (10, 15, 30 or 60 s), titles in four macOS faces, recorded foley that follows the motion, a backdrop palette drawn from your own work, and film finishes.
- Exports MP4, HEVC, ProRes, ProRes 4444 with transparency, PNG frames or a still, for one shape or several at once.
- Native SwiftUI and Metal on Apple silicon, macOS 14 or later. Opens on sample works, already playing. Comes with Backdrop 1.0.0, the background studio whose library Galileo reads.

The version continues from Galileo Gallery 2.4.0. This release replaces the Galileo Gallery code on `main`; it is kept at the tag `v1-final`. Galileo 2 uses its own bundle identifier and `.galileo` documents, so Galileo Gallery can stay installed beside it.

## 2.4.0 — prerelease, 8 September 2026

- Native media-rail drag and undo; remembered First/Middle/Last/Custom Still choices.
- Exact source selection, bounded shared decoding and protected schema-8 upgrade copies.
- Shared native Studio controls, richer dark surfaces and retained pitch.dog typography.
- Canonical UI package pinned by immutable revision. Physical-device, accessibility and broader acceptance remain open. See [release notes](docs/releases/v2.4.0.md).

## 2.3.0 — 6 September 2026

- Still/animated WebP validation; local SDR VP8/VP9 WebM preparation with original retention, alpha and variable frame timing.
- Source-clip filmstrip/audition, trims/loop/freeze, live appearance editing, stable time/selection, honest crop locks and in-context background audition.
- Corrected opening/reverse, repeat closing, short Reel/Wave continuity, manifest write/read bounds, PDF recovery and stale import ownership.
- Reused sequential source frames and indexed animation timing; GPU crop/mask/fragment work, resolution-aware resources and bounded readers/caches.
- Packaged transparent-WebM/animated-WebP save/reopen/spotlight/export checks; corresponding codec source and a normal-quit, rollback-preserving installer. Silent Mac-only product. See [release notes](docs/releases/v2.3.0.md).

## 2.2.0

- Native import of Drift's background atlas and palettes, with independent controls, saved state and deterministic preview/export rendering.
- Background browser, migration from schema 5, precompiled Metal kernels and retained Drift provenance.

## 2.1.0 — 5 September 2026

Native reliability, directing and performance update. Recovery copies and common media budgets; preserved replacement timing; repaired orbit/Vitrine/page/Build motion; clipped hit testing; spotlight navigation/closing; visual framing; mixed selection; wrapped captions; PDF pages; preset favourites/library; range exports and serial queue. Early-resolution preparation, shared bounded caches, direct encoder-buffer composition and independent APFS media clones. Sound is deliberately outside the product. See [release notes](docs/releases/v2.1.0.md).

Dates use UTC. Version 2 is the native Apple-silicon Mac product. Older entries below describe the historical Electron application, not the current implementation.

## [2.0.0] — 2026-09-05

- Native AppKit/SwiftUI document studio with Core Image/Metal composition and AVFoundation output.
- Per-slide centre spotlights with individual holds and sizes, looping source videos, and return to the sequence.
- Document change tracking, grouped undo/redo, native save/autosave, failed-save protection and separate-copy legacy import.
- Preview requests coalesce instead of cancelling every in-flight frame; export totals include spotlight time.
- Quiet continuous-looking sliders retain stepped values and precise numeric input without hundreds of tick marks.
- Mac-only DMG/ZIP release, checksum and synthetic validation evidence. Active docs and help now describe the native product.
- Movies are silent. No WebM or native audio export; legacy choreography is reauthored rather than pixel-identical. Ad-hoc signing, not notarization. See [release notes](docs/releases/v2.0.0.md) for limits and installation.

## [1.1.1] — 2026-09-02

### Added

- Persistent Light and Dark interface modes with system-preference bootstrap and an accessible Phosphor theme control in the studio and Scene catalogue.
- Theme-specific select carets, metadata colours, executable first-paint scenarios, stored-state/storage-event convergence, and exact state/computed-paint isolation proof with strict temporal stability and a 0.01%-pixel cross-theme compositor ceiling across all 29 catalogue Scenes.

### Fixed

- Removed the titlebar collision between autosave status and Interface Scale.
- Rebalanced wrapped header actions at high Interface Scale so Export receives a full, deliberate row.
- Reduced short-height empty-state clipping without shrinking interactive targets.
- Replaced cramped native select arrows with explicit, consistently inset Phosphor-derived carets.
- Closed dark-mode gaps across cards, menus, forms, tooltips, disabled/selected states, scrollbars, launch UI, errors, responsive stacks, and touch layouts.

### Changed

- Rebuilt Project as a controlled popover with outside-click dismissal, Escape focus restoration, caret rotation, and bidirectional motion that never shifts the application grid.
- Added a restrained inspector-panel reveal and complete reduced-motion fallbacks.
- Strengthened G08 with dual-theme text and focus-indicator contrast, persistence, sibling-overlap, disclosure stability, stacked-header, clipping, reachability, exact computed-paint isolation, material-paint masks, and bounded raw-raster assertions from 75% through 200% Interface Scale.

## [1.1.0] — 2026-08-31

### Added

- Local pitch.dog font assets and explicit typography roles.
- Shared Phosphor icon boundary for product controls.
- 4 px spacing scale and control-size tokens.
- Design-system source verification and G08 runtime typography/icon checks.
- Automated exact-version cross-platform release workflow.
- Active documentation map and design-system guide.

### Changed

- Normalised padding, gaps, control heights, and responsive spacing across the studio and Scene browser.
- Replaced hand-authored UI SVGs and text-only Interface Scale glyphs with Phosphor icons.
- Clarified active documentation versus historical programme evidence.

## [1.0.1] — 2026-08-30

- Released the independently rebuilt 29-Scene catalogue.
- Preserved Quiet Carousel compatibility and the hardened Vitrine v2 Project boundary.
- Published macOS Apple silicon, Windows x64, and Linux x64 packages with checksums.

## [1.0.0] — 2026-08-30

- First public Galileo Gallery desktop release.
