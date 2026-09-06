# Galileo Gallery

A silent, local motion studio for slides, images and looping video.

**Apple silicon · macOS 14 or later.** Native AppKit/SwiftUI, Core Image/Metal composition and AVFoundation picture export. No browser runtime, account, conversion service or sound controls.

[Download the latest Mac release](https://github.com/bomkino/galileo-gallery/releases/latest) · [Install](INSTALL.md) · [Use Galileo](docs/native/README.md) · [Supported media](docs/native/MEDIA.md)

## Direct the sequence

Import images, still or animated WebP, VP8/VP9 WebM, other supported videos, or selected PDF pages. Choose a scene family and variant. Bring selected slides to the centre, hold them, then return them to the sequence. A short video can keep looping during a long hold. Choose an opening and a finite closing when the sequence needs them.

Inspect a clip and its filmstrip without running the entire composition. Trim, change rate, loop or choose a freeze frame. Frame artwork visually or numerically; view the canvas at Fit, 50%, 100% or 200%. Jump between spotlights, save favourite scenes and named presets, and audition Drift backgrounds against your own artwork. Appearance adjustments remain live; structural edits pause deliberately.

## Keep work intact

Native `.galileo` documents contain their media. Import, save and reopen share resource and manifest limits. Missing-media recovery keeps usable artwork and its settings. Replacement retains compatible framing, spotlight and source timing. Native save/autosave, failed writes, undo/redo and reopening are exercised in the packaged application.

WebM preparation happens locally using bundled, restricted FFmpeg/libvpx tools. The original file stays unchanged beside its native working copy. This can require more disk space than the compressed source. Successful files remain imported when another file fails; failures name the affected input.

A 2.3 save uses schema 7. Older native projects migrate in memory, but earlier apps cannot read newly saved 2.3 documents. Keep original projects. Native choreography may differ from historical Electron exports.

## Output

Silent H.264 MP4, ProRes 422/4444 MOV, PNG stills and PNG sequences. Export the whole sequence, one spotlight, a time interval or the current frame. A serial queue retains each export's document snapshot even if the window closes. ProRes 4444 and PNG support transparency.

Original source audio is retained only as part of the unchanged imported file; it is never played or exported. AV1/HDR WebM intake and WebM output are not supported in 2.3. PDF pages are rasterized. [Media limits](docs/native/MEDIA.md).

The app is ad-hoc signed, **not notarized**. The release includes matching DMG/ZIP downloads, validation evidence, checksums and corresponding codec source. This software uses FFmpeg under LGPL-2.1-or-later and libvpx under its retained license; see [notices](THIRD_PARTY_NOTICES.md) and the release's codec-source ZIP.

## Develop

```sh
bash scripts/native/build-codecs.sh
swift test --package-path native
bash scripts/native/package.sh
```

Development requires an Apple-silicon Mac, Xcode/Metal tools, Python 3, Git, Make and pkg-config. The released app needs none of those tools. `native/VERSION` is authoritative. [Engineering and validation](docs/native/ENGINEERING.md) · [2.3 release notes](docs/releases/v2.3.0.md) · [Contributing](CONTRIBUTING.md).

Historical JavaScript/Electron source and atelier reports remain as credited reference, not another product or a runtime requirement. [Documentation map](docs/README.md) · [License](LICENSE).
