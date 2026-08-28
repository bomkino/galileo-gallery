# The Shelf — timeline and evaluator

## Inputs

`timeMs`, ordered media identities and ratios, shelf baseline, edition height, gap, perspective, traversal pace, Spotlight lift/straighten, caption space, direction, Timeline mode, canvas dimensions, fit, background, and reduced-motion flag.

## Pure shelf layout

Each edition width derives from clamped source ratio × common edition height. Cumulative natural widths and gaps define stable path distance. Story time maps to one signed path offset. Every edition’s centre, yaw, scale, z-order, visibility, and caption anchor derive from stable media identity and path distance—not DOM index after windowing.

The loop contains a full offstage lead on both sides of the content run. Recycling is legal only when the complete edition and its caption envelope are beyond the visible shelf plus overscan. The evaluator retains all identities even when the renderer mounts a bounded window.

## Timeline modes

- Automatic: one complete traversal returning all identities to equivalent positions.
- Fixed duration: same path, spacing, and Spotlight topology at a different rate.
- Directed: explicit traversal, Spotlight, holds, and Finale segments.
- Reverse: exact inverse path and identity order.
- Casino rhythm: only when approved Product intent preserves complete traversal and offstage seam.

## Spotlight

Select by stable media ID. Compile:

`seek along shelf → freeze base travel → yaw straighten + vertical lift → hold → lower + yaw restore → exact shelf rejoin → resume base travel`.

The selected edition remains the same object throughout. Rejoin position, velocity, yaw, scale, and z-order equal the base shelf state at the phase boundary.

## Finale handoff

Finale consumes the exact terminal Spotlight state. It may continue the selected edition, settle the complete shelf, or exit the collection according to a future approved charter. It may not:

- discard focus before the handoff;
- lift a neighbouring edition;
- reverse vertical direction for one frame;
- snap scale, yaw, or position;
- change selected identity.

The candidate evaluator resumes base shelf travel at the Finale boundary from the exact frozen path offset.

## Reduced motion

Present stable shelf tableaux. Spotlight changes through a discrete selected state with caption announcement. No continuous shelf travel or moving focus.

## Adversarial checks

Every recycling event; Spotlight seek/lift/hold/lower/rejoin boundaries at `±ε`; Spotlight→Finale boundary; one/two/recommended/127 media; mixed ratios; reverse; reduced motion; canvas ratios; failed media; caption bounds; remount/disposal; deterministic repeat; input immutability.
