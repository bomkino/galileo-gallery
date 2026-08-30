# Source fidelity, alpha, and Look — Zoetrope

## Binding source contract

At every declared readable front-gate hold:

```text
artwork opacity = 1
artwork filter = none
artwork blend = normal
```

The Scene may transform the source plane in 3D, contain or cover according to serialized per-frame intent, occlude the whole plane behind apparatus geometry, and cull it when geometrically invisible. It may not dim, brighten, tint, blur, grain, shadow-filter, sweep light across, or change blend mode on imported pixels.

The current legacy central renderer varies opacity and brightness with orbit depth. That behaviour is rejected for the candidate. Depth must read from size, tangency, z-order, and occlusion.

## Contain, cover, crop, and focal ownership

- Canvas ratio belongs to Project canvas intent.
- Natural media ratio belongs to each ordered media record.
- `contain` is the candidate clean default.
- `cover`, custom crop, and focal point may be honoured only when serialized as source/frame intent by Product. Zoetrope cannot invent a crop because a side card is inconvenient.
- Card geometry is height-led; natural width follows ratio. The source plane does not stretch.
- Failed media uses a stable, source-neutral placeholder occupying the same card geometry and source order.

## Scene geometry versus Look

Scene may own:

- cylinder coordinates;
- card transforms and z-order;
- rear geometric culling;
- optional alpha-safe card support plane if Product frame treatment requires it;
- a development-only gate marker excluded from output truth.

Future G10D Look may own:

- room wall/floor;
- paper surround around the source;
- source-neutral shadow cast by the card plane;
- an apparatus housing outside source pixels;
- deterministic background movement and decorrelated grain outside alpha-zero pixels.

Look may not own cadence, phase, source order, gate selection, or source-pixel treatment.

## Transparent composition

Transparent mode contains only evaluated source planes and any explicitly chartered alpha-safe card support. The prototype removes the opaque stage and gate marker. The capture `evidence/captures/alpha-transparent.png` was composited over black, white, red, blue, and checkerboard.

Measured prototype alpha:

- size: `640 × 640`;
- alpha-zero pixels: `319,272`;
- alpha-zero pixels with non-zero RGB: `0`;
- partial-alpha pixels: `4,480`;
- opaque pixels: `85,848`.

Result: zero RGB below zero alpha passed. See `evidence/ALPHA_ANALYSIS.json` and `evidence/CAPTURE_MANIFEST.sha256`.

This proves generated-fixture composite hygiene in the isolated prototype. It does not prove Product renderer, encoder, arbitrary decoded media, or future Look integration.

## Edge and shadow policy

- Clean default has no Scene-imposed border, tint, gloss, or shadow.
- A future Look shadow must be cast by an around-artwork support plane. It must disappear cleanly in transparent mode unless separately alpha-safe.
- Side-card foreshortening may reveal a support edge. Its colour must come from source-neutral frame intent, never sampled or multiplied over artwork.
- No speed blur is permitted.

## Video and audio

Video pixels follow the same opacity/filter/blend rule. Source-video time is evaluated from story time. Decoder warming, pause, seek, and release remain Product media services. Zoetrope does not touch source-video audio, presenter, soundtrack, gain, mute, solo, master, or ducking.
