# Source fidelity, alpha, and Look — Lively Prints

## Source-safe rules

Every card reports artwork opacity 1, filter `none`, blend mode `normal`. Route motion transforms the physical print object only. Field attention never dims neighbours, brightens the active source, applies blur, or changes crop.

Mixed-ratio source intent survives through card geometry and upstream fit/focal metadata. Failed media retain a crossed placeholder on the same route and field zone.

## Transparent output

Supported. The fixed-step raster starts from RGBA zero. At 960 × 540 representative evidence:

- 332,480 alpha-zero pixels;
- 0 alpha-zero pixels with non-zero RGB;
- 0 partial-alpha pixels in the hard-edged evidence raster;
- 185,920 opaque pixels.

Black, white, red, blue, and checkerboard composites are committed. This proves the isolated generated raster only; S1 must repeat in the Product renderer and encoded export.

## Scene apparatus versus Look

Legitimate Scene apparatus:

- print edge;
- focus registration outline;
- route and exclusion overlays in debug evidence only.

External Look responsibilities:

- background colour/gradient/paper/table;
- grain, texture, vignette, global light;
- paper and ink token policy if retained;
- any decorative shadow.

No route debug geometry may ship in normal output. No table treatment may bleed into transparent pixels or imported art.

## Forbidden treatments

- source brightness/opacity falloff;
- glow around focus;
- motion blur that contaminates source pixels;
- shared colour grade;
- random grain sampled per frame;
- screen blend or multiply;
- vignette used to create negative space;
- background texture treated as Scene identity.

## Limits

Generated fixtures prove known pixel treatment and alpha hygiene, not arbitrary user-media RGB equivalence, browser antialias quality, video decode parity, or final encoder alpha. Those remain S1 gates.
