# Native studio update — implementation checkpoint

This is an engineering branch, not a release or a completed visual redesign.
The baseline is Galileo 2.3.0, source `a1b9010cbcd94d10e6951a2984a2328ce585560e`.
Do not promote it merely because a build succeeds.

## Implemented first slice

- Atomic identity-based list ordering with exhaustive production-core tests, block-wise
  keyboard movement, stale/foreign drag-ticket rejection and captured source/order epochs.
- Existing media list retains native selection and movement. Row hit regions, explicit
  filtered-state instructions, disabled filtered movement and contextual alternatives
  are connected; actual mouse/trackpad acceptance is still required.
- Opening, Spotlight and Closing roles can be displayed independently.
- A resource-free, dependency-free SwiftUI/AppKit component pilot owns palette, button,
  field, choice and native-slider paint. It does not own document or renderer state.
- Existing Galileo panels and inspector modes remain in place. Initial controls and
  opaque surfaces use the pilot. Source, crop, export and media decoding remain unchanged.
- No schema or application-version change. Older projects retain baseline behaviour.

## Validation boundaries

Linux core and palette tests are executable checks, not Mac UI proof. The native workflow
also compiles/tests the components and developer specimen, then uses the existing packaged
app journey. The specimen is not included in the distributed application.

Mouse/trackpad drag, VoiceOver, focus and menu behaviour, minimum macOS, physical M2/M1 Pro,
full application styling and human visual acceptance remain open. Do not claim them from
screenshots or successful compilation. Last-frame selection, protected schema-upgrade
copies and the associated media/cache/ownership work are not implemented in this slice.

## Sharing with Drift

The provisional source is `native/Packages/PitchdogStudioUI`. A second-consumer development
pilot may use an explicit local package override to these exact files; it must not keep a
permanent duplicate or silently enable itself in a release build. The package owns no
app settings, codecs, assets, source timing, undo, sound or export. Canonical extraction,
repository publication, version pinning and both independent release gates remain open.

The reviewed v2 implementation plan remains the governing scope. Continue independent safe
work; do not bypass missing visual/hardware acceptance or replace the established panels.

## 8 September continuation: native drag lifecycle

The failed baseline run `34148662827` at `ac70858e11743ac40bbd7911e4010af2aa8e2527`
reached the real pointer assertion but did not reorder. Its recording and raw artifact
ZIP were preserved locally and the ZIP digest checked against GitHub. Source inspection
confirmed that the SwiftUI List callback bypassed the existing drag-start tickets.

The media rail now uses an app-owned NSTableView adapter with the existing SwiftUI
MediaRow presentation. Native pasteboard writers carry opaque session tickets; drop
validation checks the originating table and current ticket before the existing atomic
transaction. Native selection, insertion feedback, drag cancellation, context commands
and append-only Finder imports remain local to Galileo. No shared package owns ordering.
The external journey retains the mouse assertion and now also requires a drag-start
ticket to be consumed. Bounded diagnostic event names are recorded only during that proof.

This is implemented and awaiting actual input acceptance. Local macOS 27 beta / Swift
6.4 Command Line Tools cannot run XCTest and its default SDK lacks a SwiftUI macro
plugin. The installed macOS 15.4 SDK with SwiftPM's native backend builds the app.
Local diagnostic pointer attempts have not passed; native hosted CI must establish
drop, undo and the remaining journey. This is not a release candidate or a gesture PASS.

### Native typography continuation — 2026-09-08

Owner requests richer blacks and the pitch.dog type system in both native apps. Preserve both consumers' existing v13.0.0 pin `786b4a2b671182319320f922b8de8f927ea3a002`; its metadata remains production-candidate, so this is not an upstream version promotion. `native/Resources/StudioFonts/SOURCE.json` records the exact native handoff binaries, hashes and canonical UI roles. The application owns three font resources and their lifecycle. The resource-free package projects all fourteen semantic roles into native fonts. Exact-file Core Text construction avoids the documented v13 Eyebrow installed-name collision. Fonts are resolved once, not per row or frame. SF Symbols retain native icon geometry; artwork/rendering fonts are unchanged.

Native role sizes use the canonical minimum rem bound at 16 points per rem; compact pointer controls are at least 40 points. No hover/selection weight changes. Role values were compared against canonical tokens, generated role contracts and the component map. Local SDK15.4 builds pass; a standalone Core Text proof verifies all 14 actual variable instances, approved weights/widths and representative Latin/numeric glyph mapping. Actual window glyph/geometry, language expansion and accessibility acceptance remain open. Raw proofs are preserved in the shared project's existing `artifacts/galileo-drift-2026-09-08` location.
