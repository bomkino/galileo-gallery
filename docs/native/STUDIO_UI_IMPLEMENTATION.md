# Native studio implementation — 8 September 2026

Engineering candidate on the existing native studio branch. Neither app is released,
installed, or accepted merely because this implementation builds.

## Implemented

- Galileo's real NSTableView rail now carries opaque drag tickets into its existing
  atomic document transaction. Native selection, insertion, Finder import and context
  actions remain app-owned. Search disables ordering; clearing it releases text focus.
- Video / Animation / Still, remembered First / Middle / Last (Last on first use),
  independent Custom anchors, exact source intervals, source auditions and one-edit
  trim/replacement adjustment. Source tickets reject stale success and failure across
  edit/undo/load/close. No source image is substituted for a failed export.
- Schema 8 retains migration-only legacy frozen intent. Older native documents open as
  protected untitled upgrade copies. Original identity follows aliases and renames;
  draft autosave/restoration, Save As and failed saves preserve the original package.
- Immutable still metadata and bitmaps share bounded work (one metadata, two bitmap
  workers). Cancellation detaches one subscriber; the last subscriber stops cooperative
  work. Interactive leases allow 30 seconds; exports allow 120 seconds, with at most
  one million inspected samples. A codec call cannot be forcibly interrupted.
- Richer dark surfaces, canonical pitch.dog typography, native menu triggers, fields,
  buttons, selectors and sliders cover the existing inspector and editing/export sheets.
  Fields and selectors use 32-point rows; primary actions retain 40 points. Canvas size
  drafts commit complete validated values without warning on intermediate digits.

## Evidence boundary

Galileo b13212a passed hosted native runs 34177466640 and 34177469096: real mouse drag,
keyboard/menu Undo/Redo, search, canvas size, numeric entry, Media tab and active light
and dark captures. Protected upgrade-copy application smoke also passed. Those results
precede the source-frame integration and do not certify its later source.

The a78f0ab candidate exposed missing compressed-sample durations, an empty replacement
warning and an offscreen UI target. 6dccdc1 fixes these using native sample-table timing,
nonempty notices and actual inspector scrolling. Current candidate checks additionally
exercise Still, Undo/Redo, remembered choices and Custom Apply, plus shared cancellation.
Read the exact-head CI and artifacts before promoting; historical passes are not reused.

Drift's earlier 31d9c816 guarded pilot passed run 34176272771. Its next candidate expands
shared controls through Look, Motion, Slide and Export without changing bindings,
catalog exclusions, audio, document journals, rendering or media policy.

## Package and promotion

The current canonical development source is native/Packages/PitchdogStudioUI. It is
resource-free, Apple-framework-only, Swift tools 5.10 / Swift 5, with macOS 13.3 minimum.
Both apps own their exact font files at the retained type-system revision
786b4a2b671182319320f922b8de8f927ea3a002. Package source contains no application state.

Dedicated canonical repository publication and remote dependency resolution remain a
separate gate. Preserve the explicit Drift pilot override and distribution guards until
publication and both exact pins are proved. Do not ship sibling paths or copied forks.

Physical trackpad, VoiceOver, minimum-OS execution, hardware/performance acceptance,
offline packaged launch and pitch.dog visual review remain required acceptance gates.
Local macOS 27 beta / Swift 6.4 CLT lacks XCTest; earlier SDK15.4 builds passed, while
hosted CI owns current full builds and actual input checks. No stable-release claim.
