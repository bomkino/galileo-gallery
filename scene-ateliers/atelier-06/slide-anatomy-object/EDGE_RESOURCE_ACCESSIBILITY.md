# Edge, resource, and accessibility policy — Slide Anatomy

## Source and structure matrix

| Condition | Behaviour |
| --- | --- |
| 0 sources | fail before apply |
| 1 source, no caption | four Project-known presentation-apparatus planes |
| 1 source, caption | Project caption plane added and labelled from Project data |
| 2+ arbitrary sources | first selected source inspected; extras preserved and reported |
| explicit-layer proposal | blocked until approved source-role/schema contract |
| failed source | source plane remains named and failed; apparatus may still separate; no substitute art |
| source video | complete frame follows Product story time |
| transparent source | straight-alpha compositing; no background contamination |
| tiny canvas | reduce lateral spread before source size; keep labels outside source |

## Accessible structure

The stage exposes a text list in back-to-front order. Visual label mode never removes accessible structure. Names are limited to `Backing`, `Source frame`, `Frame edge`, `Safe area`, and `Caption` when present.

Keyboard:

- Tab reaches the single inspection target;
- Enter/Space toggles static separated/resolved manual inspection;
- Escape resolves;
- focus ring remains outside source pixels.

## Reduced motion

Use discrete resolved/separated states and an accessible ordered description. No continuous 3D travel, pulse, or camera motion.

## Resource budget

- one source canvas/video;
- four or five apparatus nodes;
- at most five label nodes;
- no network;
- no WebGL context;
- one request-animation-frame callback only during prototype playback;
- O(1) evaluator state for the consumed source;
- extras remain metadata only.

## Lifecycle

`dispose()` cancels playback, clears the ephemeral manual inspection state, and removes source/apparatus and accessible-structure nodes. `mount()` reconstructs exact poses from source ID, caption presence, controls, and story time. Static control-shell and inspection-target listeners remain bound for the prototype document lifetime; no listener is added per remount. Context loss falls back to the resolved source plus accessible structure description.

## Failure copy

- Zero: `Slide Anatomy needs one source.`
- Extras: `Slide Anatomy inspects one source in v1. Remaining Project media stay preserved.`
- Explicit layers: `Ordered anatomy layers require an approved source-role Project contract.`
