# Vitrine — timeline and evaluator

## Inputs

`timeMs`, ordered media identities, hold duration, exchange duration, approach distance, primary scale, exchange axis, direction, Timeline mode, canvas dimensions, fit, background, and reduced-motion flag.

## Compilation

For `count > 1`, one item phrase is `holdMs + exchangeMs`. One full loop is `count × phraseDuration`; every identity receives one complete still hold and one outgoing exchange. For one item, duration remains finite but the artwork transform is constant.

Automatic mode uses the complete loop. Fixed-duration mode scales hold and exchange while preserving minimum 600 ms still hold and 280 ms exchange; an impossible target fails honestly. Directed mode accepts explicit complete holds/exchanges. Casino rhythm is not an honest default and is not compiled unless a future approved charter explicitly asks for it.

## Pure evaluation

1. Resolve stable current and next media IDs from story time and direction.
2. During hold, current transform is the exact primary transform and velocity is zero.
3. During exchange, evaluate one monotonic eased scalar `p`.
4. Current moves from primary to departure transform while next moves from approach transform to primary.
5. Scale, position, visibility, and z-order derive from the same `p`.
6. At `p = 1`, next exactly equals primary; current exactly equals departure. No frame substitutes, crossfade, or opacity grading.
7. At a finite endpoint, return the endpoint unless loop sampling is explicitly requested.

## Playback scheduling

The renderer performs no animation-frame work during a still hold. It renders the stable state once, schedules the next phase boundary, then resumes frame sampling only during exchange. Scrub and fixed-step export still sample the same evaluator directly.

## Spotlight

Spotlight may change the queued target only at a stable hold boundary. It compiles the shortest ordered sequence of complete exchanges, then holds the selected identity. It never snaps the selected media into the chamber.

## Reverse

Reverse swaps order and inverts the physical paths. It does not mirror an unrelated animation.

## Reduced motion

Retain genuine still holds. At the exchange boundary, replace the identity discretely and announce it outside the stage. No fade, zoom, or partial travel.

## Required continuity checks

Every hold/exchange boundary at `±ε`; full loop seam; one item; two items; 24 items; reverse; Spotlight target; reduced-motion boundary; all canvas ratios; failed media; source video; remount/disposal. The evaluator must remain deterministic and input-immutable.
