# Changelog

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
