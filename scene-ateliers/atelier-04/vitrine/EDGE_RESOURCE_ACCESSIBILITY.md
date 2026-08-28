# Vitrine — edge, resource, and accessibility policy

## Edge cases

- **0 items:** explicit empty chamber state.
- **1 item:** true still primary; no duplicate, fade, or fake exchange.
- **2 items:** complete Scene expressed through reciprocal exchange.
- **Recommended:** 2–12 media.
- **Bounded many:** 24 identities queued outside the visible chamber; at most two media planes mounted during exchange plus decode overscan.
- **Mixed ratios:** natural orientation inside a bounded primary envelope.
- **Failed media:** stable ID, queue position, readable placeholder, and full hold duration.

## Resources

The canonical renderer is DOM. At most current, next, and one decode-prepared neighbour require live media resources. Videos outside the active/near queue pause according to Product policy. ResizeObserver, media listeners, requestAnimationFrame, timeout, and keyboard listeners are removed on unmount. No perpetual animation runs during still holds; the stage renders once and sleeps until the next boundary or input change.

## Accessibility

Playback and scrub belong to Timeline/review transport. Focus remains in stable controls, never on moving artwork. The current identity and exchange status are announced outside the stage. Reduced motion preserves long holds and uses a discrete identity change at a known boundary. Controls have visible focus, readable labels, 44 px targets, and no colour-only state.

## Fallback

Without transforms, show the exact current media identity sampled from the evaluator and perform discrete boundary replacement. The fallback preserves Vitrine’s stillness rather than becoming a fading slideshow.
