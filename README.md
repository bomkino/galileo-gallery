# Galileo Gallery

A native Mac studio for arranging images and looping videos into authored motion.

**Apple silicon · macOS 14 or later · local-first**

[Download the latest Mac release](https://github.com/bomkino/galileo-gallery/releases/latest) · [Install](INSTALL.md) · [Use the app](docs/native/README.md) · [Release notes](docs/releases/v2.0.0.md)

## Make a gallery

Add images or video. Choose a scene family and variant. Arrange the media, adjust the composition, then export a movie or PNGs. The document, canvas, media inspector and transport are native AppKit/SwiftUI. Core Image uses Metal when available; AVFoundation handles video. No browser, Electron, FFmpeg, Node.js or additional runtime is required to use the Mac app.

Select a slide in **Media**, enable **Bring to centre**, and set **Hold** and **Size**. The slide moves to the centre, stays there, returns to its route, and the sequence continues. Multiple slides can have their own spotlight settings. A source video can keep looping while its slide stays held. Editor Pause freezes both; an authored spotlight hold does not.

Projects include managed copies of original media. Native Save, Save As, undo/redo and autosave operate on the document. Scene choices can be previewed without replacing the current composition until Apply.

## Output

- H.264 MP4 and ProRes 422 MOV.
- ProRes 4444 MOV, PNG stills and PNG sequences with transparency.
- Integer and fractional frame rates; one shared frame schedule for preview and output.

**Movies are silent.** Audio editing/export and WebM are not included in this native release. Legacy motion is reauthored, not a pixel-identical port. Legacy projects open as separate native copies; review their composition and save under a new name. Keep the original project for rollback.

## Status and limitations

Version 2 is the native Mac product line. The release page identifies the source commit, distribution files and checksums. Automated tests cover specific document, media and export behaviours; they are not a guarantee that every composition or Mac configuration is trouble-free. See the [current engineering boundary](docs/native/ENGINEERING.md).

Distribution is ad-hoc signed, **not Developer ID signed or notarized**. First launch may require Apple's per-app Open Anyway procedure. Do not disable macOS security globally. See [installation](INSTALL.md).

## Build from source

Use an Apple-silicon Mac with Xcode command-line tools and Swift 5.10 or later (the CI toolchain is recorded in each run).

```sh
swift test --package-path native
bash scripts/native/package.sh release-native
open "release-native/Galileo Gallery.app"
```

The package script refuses to replace an existing output app; use a fresh output folder for another build. The release workflow builds, checks the actual native document journey, creates a DMG and ZIP, verifies their packaged binaries, and publishes matching checksums. It does not run a Windows, Linux or browser release.

## Repository map

`native/` contains the shipping application, core, native compositor and tests. `scripts/native/` contains build/distribution scripts. `docs/native/` is current documentation.

The old `src/`, `electron/`, `scene-ateliers/`, npm manifests and programme reports are retained as **legacy source and provenance**, not a parallel product. They are not bundled in the native app. [Documentation map](docs/README.md).

## Credits and license

By pitch.dog. [GPL-3.0 license](LICENSE) · [Third-party and historical notices](THIRD_PARTY_NOTICES.md). Original source history and scene research are preserved; grouping navigation does not erase authorship.
