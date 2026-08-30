# Edge, resource, and accessibility policy — Ribbon / Two-lane Filmstrip

## Edge behavior

- 0: empty two-lane world; no cards invented.
- 1: one media identity, two render instances.
- 2: one identity per lane.
- 3–256: stable parity streams; bounded repeated instances fill only the stage guard band.
- Mixed-ratio lanes normalize to one shared extent, preserving equal real speed.
- Failed/video/alpha sources retain source identity and order.

Lane count is not a control. High speed, large frames and tight separation may become unreadable; Product pace and human acceptance own that limit.

## Accessibility and reviewer UX

The workbench exposes Frame size, Minimum gap, Lane separation and Lane offset with numeric readback, Reset, named phases, exact scrub, canvas, direction, silhouette, composites, count and reduced motion. Forward/reverse status uses arrows rather than implementation signs. Animated status is not live; reduced motion pauses play and freezes deterministic landmarks.

## Resource/lifecycle

Virtual instances are capped at 48 repeats per source stream and only exist to cover the guard band. A future renderer mounts visible instances only, reuses decodes, pauses hidden video, cancels callbacks and disposes media/context resources.
