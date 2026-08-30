# Source fidelity, alpha, and Look — Spiral Image Vortex

## Readable-source contract

At every near/readable passage and hold:

```text
opacity: 1
filter: none
mix-blend-mode: normal
```

At rear passage the same contract remains. Depth is communicated by projection, scale, z-order, and geometric occlusion. The Scene does not lower source opacity or brightness to manufacture depth.

The selected live central renderer currently varies opacity with depth and its historical reference uses endpoint opacity fades. Both behaviours are rejected.

## Fit and crop ownership

- Canvas format and dimensions belong to Project.
- Source natural ratio and per-frame fit/crop/focal intent belong to media/frame records.
- Candidate default is contain. Explicit per-frame `cover` remains valid Project media intent; the Scene applies it but never selects it automatically.
- Card dimensions are height-led and natural-width; no uniform forced ratio.
- Vortex cannot invent a crop because a wide source collides. It must reduce card height or increase pitch within chartered bounds.
- Failed media retains its ratio slot, ID, order, and path coordinate.

## Scene geometry versus Look

Scene owns only:

- helix path and projection;
- card plane transforms;
- z-order/crossing logic;
- offstage rear seam tunnel;
- bounded visibility/virtualization.

Future Look may provide background space, source-neutral support planes, or shadows behind cards. It may not provide a glow, streak, fog, central light, or vortex texture required to explain the path. Lighting cannot touch artwork.

## Transparent output

Transparent mode removes prototype guide/background and leaves only source planes/placeholders. No mandatory helix line exists.

Measured capture `evidence/captures/alpha-transparent.png`:

- `640 × 640`;
- alpha-zero pixels: `322,138`;
- alpha-zero with non-zero RGB: `0`;
- partial alpha: `4,794`;
- opaque: `82,668`.

Composites over black, white, red, blue, and checkerboard are stored under `evidence/captures/alpha-over-*`. This proves isolated generated-fixture hygiene only, not Product encoder or arbitrary media equivalence.

## No opacity seam

No interval changes source opacity for seam concealment. Visibility changes only when card bounds are fully offstage or within the fixed rear seam tunnel. The source returns on the opposite offstage side before it can intersect the stage. A later alpha-safe Look may not replace this geometric proof with a fade.

## Video/audio

Video follows identical source treatment. Story-time seeking is deterministic. Product services own decode, caching, and all audio truth. Vortex never changes gain, mute, solo, ducking, master, or source-video audio selection.
