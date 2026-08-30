# Source fidelity, alpha, and Look boundary

## Clean source contract

- opacity `1`
- filter `none`
- normal blend
- no crop unless source/frame intent explicitly requests it
- no tint, brightness shift, blur, vignette, shadow wash, grain, dirt, border, sprocket, caption, or faux film texture
- no lane-based dimming or hierarchy

The Scene may clip only at the outer canvas and at each source rectangle. Soft alpha passes through unchanged. Failed media uses an identity-preserving neutral placeholder with the same evaluated geometry.

## Look ownership

Background, paper/material field, stable luminance, deterministic phase, and decorrelated grain belong to future G10D Look. The Scene may expose transparent output but cannot paint a checkerboard or film surface into export pixels.

Alpha evidence must composite the same transparent capture over black, white, red, blue, and checkerboard. Fully transparent pixels must retain zero RGB when Product export is eventually tested. This atelier's generated canvas captures test composition, not encoded Product alpha.

## Video and audio

Video is sampled at exact global story time, including holds and reverse visual travel. Visual reverse never reverses media playback unless Product media policy separately says so. Audio remains a Product service and is never muted by visual fallback or skip.
