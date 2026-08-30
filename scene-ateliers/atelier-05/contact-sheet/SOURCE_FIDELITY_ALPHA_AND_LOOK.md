# Source fidelity, alpha, and Look — Contact Sheet

## Clean source contract

Every source cell keeps:

- artwork opacity 1;
- filter `none`;
- blend mode `normal`;
- scale 1;
- stable z/topology;
- declared source ratio;
- declared contain/cover intent;
- focal intent retained as input;
- no selection-dependent colour or geometry treatment.

Registration brackets and labels sit outside source pixels. Attention never uses source brightness, dimming, blur, saturation, tint, glow, zoom, or opacity.

## Opaque material requirement

Contact Sheet is one material proof object, not cards floating over arbitrary space. A continuous opaque paper/contact surface is therefore identity-critical. Transparent export is unavailable in this candidate.

Exact capability consequence:

> Contact Sheet requires one opaque paper/contact surface to preserve whole-sheet identity. Transparent export is unavailable; capability copy must disable alpha export rather than faking transparency. This alpha limitation does not change Project audio intent or create an audio side effect.

The evidence raster at 960×540 reports:

- 0 fully transparent pixels;
- 0 partial-alpha pixels;
- 518,400 opaque pixels.

`evidence/alpha/UNAVAILABLE.md` records the same limitation. No checkerboard/colour composites are fabricated.

## Paper token boundary

The paper surface and cell keylines belong to Scene material identity. Their exact colour must later resolve through one approved material token. The Scene does not expose paper colour, table colour, light temperature, shadow, grain, texture, vignette, or glow controls.

Changing paper material must never alter source pixels. A future dark paper variant would require separate source-readability and catalogue review rather than a casual Look inheritance.

## Contact Sheet versus Light Table

Forbidden defaults:

- illuminated source wells;
- brightness or saturation increase at focus;
- surrounding source dimming;
- halo or bloom;
- translucent sheet;
- loose overlapping frames;
- loupe enlargement;
- random tilt;
- table light or review-room vignette.

These would collapse distinction from Light Table and violate source fidelity.

## Failed media

A failed source retains cell, index, caption, traversal ordinal, and source box. The source well renders a neutral crossed placeholder. No later source moves into its cell.

## Labels and indices

Labels occupy a reserved band outside source pixels. Hiding labels changes only the label band allocation inside a fixed outer cell; outer grid geometry remains stable. The browser prototype draws actual text. The Node raster uses deterministic index marks because it contains no font engine; structural vectors preserve exact label mode and source identity.

## Source video and audio

Video visual time follows reflected Project story time. Mark holds do not pause or restart video. The Scene does not decode/mix audio. Opaque export capability does not mute, remove, or otherwise change Project audio intent.

## Remaining evidence

No external user media, pixel-for-pixel decoded comparison, real browser typography, encoded export, or Product alpha-capability UI ran. S1 must repeat source RGB checks in the real renderer and verify that alpha is disabled honestly.
