# Contributing

The active product is a native Apple-silicon Mac app. Keep changes focused on a demonstrated user need or defect. Preserve project data, source media, authored intent, credits and a reversible migration path.

## Development

On an Apple-silicon Mac with Xcode command-line tools:

```sh
swift test --package-path native
bash scripts/native/package.sh release-native
open "release-native/Galileo Gallery.app"
```

Use a new output folder for each package build. No npm or FFmpeg installation is needed for the native app. The old web/Electron source is retained for reference, not as a second shipping product.

## Changes and proof

Trace a failing behaviour to the narrowest useful boundary. Keep a regression test for a real failure; do not add counts, hashes or screenshots as substitutes for the actual claimed behaviour. Run the packaged application when changing document lifecycle, UI or export. Check decoded output for video changes. Use synthetic or explicitly approved media, never client projects in public CI artifacts.

Document the exact tested commit and Mac. State what remains untested. Do not hide failures, relax an assertion to obtain green CI without a demonstrated test defect, or claim native production readiness from a successful compiler run.

A scene must preserve source readability, coherent depth, deliberate holds and continuity. Centre spotlights and source-video playback are independent. Interface appearance must not grade the artwork. Keep the UI quiet while retaining labels, units, keyboard access and actionable errors.

New features should work through save/reopen and undo/redo before release. Release assets must match the source, version and checksums. Never force-push a published tag or erase historical evidence to make status look cleaner.

Contributions remain licensed under GPL-3.0-or-later. [Engineering boundary](docs/native/ENGINEERING.md).
