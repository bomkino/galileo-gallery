# Source fidelity, alpha, and Look — Vitrine

## Binding source invariant

Every active source plane, in every phrase:

```text
opacity: 1
filter: none
blend: normal
```

No exceptions. Readable hold is not “mostly faithful.” Exchange does not earn crossfade. Entry/exit does not earn blur. Depth does not earn dimming. Spotlight/Finale does not earn glow.

## Complete interval audit

The pure verifier samples loop and finite modes across `202` timestamps. It found zero source-treatment deviations. The declared difference list is therefore empty:

```text
intervals where source opacity/filter/blend differs from faithful hold: none
```

Source visibility changes only because a plane is geometrically offstage, absent from the active pair, or occluded by another source plane. Inactive identity records remain in order.

## Fit, crop, and focal ownership

- Scene determines presentation-plane dimensions and pose.
- Source natural ratio remains intact.
- Clean default is contain.
- Cover/crop/focal intent belongs the serialized per-frame source contract.
- Canvas ratio is independent from source fit.
- Failed media retain identity/caption/chapter.
- Video shares identical source treatment.

## Scene geometry versus Look

Scene:

- one/two source planes;
- centre station and exchange pose;
- optional external placard semantics;
- alpha-safe visibility and occlusion.

Future G10D Look:

- viewing-room field;
- paper surround or edge outside artwork;
- plinth/ledge/environment;
- shadow outside source pixels;
- stable luminance and deterministic subtle background treatment.

Look may never:

- sweep light across artwork;
- tint, grade, blur, vignette, texture, grain, or desaturate source pixels;
- add permanent glow to imply value;
- use reflection as a default duplicate of source;
- leave RGB in zero-alpha pixels.

## Reflection and sheen verdict

Rejected for v1.

A reflection copies source content, creates alpha/lifecycle complexity, and easily turns Vitrine into pseudo-luxury slideshow styling. A sheen/light sweep directly competes with imported typography and colour. Any later experiment must be a separate default-off contract with pixel/alpha evidence; it is not a control placeholder here.

## Transparent output

Transparent mode removes environment, plinth line, ground shadow, surround, and mandatory edge. Source alpha remains the only artwork alpha. Optional placard may be explicitly authored, but canonical alpha evidence disables it to isolate source integrity.

Premultiplied-alpha invariant:

```text
alpha == 0 => RGB == 0,0,0
```

Laboratory `640×640` alpha capture:

- zero-alpha pixels: `382,447`;
- zero-alpha pixels with non-zero RGB: `0`;
- partial-alpha pixels: `2,421`;
- opaque pixels: `24,732`;
- zero-RGB-below-zero-alpha: pass.

Composites exist over black, white, red, blue, and checkerboard. This proves generated laboratory output only, not Product export integration or external-user-media RGB equivalence.

## Adversarial rejection list

Reject production code if:

- readable hold has any CSS/SVG/WebGL source filter;
- source opacity drops during exchange;
- a light layer overlaps source pixels;
- reflection/sheens appear by default;
- placard overlays source;
- paper surround is baked into source texture;
- transparent output retains shadow/field RGB;
- failed/video sources receive different grading;
- decoded source pixels are resampled by an unnecessary GPU pipeline.

## Audio boundary

Vitrine does not emphasize the current visual source by changing gain, mute, solo, ducking, soundtrack, presenter, source-video, or master state. Visual attention and audio intent remain separate Product contracts.
