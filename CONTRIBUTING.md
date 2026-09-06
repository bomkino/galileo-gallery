# Contributing

The active product is a native Apple-silicon Mac app. Keep changes focused on a demonstrated need or defect. Preserve projects, originals, authored intent, credits and reversible migration.

## Development

On an Apple-silicon Mac with compatible Xcode/Metal tools, Python 3, Git, Make and pkg-config:

```sh
bash scripts/native/build-codecs.sh
swift test --package-path native
bash scripts/native/package.sh /tmp/galileo-build
open "/tmp/galileo-build/Galileo Gallery.app"
```

Use new output folders. The first helper build fetches pinned source and caches its products; the installed application requires no developer tools, Homebrew or network conversion. Historical web/Electron source is reference, not another shipping product.

## Changes and proof

Trace failures to the narrowest useful boundary. Keep regressions for real failures; counts, hashes and screenshots alone do not prove user-visible behaviour. Exercise the packaged app when changing lifecycle, UI or export. Independently decode movie output. Use synthetic or approved fixtures, never client work in public artifacts.

Document the exact commit and Mac. Do not hide a failed run, weaken a correct assertion to get green, or claim performance on hardware that was not measured. Centre holds and source-video playback are independent. Preserve readability and coherent motion; interface appearance must not grade the artwork.

New state must survive save/reopen and undo/redo. A release must include matching version/tag/assets/checksums, updated format boundaries, and corresponding codec source. Do not force-push published tags or erase historical evidence. Sound, other platforms and new rendering engines require a new product decision, not opportunistic expansion.

Contributions remain licensed under GPL-3.0-or-later unless an existing file-specific license governs the modified component. Retain Drift's AGPL notices and upstream decoder licenses. [Engineering](docs/native/ENGINEERING.md) · [Notices](THIRD_PARTY_NOTICES.md).
