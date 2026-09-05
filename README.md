# Galileo Gallery

A silent, local motion studio for pitch-deck slides, images and looping video.

**Apple silicon · macOS 14 or later.** The released app is native AppKit/SwiftUI, with Core Image/Metal composition and AVFoundation picture export. No browser runtime, account, network service, soundtrack or audio controls are required.

[Download the latest Mac release](https://github.com/bomkino/galileo-gallery/releases/latest) · [Install](INSTALL.md) · [Use Galileo](docs/native/README.md)

## Direct the sequence

Import images, video or selected PDF pages. Choose a scene family and variant. Bring chosen slides to the centre, hold them, then return them to the sequence. Short videos can keep looping inside a long hold. Add a closing slide when the sequence needs a final image.

Frame artwork visually or numerically; inspect the canvas at Fit, 50%, 100% or 200%. Jump between spotlights instead of hunting through the timeline. Save favourite scenes and named presets. Export the whole sequence, one spotlight, a time range or the current frame. A small serial queue keeps output work independent of the document window.

## Keep work intact

Native `.galileo` documents contain their media. Import and save use the same resource budget. Recovery copies let you locate or replace missing artwork without rewriting the original. Replacement preserves valid framing, spotlight and video-timing choices. Native save/autosave and undo/redo are exercised in the packaged app, not just in model tests.

Older native projects and legacy ZIP projects open through explicit conversion. Keep original projects: a 2.1 save uses schema 5 and cannot be opened by 2.0. Native choreography may differ from the old cross-platform renderer.

## Output

Silent H.264 MP4, ProRes 422/4444 MOV, PNG stills and PNG sequences. ProRes 4444 and PNG preserve transparency. Original imported videos are retained unchanged; their audio is neither played nor exported. This is the intended product, not an unfinished sound feature.

The release is ad-hoc signed, not notarized. See [installation](INSTALL.md) for Apple's per-app first-launch procedure. See [engineering and validation](docs/native/ENGINEERING.md) for measured boundaries and [2.1 release notes](docs/releases/v2.1.0.md).

## Develop

```sh
swift test --package-path native
bash scripts/native/package.sh
```

App builds and native integration tests require an Apple-silicon Mac with a compatible Swift toolchain. `native/VERSION` is authoritative. Historical JavaScript/Electron source, ateliers and their old reports are retained as reference, not a second product or build requirement. [Contributing](CONTRIBUTING.md) · [Documentation map](docs/README.md) · [License](LICENSE)
