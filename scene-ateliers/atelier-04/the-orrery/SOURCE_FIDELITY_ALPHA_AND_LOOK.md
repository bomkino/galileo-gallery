# Source fidelity, alpha, and Look — The Orrery

Status: **G10B preflight candidate; implementation blocked by G10A**

## Readable-source invariant

For primary, incoming primary, outgoing primary, and every visible satellite:

```text
artwork opacity = 1
artwork filter  = none
blend mode      = normal
```

This holds through orbit motion, depth crossing, assembly, exchange, Spotlight/finale, reduced motion, and transparent output. Depth does not earn dimming, tint, blur, saturation loss, or source-light falloff.

## Source role and fit

- Per-frame natural ratio is preserved.
- Clean default is `contain`; cover/crop/focal intent belongs the serialized frame/source contract, not Orrery projection.
- The Scene determines plane size, pose, depth, occlusion, and visibility bounds.
- Canvas ratio remains independent from source fit.
- Failed media retain ID, role, order, membership, and geometric placeholder.
- Source-video planes follow the same treatment contract as images.

## Primary exchange intervals

There is **no interval** where source opacity/filter/blend differs from the readable invariant.

| Interval | Old primary | Target | Other satellites | Treatment difference |
| --- | --- | --- | --- | --- |
| stable orbit | readable | satellite | satellites | none |
| exchange start | readable | readable | readable | none |
| exchange middle | readable | readable | readable | none |
| exchange end | satellite | primary | readable | none |
| finale/hold | readable | readable | readable | none |

Visibility may change only through canvas bounds, assembly geometry, or honest occlusion. No source crossfade masks the role exchange.

## Scene geometry versus Look

Scene geometry:

- source planes;
- primary/satellite pose and depth;
- optional diagnostic guide paths, off by default;
- alpha-safe geometric occlusion.

Future G10D Look may provide:

- environment behind/around planes;
- stable luminance;
- deterministic subtle background motion;
- decorrelated grain outside source pixels;
- authored material context.

Look may not:

- light, tint, wash, blur, grade, vignette, or grain artwork;
- add a permanent glow that defines primary authority;
- use guide lines to compensate for unclear motion;
- contaminate transparent pixels.

## Transparent contract

Clean transparent mode contains source planes only. Orbit guides, glow, stars, fog, shadows that require a ground, and decorative lines are absent.

Premultiplied-alpha invariant:

```text
alpha == 0  =>  RGB == 0,0,0
```

Laboratory capture `captures/alpha-transparent.png`:

- canvas: `640 × 640`;
- fully transparent pixels: `329,012`;
- fully transparent pixels with non-zero RGB: `0`;
- partial-alpha pixels: `4,165`;
- opaque pixels: `76,423`.

The same capture is composited over black, white, red, blue, and checkerboard. This proves the generated laboratory surface, not Product export integration or external source-pixel equivalence.

## Adversarial checks

Reject production implementation if:

- satellites dim merely because they are behind;
- primary gains glow/tint by default;
- exchange uses opacity crossfade;
- CSS filters touch source elements;
- WebGL texture sampling changes RGB or alpha;
- guides survive transparent output;
- hidden RGB appears below zero alpha;
- failed/video media lose serialized identity.

## Audio boundary

The Orrery neither changes source-video, presenter, soundtrack, master, mute/solo/gain, nor ducking truth. Visual roles do not imply audio emphasis. Any future audio-role relationship must be a separate Product decision.
