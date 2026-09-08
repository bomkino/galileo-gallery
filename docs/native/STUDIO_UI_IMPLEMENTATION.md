# Native Studio implementation — 8 September 2026

Galileo 2.4.0 prerelease preparation is in progress. The native implementation passes
the engineering checks below; stable acceptance and installed-app status are separate.

## Implemented

- The NSTableView media rail carries opaque drag tickets into Galileo's existing atomic
  document transaction. Native selection, insertion, Finder import and context actions
  remain app-owned. Search disables ordering; clearing it releases text focus.
- Video / Animation / Still, remembered First / Middle / Last (Last on first use),
  independent Custom anchors, exact source intervals, source auditions and one-edit
  trim/replacement adjustment. Source tickets reject stale success and failure across
  edit/undo/load/close. No source image is substituted for a failed export.
- Schema 8 retains migration-only legacy frozen intent. Older native documents open as
  protected untitled upgrade copies. Original identity follows aliases and renames;
  draft autosave/restoration, Save As and failed saves preserve the original package.
- Immutable still metadata and bitmaps share bounded work: one metadata and two bitmap
  workers. Cancellation detaches one subscriber; the last subscriber stops cooperative
  work. Interactive leases allow 30 seconds; exports allow 120 seconds, with at most
  one million inspected samples. A codec call cannot be forcibly interrupted.
- Richer dark surfaces, canonical pitch.dog typography, native menu triggers, fields,
  buttons, selectors and sliders cover the existing inspector and editing/export sheets.
  Fields and selectors use 32-point rows; primary actions retain 40 points. Canvas size
  drafts commit complete validated values without warning on intermediate digits.

## Verified candidate

Galileo source `179001672f2fc33a5de79105a8c2e005864d3b8e` passed
[native run 34180495786](https://github.com/bomkino/galileo-gallery/actions/runs/34180495786)
and [PR integration 34180498215](https://github.com/bomkino/galileo-gallery/actions/runs/34180498215).
The actual app exercised pointer reorder, single keyboard Undo/Redo, menu Undo,
filtering, canvas drafts, Last on first use, remembered First/Middle and Custom Apply.
Native source, shared cache and cancellation contracts and protected upgrade-copy
application smoke passed. Final active light/dark windows and Custom sheet were inspected.

Artifact `10038856587` retains the application, source identity, signed-build receipt,
journey results and captures. Its ZIP SHA-256 is
`f4a5b54c112ccbc47f6f5bf7a30babf3bf8f6a7c7bbb73a996499d22759dac6a`.
Strict deep codesign verification passed. The application is ad-hoc signed and not
notarized. These receipts cover this exact candidate; dependency, merge and release
changes need their own current checks.

Drift source `bf9c704b6ce290a9007db3561e2934f9e1988c16` separately passed its
[native pilot](https://github.com/bomkino/pitchdog-drift/actions/runs/34180243663)
and [general CI](https://github.com/bomkino/pitchdog-drift/actions/runs/34180246781).
That pilot used the shared controls through Look, Motion, Slide and Export and retained
its distribution guard. Drift's own receipt records its application and audio evidence.

## Shared package and release boundary

The canonical source is [pitchdog-studio-ui](https://github.com/bomkino/pitchdog-studio-ui),
published as v0.1.0 prerelease at revision `8f296630180ea4dbc77fe65a9c86e88a5b9bb9c0`.
Galileo now resolves that exact remote revision; the former embedded copy is removed. The package is resource-free and Apple-framework-only, Swift tools 5.10 /
Swift 5, with macOS 13.3 minimum. Galileo itself requires macOS 14. Both apps retain
app-owned font files at type-system revision `786b4a2b671182319320f922b8de8f927ea3a002`.
Package source contains no application state; sibling paths and copied forks must not
become shipping dependencies.

Representative media edge cases, physical trackpad, VoiceOver and keyboard-only review,
minimum-OS execution, hardware/performance acceptance, offline packaged launch and
pitch.dog visual review remain open stable-acceptance gates. Hosted CI supplies current
full builds and automated input checks; the local macOS 27 beta / Swift 6.4 CLT lacks
XCTest. Passing fixtures do not close those human and hardware gates.
