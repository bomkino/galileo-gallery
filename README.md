# Galileo Gallery

Galileo Gallery is a free, local desktop motion studio for turning images, videos, GIFs, and deck slides into authored gallery films. Make a clean loop, a finite sequence, or a one-shot animation for an explainer, social post, website, or transparent video overlay.

It began as the Opening Reel Framer component and grew into 17 motion scenes distilled from 29 original components. Every scene has its own defaults, spatial rules, timing, and physical character; the importer, timeline, projects, and deterministic export pipeline are shared.

Current version: **1.0.0**

## What it can make

- 17 scene families and 29 original-informed styles
- Images, silent videos, GIFs, and deck-slide media
- Once, Loop × N, and seamless forever playback
- Forward, reverse, horizontal, and vertical motion where the scene supports it
- Timeline scrubbing and exact-frame inspection
- Scene-specific Spotlight and Finale holds
- Transparent backgrounds for compositing
- MP4, Premiere MOV, WebM, and compact WebM exports
- ProRes 422 HQ and ProRes 4444 XQ master output
- Portable `.galileo` projects and reusable look templates

Before/After is one shared comparison surface with a gentle authored sweep. Orrery is a layered orbital system whose satellites pass both behind and in front of its central slide. The Build is a staged construction sequence, not a generic card loop.

## Download

Builds for macOS Apple silicon, Windows x64, and Linux x64 are published on the [GitHub Releases page](https://github.com/bomkino/galileo-gallery/releases). The macOS app has an ad-hoc integrity signature, but it is not Apple Developer ID signed or notarized. Gatekeeper will therefore ask you to confirm that you trust it.

### Install on macOS

1. Download the latest macOS Apple silicon DMG and open it.
2. Drag **Galileo Gallery** into **Applications**.
3. In Applications, Control-click **Galileo Gallery**, choose **Open**, then choose **Open** again.
4. If macOS still blocks it, open **System Settings → Privacy & Security**, find the Galileo Gallery message, and choose **Open Anyway**.

If macOS reports that the app is damaged after those steps, remove the downloaded file's quarantine attribute as a last resort:

```bash
xattr -dr com.apple.quarantine "/Applications/Galileo Gallery.app"
```

Only run that command after downloading Galileo Gallery from this repository's official Releases page. It bypasses Gatekeeper's quarantine check for this app; it does not notarize or establish Apple trust. Then Control-click the app and choose **Open** again. Installation help: [hello@pitch.dog](mailto:hello@pitch.dog).

Linux is distributed as an AppImage. Make it executable, then run it:

```bash
chmod +x "Galileo Gallery-1.0.0-Linux-x86_64.AppImage"
./"Galileo Gallery-1.0.0-Linux-x86_64.AppImage"
```

## Run from source

Requirements: Node.js 24 or newer and npm.

```bash
git clone https://github.com/bomkino/galileo-gallery.git
cd galileo-gallery
npm install
npm run dev
```

`ffmpeg-static` downloads the correct FFmpeg executable for the current platform during installation. Media stays local.

## Test and package

```bash
npm test
npm run package:mac
npm run package:windows
npm run package:linux
```

Package on the target operating system. Each packaging command prepares that platform's FFmpeg executable, builds the renderer, and creates an app under `release/`. macOS packaging uses an ad-hoc signature for bundle integrity; it does not create a trusted or notarized release.

## How export works

Videos are decoded by bundled FFmpeg into bounded, cycle-local frame caches at the export frame rate and canvas size. A hidden renderer receives exact global times, chooses deterministic source frames at normal speed, renders the selected scene pose, and streams captured frames to the encoder. Final export does not depend on browser video seeking.

Opaque masters use ProRes 422 HQ. Transparent masters use ProRes 4444 XQ. Opaque video carries explicit BT.709 tags; alpha-capable exports preserve transparency. Outputs are intentionally silent.

## Design principles

- Each scene gets scene-specific defaults and behavior.
- Loops preserve continuity; cards do not pop in or disappear without cause.
- Depth ordering should feel physically legible and tactile.
- Spotlight and Finale are authored timeline states, not generic enlargement effects.
- The studio remains usable with reduced motion enabled.
- Imported work stays on the user's machine.

## Open development

Galileo Gallery was designed and implemented by pitch.dog in close collaboration with OpenAI Codex. Codex helped investigate the original Framer components, build the desktop architecture and deterministic exporter, implement motion systems, diagnose export failures, write tests, and prepare the cross-platform open-source release. We are publishing the work—including its rough edges—because learning in public matters.

Bug reports and focused contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

Galileo Gallery is free software licensed under [GPL-3.0-or-later](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for bundled dependencies and FFmpeg information.
