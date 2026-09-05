# Third-party notices

## Native Mac product (version 2)

Galileo Gallery's native application is distributed under the repository's GPL-3.0 license. It uses Apple SDKs and system frameworks including AppKit, SwiftUI, Core Image, Metal, AVFoundation, ImageIO, CoreText, CoreGraphics and UniformTypeIdentifiers. Apple frameworks and system fonts are supplied by macOS; this app does not redistribute font files.

The `CZlib` module binds the operating system's zlib for legacy archive decompression. zlib is supplied by the operating system, not copied into the bundle. The native distribution contains the application, app icon, help, source identity and license/notices. It does not bundle Electron, Chromium, WebKit, React, FFmpeg, npm dependencies, web fonts or Phosphor React assets.

The native source builds on the project's authored scene research and preserves legacy scene identities and manifests. New native choreography is not claimed to be an exact rendering of the original evaluators. Git history and the `scene-ateliers/` sources preserve authorship and provenance.

## Earlier product and retained source

The Electron/React/Vite/TypeScript product, its npm manifest/lockfile, source files and scene-ateliers remain in the repository as historical source. Their dependency licenses continue to apply to that source and to historical releases. They are not native runtime dependencies.

The earlier app used the pitch.dog type system pinned at `786b4a2b671182319320f922b8de8f927ea3a002`, Phosphor React 2.1.10 (MIT), adm-zip/yauzl/pend (MIT), and an FFmpeg binary supplied by ffmpeg-static (GPL subject to that binary's configuration). The exact earlier notices are preserved in [docs/archive/THIRD_PARTY_NOTICES-1.x.md](docs/archive/THIRD_PARTY_NOTICES-1.x.md), with upstream provenance under `docs/third-party/` and the historical source tree.

App identity artwork remains governed by its existing repository license or a file-specific notice. No upstream ownership is transferred by this rebuild.
