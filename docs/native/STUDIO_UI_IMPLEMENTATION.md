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
