# Edge cases, resources, and accessibility — Contact Sheet

## Source-count policy

| Count | Candidate behaviour |
| ---: | --- |
| 0 | Product capability copy; prototype rejects. No fake empty proof sheet in final Scene. |
| 1 | One large centred proof cell on one opaque sheet. |
| 2 | Balanced two-column sparse sheet. |
| 3–7 | Sparse ordered grid with centred final row. |
| 8–16 | Primary whole-set editorial survey. |
| 17–24 | Dense bounded survey; every source remains visible. |
| >24 | Explicit unsupported boundary. No pagination, hidden page, truncation, or source reorder. |

## Mixed and failed media

Equal outer cells preserve predictable topology. Inner source wells honour declared ratio and contain/cover intent. Landscape, portrait, square, cinematic, and vertical media coexist without masonry packing.

A failed item keeps:

- original ID and Project source index;
- stable row/column cell;
- caption/index band;
- attention traversal position;
- visible crossed placeholder.

## Pagination policy

None. The Scene promises whole-set reading. More than 24 requires capability copy and a user decision to split the Project or choose another Scene. A future paginated proof book would need a new charter covering page topology, transitions, accessibility, export, and seam; it is not smuggled into this candidate.

## Canvas and label pressure

The evidence packet covers 1920×1080, 1080×1920, 1080×1080, and 1080×1350 at one, two, twelve, sixteen, and twenty-four sources. Automatic columns genuinely recompile per canvas. S1 must measure real font metrics and warn or lower maximum when captions cannot meet readability targets; it must not zoom the selected card or hide other cells to compensate.

## Focus and keyboard

- DOM/accessibility order remains Project source order.
- Visual inspection arrows follow the selected traversal.
- Arrow keys advance/retreat through traversal.
- Home/End select source one/final source.
- Animation never moves DOM focus.
- Accessible name includes one-based source index, caption/name, row/column, failed state, and selected mark state.
- Paper, keylines, brackets, and debug path are decorative except where a status label announces the current source.

Source order and traversal must both be understandable: an assistive status can announce “Frame 08 of 12, row 2 column 3, inspection step 8.”

## Reduced motion

The whole sheet remains unchanged. One static bracket marks the explicit selected source. No bracket travel, whole-set expansion, fade, pulse, or source transformation occurs. Keyboard navigation updates the static mark only.

## Resource bounds

- hard maximum: 24 sources;
- evaluator states: exactly accepted source count;
- visible/mounted cells: exactly accepted source count;
- pagination/pages: 0;
- duplicate source identities: 0;
- retained prior frames: 0;
- evaluator timers/listeners: 0;
- masonry/resize observers: 0 in evaluator;
- network requests: 0;
- generated fixture media only;
- bounded 24-source observation: stable cell collection and exact seam.

The browser prototype owns one animation-frame transport callback and removes it on page disposal. Product S1 must release decoded media/proxies, typography caches, and any renderer surfaces on unmount.

## Context loss and fallback

A 2D/CSS grid preserves the complete identity. WebGL is unnecessary. On context loss, render the static opaque sheet with all sources and selected bracket. Never restart with a different column count, traversal, or source order.

## Performance claims not made

No browser heap profiler, long-run remount test, decoded-video stress test, real font measurement, screen-reader run, Product export benchmark, or GPU context-loss harness occurred. This packet proves bounded deterministic state and generated-raster evidence only.
