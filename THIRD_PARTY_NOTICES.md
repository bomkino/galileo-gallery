# Third-party notices

## Native Mac product (version 2)

Galileo Gallery's native application is distributed under the repository's GPL-3.0 license, combined with the AGPL-3.0-or-later Drift background component described below. It uses Apple SDKs and system frameworks including AppKit, SwiftUI, Core Image, Metal, AVFoundation, ImageIO, CoreText, CoreGraphics and UniformTypeIdentifiers. Apple frameworks and system fonts are supplied by macOS; this app does not redistribute font files.

The `CZlib` module binds the operating system's zlib for legacy archive decompression. zlib is supplied by the operating system, not copied into the bundle. The native distribution contains the application, app icon, help, source identity and license/notices. It does not bundle Electron, Chromium, WebKit, React, FFmpeg, npm dependencies, web fonts or Phosphor React assets.

The native source builds on the project's authored scene research and preserves legacy scene identities and manifests. New native choreography is not claimed to be an exact rendering of the original evaluators. Git history and the `scene-ateliers/` sources preserve authorship and provenance.

## Earlier product and retained source

The Electron/React/Vite/TypeScript product, its npm manifest/lockfile, source files and scene-ateliers remain in the repository as historical source. Their dependency licenses continue to apply to that source and to historical releases. They are not native runtime dependencies.

The earlier app used the pitch.dog type system pinned at `786b4a2b671182319320f922b8de8f927ea3a002`, Phosphor React 2.1.10 (MIT), adm-zip/yauzl/pend (MIT), and an FFmpeg binary supplied by ffmpeg-static (GPL subject to that binary's configuration). The exact earlier notices are preserved in [docs/archive/THIRD_PARTY_NOTICES-1.x.md](docs/archive/THIRD_PARTY_NOTICES-1.x.md), with upstream provenance under `docs/third-party/` and the historical source tree.

App identity artwork remains governed by its existing repository license or a file-specific notice. No upstream ownership is transferred by this rebuild.

## Drift procedural backgrounds (2.2 and later)

The background catalogue, palette definitions and shader algorithms are adapted from `bomkino/pitchdog-drift` at `340b5f631c9147890bc775c86a71af315dd17929`. Copyright (C) 2026 pitch.dog and contributors. Drift's software is AGPL-3.0-or-later; its license and NOTICE are retained under `native/Vendor/DriftBackgrounds/` and bundled as `Drift-AGPL-3.0.txt` and `Drift-NOTICE.txt`. The derived catalogue and Metal shader remain AGPL-3.0-or-later. GPLv3 and AGPLv3 section 13 permit this combination; the AGPL network-interaction requirements apply to the combination if it is later provided for remote use. Galileo remains an offline native desktop app.

The repository and release source archive provide the corresponding source, including the pinned original GLSL/TypeScript, file hashes, generated Metal/Swift, and the offline conversion/build scripts. No Three.js, web runtime, original demo artwork or font binaries are copied into the application. Names, colours, preset parameters and all nine shader families are retained. The native adaptation uses Galileo's frame/cycle clock, precompiled Core Image Metal, explicit sRGB conversion and premultiplied output. The original algorithms remain attributable to Drift; this port does not transfer authorship.
