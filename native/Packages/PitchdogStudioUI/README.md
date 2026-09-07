# PitchdogStudioUI — provisional native component pilot

Resource-free SwiftUI/AppKit chrome. The canonical development copy is this directory;
Drift's explicit development override consumes these same sources. It is not yet a
published shared package or a release-qualified visual redesign.

`swift test --package-path native/Packages/PitchdogStudioUI` checks pure palette contracts.
On a Mac, `swift run --package-path native/Packages/PitchdogStudioUI StudioUISpecimen`
opens a developer-only control specimen. Neither command installs or replaces an app.

The host supplies appearance, resolved accent, contrast, motion and active-window state.
There are no preferences, documents, sessions, source clocks, codecs, media caches,
resource bundles, plugins, fonts, renderer dependencies or network operations here.

Fields retain app-owned parsing, captured targets, focus and undo. The slider retains
NSSlider's native control/accessibility surface and captures its callbacks for a gesture.
Ordinary choices use genuine Buttons or a Menu containing a Picker.

## Provenance and acceptance

New code written for pitch.dog in this implementation. No Luminare, CodeEdit, IINA or
external skill code is copied. The pilot remains under Galileo's repository license;
canonical extraction and any license change require explicit review. It does not
relicense either application's existing controllers.

Prototype tokens are not human-approved. Palette tests are not visual, keyboard,
VoiceOver, packaged-app, minimum-OS or physical-device acceptance. The specimen is
not bundled with Galileo or Drift. Public package publication remains a separate gate.
