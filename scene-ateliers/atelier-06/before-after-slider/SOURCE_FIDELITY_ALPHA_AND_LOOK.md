# Source fidelity, alpha, and Look — Before / After

## Shared content rectangle

Before and after use the exact same frame bounds, padding, fit policy, alignment, and divider coordinate space. The only source-reveal operation is clipping the before pane. No pane transform, independent scale, or focal drift is allowed.

Clean default:

```text
object fit: contain
alignment: centre
opacity: 1
filter: none
blend: normal
colour transform: identity
```

Current Project schema has no per-source focal point. The Scene does not infer one from image content.

## Presentation layers

Allowed above media:

- divider line;
- handle;
- side labels;
- keyboard focus ring;
- debug alignment grid in prototype evidence only.

These layers do not alter media pixels. Source canvases are hashed before and after all time, control, manual, and failure tests.

## Alpha policy

Transparent source edges may be displayed against the opaque comparison background for diagnostic purposes. Transparent output is unavailable until comparison semantics define compositor background and RGB/alpha comparison meaning.

Exact copy:

> Before / After currently requires an opaque comparison background. Transparent export is unavailable until alpha-comparison semantics are defined.

No silent flattening. No claim that an alpha edge seen over one background represents every compositor.

## Look boundary

Look may style the frame exterior and opaque comparison background. It may not tint either pane, apply different treatment by side, or change divider position. Stable luminance excludes source rectangles and must not create side bias.

## Audio boundary

Source-video panes share Project story time but retain their media IDs and audio identities. Scene does not mix, duck, mute, solo, loop, or offset either source. Product audio remains authoritative.
