# The Shelf — source fidelity, alpha, and Look

## Clean source contract

Imported artwork remains opacity 1, normal blend, and filter none. Natural width comes from source ratio. Perspective, Spotlight straighten, and lift change geometry only. No border, paper texture, shelf shadow wash, lighting, tint, blur, grain, reflection, vignette, desaturation, or opacity depth fade touches artwork by default.

## Alpha

Transparent output removes the shelf world and clears to RGBA zero. Every fully transparent pixel has RGB zero. Soft edges and transparent source artwork are checked over black, white, red, blue, and checkerboard. Captions and optional world elements have explicit export inclusion; they never leak RGB under zero alpha.

## Look boundary

A future Look may place a deterministic shelf line, wall, map, grid, or material field behind or around editions. It cannot alter source pixels. Decorative grain is a separate decorrelated background pass, stable in luminance, and absent beneath alpha zero.

## Media policy

`contain` is default. Explicit `cover` remains per-frame intent. Failed media preserve stable ID, natural placeholder ratio and width, caption, Spotlight eligibility, and order. Source-video frames follow Product story time and audio truth.

## Evidence required

Real mixed-ratio media; natural-width measurements; decoded RGB/alpha comparison; transparent composites; offstage recycling; Spotlight/Finale continuity; captions; failed media; source video; human confirmation that perspective reads as physical shelf geometry rather than artwork grading.
