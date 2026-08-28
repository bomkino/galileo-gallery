# The Orrery — timeline and evaluator

## Gate

This remains a **G10B preflight candidate; implementation blocked by G10A**. The evaluator is laboratory truth only.

## Inputs

`timeMs`, ordered media identities, ring membership, signed ring periods, ring spread/tilt, primary scale, exchange duration, primary hold, direction, Timeline mode, canvas dimensions, fit, background, and reduced-motion flag.

## Topological loop

One full Scene loop must satisfy both conditions:

1. every media identity has inherited the primary exactly once; and
2. every orbital ring has completed an integer number of signed revolutions.

For `count` media, primary exchange phase is `phase × count`. Ring turns are integer signed multipliers of the same normalised phase, such as `+1`, `−2`, and `+3`. Non-integer turns are rejected because exact `t = duration` equality can hide an epsilon seam immediately before the loop.

## Identity-preserving exchange

Let `primary = floor(exchangePhase) mod count` and `incoming = (primary + 1) mod count`. A monotonic bounded exchange curve moves the incoming media object from its ring transform to the centre while scaling continuously to primary scale. Simultaneously, the outgoing primary object moves from centre to its own ring transform. At the boundary:

- incoming position and scale equal the new primary state;
- outgoing position and scale equal its ring state;
- media IDs never swap between substitute objects;
- source treatment remains unchanged.

## Timeline modes

- Automatic: one complete topological loop.
- Fixed duration: same complete topology at a different rate.
- Directed: explicit complete-cycle and hold segments only. A segment may not truncate ring closure or an exchange.
- Reverse: inverse ring turns and inverse exchange order along the same paths.
- Spotlight: finite seek to one identity, centre hold, and inverse release without changing ring membership.

Casino rhythm is not automatic. If approved later, fast ×2, regular ×1, fast ×1 must compile to complete topology.

## Reduced motion

Use stable system tableaux: one primary and fixed satellite positions, then a discrete identity-preserving exchange at an announced boundary. No continuous orbital drift.

## Renderer parity

DOM and WebGL comparison consume the same primary ID, ring IDs, matrices, z-order, and source-treatment result. Renderer code cannot own time, camera, exchange identity, or loop topology.

## Adversarial sampling

Check every exchange at `boundary−ε`, `boundary`, and `boundary+ε`; loop at `duration−ε`, `duration`, and `0+ε`; ring closure; reverse; one/two/18/72 media; all canvas ratios; reduced motion; context loss; remount; input immutability; deterministic repeat.
