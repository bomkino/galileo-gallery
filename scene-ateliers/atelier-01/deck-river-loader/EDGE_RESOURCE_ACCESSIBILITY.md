# Edge, resource, and accessibility policy — Deck River / Chapter Reveal

## Edge behavior

- 0: empty finite phrase; Product should disable target selection.
- 1: one source travels, arrives, holds and takes over.
- 2: one support plus target.
- 3–256: stable source order; all non-targets clear through physical corridor motion.
- Automatic chooses the last unmuted source. Valid directed target is preserved.
- Failed target policy remains Product-owned. Video and alpha remain source-faithful.

Fixed/directed duration below the six-stage minimum is rejected, not silently compressed. Supporting frames may not be hidden merely because acquire began.

## Accessibility and reviewer UX

The workbench exposes five geometry controls, target selection, named stage buttons, exact scrub, replay, visual-only Skip to acquire, canvas, direction, silhouette, composites, count, Reset and reduced motion. Reduced motion pauses transport and presents the selected static arrival. Animated status is not live; one throttled live region announces discrete actions.

Skip never implies audio mute or source seek. Moving stage media is not focusable.

## Resource/lifecycle

One pose per source; no loop clones. A future renderer unmounts sources only after geometric clearance, reuses decodes, pauses hidden video, cancels callbacks and disposes graphics/media resources. Evidence is one full finite phrase plus 250 ms, not a production heap soak.
