# Spiral Image Vortex — source fidelity, alpha, and Look

Imported artwork remains source RGB at opacity 1 with normal blend and filter none. Depth is expressed through geometry and occlusion only. The renderer must not tint, light, blur, grain, vignette, border, reflect, desaturate, wash out, or multiply source pixels.

Transparent output clears to RGBA zero. Fully transparent pixels contain zero RGB. Soft alpha edges are checked over black, white, red, blue, and checkerboard. The generated WebGL atlas probe uses `outColor = vec4(source.rgb, source.a × visibility)`; visibility may hide a fully offstage wrap but never grades visible source RGB.

A future Look remains behind or around artwork. Deterministic world animation and decorrelated grain are separate passes and excluded from transparent pixels. Stable luminance is required through front/back crossings.

Failed media retain stable helix identity and order. Source-video time comes from Product story time. `contain` is default; `cover` is explicit and independent of Project canvas ratio.

Promotion evidence must include real imported images/videos, decoded RGB comparison, alpha composites, offstage-wrap captures, and human confirmation that rear depth does not read as source dimming.
