# Source fidelity, alpha, and Look — The Shelf

## Source invariant

Every source plane, ordinary or focused:

```text
opacity: 1
filter: none
blend: normal
```

No neighbour dimming, depth tint, hover grade, Spotlight glow, motion blur, colour wash, or source shadow filter is allowed. Lean and lift are geometric transforms around/outside source pixels.

## Natural ratio and fit ownership

- Width follows natural ratio from the source contract.
- Scene selects a nominal height and safe width reduction; it does not crop.
- Clean default is contain.
- Cover/crop/focal intent remains per-frame source authority.
- Canvas dimensions and baseline are independent from source fit.
- Failed media retain source identity, ratio, position, lean, and timing.
- Video shares identical source treatment.

## Scene geometry versus Look

Intrinsic Scene geometry:

- source planes;
- one horizontal contact baseline;
- track positions and offstage seam copies;
- bottom-pivot lean;
- causal Spotlight lift.

Future G10D Look:

- wall field;
- ledge thickness/material/edge;
- paper surround;
- ground/contact shadows;
- environmental light;
- stable colour/grain outside source pixels.

Look may not:

- change artwork pixels or opacity;
- make a centre focus well through vignette/dimming;
- turn the baseline into a decorative glowing line;
- add material to transparent output beyond explicitly allowed alpha-safe Scene baseline;
- hide a visible seam with blur/fade.

## Minimal baseline decision

The baseline is retained as one alpha-safe geometric contact line because without contact the sources become floating cards and the Shelf identity collapses. Its material styling is not retained in transparent mode. This is the smallest justified Scene apparatus.

A later human charter may reject the line in fully transparent composites only if another alpha-safe contact convention preserves identity. That decision must not be silently delegated to Look.

## Transparent output

Transparent mode contains source planes plus one minimal baseline. It removes wall, ledge material/thickness, field, tint, shadow, blur, and caption marker.

Premultiplied-alpha invariant:

```text
alpha == 0 => RGB == 0,0,0
```

Laboratory `640×640` alpha capture:

- zero-alpha pixels: `367,194`;
- zero-alpha pixels with non-zero RGB: `0`;
- partial-alpha pixels: `3,533`;
- opaque pixels: `38,873`;
- minimal Scene geometry: one alpha-safe horizontal baseline;
- zero-RGB-below-zero-alpha: pass.

Composites exist over black, white, red, blue, and checkerboard. This is laboratory evidence, not Product encoded export or external-media pixel equality.

## Recycling and source fidelity

A seam is not allowed to fade or blur. It is hidden only because both copies are outside the visible stage between exit and entry. The same source identity never appears twice onscreen. Therefore source opacity stays `1` through every observed interval.

## Captions/index

- Optional, external to artwork, semantically associated with source identity.
- Not required for silhouette/motion identity.
- Duplicate seam slots do not duplicate accessible captions.
- Canonical transparent evidence suppresses caption marker.
- A broader Product caption system may supersede prototype diagnostics.

## Adversarial rejection list

Reject production code if:

- card bottom drifts from baseline without Spotlight cause;
- source width/height ratio changes;
- a seam uses opacity/blur;
- same Project source appears twice;
- neighbours dim around focused card;
- wall/ledge material is baked into source texture;
- transparent mode keeps material shadow or hidden RGB;
- pointer momentum or wall-clock time owns export pose;
- a vertical mode is presented as equivalent.

## Audio boundary

Track proximity, Spotlight, and Finale do not alter any audio lane, source-video gain, mute, solo, ducking, presenter, soundtrack, or master state. Audio remains separate Project/Timeline truth.
