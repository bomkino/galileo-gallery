# Media support — 2.3

All import and playback is local. Audio is never played or exported. Originals remain unchanged inside saved projects.

| Input | Behaviour and boundary |
|---|---|
| JPEG, PNG, TIFF, BMP, HEIC/HEIF and other accepted ImageIO stills | Decode is validated before adoption. Availability depends on the system decoder; a filename alone is not proof of support. |
| Still WebP | ImageIO import, including transparency and orientation. |
| Animated WebP | Reconstructed ImageIO frames and their individual delays. Transparent partial-frame fixtures are compared with independent reference images. |
| GIF/APNG | ImageIO animation timing; at most 3,000 frames. |
| MOV, MP4 and accepted native video inputs | AVFoundation picture track, source trims/rate/looping. Unsupported codec/metadata or a failed first-frame decode produces a file-specific error. |
| WebM: VP8 or VP9, SDR | A bundled local decoder prepares a ProRes working copy. VP9 alpha, variable frame timestamps and independent looping are covered by fixtures. The original WebM is preserved. |
| WebM: AV1, PQ or HLG HDR | Not supported in this release. Rejected explicitly, not silently tone-mapped or relabelled. |
| PDF | Select pages, resolution and paper/transparent background. Raster page slides are stored alongside one preserved original PDF. |

## Storage and decoding

A native document accepts at most 512 items. Originals have a 512 MiB per-file and 4 GiB unique-source budget. WebM native working copies use a separate 4 GiB per-file / 16 GiB aggregate budget. Free space is checked during preparation and saving. ProRes working files can be substantially larger than WebM; they are for editing/export, not a claim of lossless codec conversion. Opaque WebM uses ProRes 422 HQ; alpha uses ProRes 4444. The untouched original and recipe remain available for future reprocessing.

At most two compatibility preparations run concurrently. Each is bounded by time, output storage and diagnostic size, and cancellation terminates its child process. The bundled helpers have no network protocols and do not search for tools installed elsewhere on the Mac.

Still-image metadata is limited to 200 million pixels. Video pictures are limited to 8,192 pixels per side and 33,177,600 pixels total; animation sequences to 3,000 frames. These safety limits do not promise smooth playback for every accepted collection. The decoder can use temporary full-source frames even when the displayed preview is small.

ImageIO handles WebP; no extra WebP library is bundled because the required representative still/animation cases passed the system decoder. WebM support is a codec-specific feature, not a promise about every stream a WebM container can contain.

## Output

H.264 MP4, ProRes 422/4444 MOV, PNG stills and PNG sequences. ProRes 4444 and PNG support transparency; H.264/ProRes 422 are opaque. All movies are silent. WebM is an **input** format only. PNG is sRGB; movie output uses the tag-derived Rec.709 colour space. There is no HDR/high-bit-depth mastering guarantee, regardless of the selected output container or codec.

## Codec provenance

The compatibility tools are built from FFmpeg 8.1.2 (`38b88335f99e76ed89ff3c93f877fdefce736c13`) and libvpx 1.15.2 (`d168454ecd099805c675d4a98c66f4891373302a`). Configuration, licensing, source archives and checksums are attached to the release in `Galileo.Gallery-2.3.0-codec-source.zip`. The application does not dynamically link an external FFmpeg library or need Homebrew. See [third-party notices](../../THIRD_PARTY_NOTICES.md).
