# Source fidelity, alpha, and Look — Slide Anatomy

## Source integrity

The source is one complete canvas/video plane. It is never segmented, recoloured, dimmed, filtered, blurred, or labelled by inferred content.

```text
opacity: 1
filter: none
blend: normal
fit/crop: Project-declared
colour transform: identity
```

Prototype diagnostics hash source-canvas bytes at every canonical phase, full control extrema, reduced-motion state, remount, and final resolved frame.

## Final resolved state

At separation progress `0`:

- source local transform is identity;
- apparatus transforms are zero;
- labels are not over source pixels;
- source-canvas hash equals import fixture hash;
- source opacity/filter/blend remain clean;
- preview and exact `t=1` terminal state agree.

## Transparency

Candidate supports transparent output. Apparatus has local pixels only. Empty stage pixels must be RGBA `0,0,0,0`; zero-alpha RGB must be zero. Evidence includes straight-alpha captures composited over black, white, red, blue, and checkerboard plus a PNG scan.

The source fixture includes transparent holes and soft alpha edges. Those pixels remain source-owned.

## Look boundary

Allowed:

- frame/mat colour outside source;
- guide and label strokes owned by apparatus;
- optional G10D-approved background behind the complete object.

Forbidden:

- grain or texture over source;
- lighting through source;
- source colour lift during separation;
- inferred material layers;
- Look logic embedded as production contract in this prototype.

## Audio

Scene leaves Project audio unchanged. Source-video uses Product story time. No layer movement creates sound or audio automation.
