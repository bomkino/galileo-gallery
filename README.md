# Galileo Gallery

Galileo Gallery is a free, local desktop motion studio for turning images, videos, GIFs, and deck slides into authored gallery films. Build a clean loop, a finite sequence, or a one-shot animation for a deck, explainer, social post, website, or transparent overlay.

**Latest stable: 1.1.1**

The app contains 29 distinct motion Scenes distilled from 29 original components. Each Scene keeps its own timing, geometry, spatial rules, and physical character. Import, Timeline, Project storage, Interface Scale, and deterministic export remain shared.

## What it makes

- 29 independently authored motion Scenes
- Images, silent videos, GIFs, and deck-slide media
- Once, Loop × N, and seamless-forever playback
- Timeline scrubbing and exact-frame inspection
- Scene-specific Spotlight and Finale holds
- Transparent backgrounds for compositing
- MP4, Premiere MOV, WebM, compact WebM, ProRes 422 HQ, and ProRes 4444 XQ output
- Portable `.galileo` Projects and reusable look templates

Media stays on the user's machine.

## Download

Use the repository's GitHub Releases page for:

- macOS Apple silicon DMG
- Windows x64 portable EXE
- Linux x64 AppImage
- SHA-256 checksums

The macOS app is ad-hoc signed for bundle integrity. It is not Apple Developer ID signed or notarized, so Gatekeeper may ask you to confirm trust.

### macOS

1. Open the DMG.
2. Drag **Galileo Gallery** into **Applications**.
3. Control-click the app, choose **Open**, then confirm **Open** again.
4. If blocked, use **System Settings → Privacy & Security → Open Anyway**.

If macOS still reports damage after downloading from this repository's official release, remove the quarantine flag as a last resort:

```bash
xattr -dr com.apple.quarantine "/Applications/Galileo Gallery.app"
```

That command bypasses quarantine for this app. It does not notarize the build or create Apple trust.

### Linux

```bash
chmod +x Galileo.Gallery-1.1.1-Linux-x86_64.AppImage
./Galileo.Gallery-1.1.1-Linux-x86_64.AppImage
```

## Run from source

Requirements: Node.js 24 or newer and npm.

```bash
git clone https://github.com/bomkino/galileo-gallery.git
cd galileo-gallery
npm install
npm run dev
```

`ffmpeg-static` prepares the correct FFmpeg executable for the current platform during installation.

## Test

```bash
npm test
npm run verify:design-system
npm run verify:g08-renderer
```

`npm test` covers build correctness, Project safety, Scene timing, media handling, persistence, deterministic audio/export contracts, Interface Scale, the pitch.dog font source, Phosphor icon coverage, and spacing-system invariants. G08 runs the real Electron interface across viewport sizes and scale settings and writes screenshot evidence under `artifacts/g08/`.

## Package

Run packaging on the target operating system:

```bash
npm run package:mac
npm run package:windows
npm run package:linux
```

Each command prepares the platform FFmpeg binary, builds the renderer, and writes to `release/`. Tagged releases are built again on all three operating systems by GitHub Actions before publication.

## Interface system

Version 1.1.1 keeps the packaged pitch.dog type system and Phosphor control language, closes the remaining geometry defects, and adds persistent Light and Dark interface modes. Both modes preserve Scene pixels, Project data, layout geometry, 44 px minimum targets, explicit carets, stable disclosure menus, and reduced-motion-safe transitions across every Interface Scale.

See [`docs/design-system.md`](docs/design-system.md) for exact source pins, type roles, spacing tokens, icon rules, and verification. See [`docs/README.md`](docs/README.md) for the active documentation map. The full historical programme and renderer evidence remains available under `docs/programme/`.

## Export architecture

Bundled FFmpeg decodes videos into bounded, cycle-local frame caches at the chosen frame rate and canvas size. A hidden renderer receives exact global times, selects deterministic source frames, renders the Scene pose, and streams captured frames to the encoder. Final export does not depend on browser video seeking.

Opaque masters use ProRes 422 HQ. Transparent masters use ProRes 4444 XQ. Opaque video carries explicit BT.709 tags; alpha-capable exports preserve transparency. The verified Linux MP4 path carries the authored deterministic AAC mix.

## Principles

- Scene identity beats generic motion presets.
- Loops preserve continuity; frames do not pop without cause.
- Depth should read physically.
- Spotlight and Finale are authored Timeline states.
- Controls remain reachable at every supported Interface Scale.
- Reduced-motion preferences are respected.
- Imported work stays local.

## Open development

Galileo Gallery was designed and implemented by pitch.dog in close collaboration with OpenAI Codex. The repository keeps implementation receipts and failure evidence because learning in public matters.

Bug reports and focused contributions are welcome. Read [`CONTRIBUTING.md`](CONTRIBUTING.md), [`SECURITY.md`](SECURITY.md), and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## License

Galileo Gallery is free software under GPL-3.0-or-later. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for bundled dependencies, fonts, icons, and FFmpeg notices.
