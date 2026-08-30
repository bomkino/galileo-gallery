# Source fidelity, alpha, and Look — Light Table

## Binding default

Every imported artwork plane must render with:

```text
opacity: 1
filter: none
mix-blend-mode: normal
colour transform: identity
```

Focus is communicated by frame transform, exterior outline, and light outside the frame. It is never communicated by dimming neighbours, brightening the active artwork, adding a glow filter, or changing saturation.

## Under-light isolation

Prototype structure enforces three siblings per source:

1. under-light geometry;
2. frame/backing geometry;
3. source canvas.

The under-light node sits behind the frame and is expanded beyond its bounds. It cannot be a media ancestor or mask. The media canvas stores generated source pixels before any scene render. Diagnostics hash those canvas bytes after every control/time change and require equality.

## Stable luminance

Light motion is low-frequency and bounded. Evidence measures mean table luminance over a mask excluding all frame rectangles. The maximum-to-minimum difference across canonical samples must remain below the packet threshold of 8/255 linearized display levels. This is an engineering guard, not a human taste verdict.

## Source-contamination fixture

The generated colour-chart source includes:

- saturated red, green, blue, cyan, magenta, and yellow blocks;
- neutral ramp;
- one-pixel black/white edges;
- soft alpha edge inside the source canvas.

Diagnostics compare the source canvas byte hash at every canonical time, control extreme, focus state, and failed-neighbour fixture. No scene layer may change it.

## Alpha policy

Candidate v1 is opaque-only because the illuminated table plane carries the Scene's material identity. There is no honest way to remove it while retaining the same Scene.

Exact capability copy:

> Light Table needs an opaque illuminated surface. Transparent export is unavailable for this Scene. Choose another Scene to preserve alpha.

A transparent request must fail or require explicit Scene replacement. Never flatten without disclosure. Never emit fake transparent pixels over a hidden colour.

## Look boundary

Allowed outside source pixels:

- opaque table colour;
- source-exterior under-light;
- subtle deterministic table-only texture after G10D approval;
- frame backing, outline, and shadow;
- accessible focus ring.

Forbidden:

- media filters or opacity changes;
- colour spill crossing the source rectangle;
- bloom, exposure shift, tint, or blend mode;
- shared grain over source or fully transparent pixels;
- Look logic embedded in this candidate prototype as production contract.

## Audio boundary

No Scene control changes Project audio. Source-video timing follows Product story time. Presenter, soundtrack, master, mute, solo, gain, fades, looping, and ducking remain untouched.
