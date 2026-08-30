# Scene DNA — Open Fan

## Recognition test

### Silhouette-only still

The Scene must be identifiable without artwork, colour, labels, shadows, or texture:

- one low common hinge;
- a broad, symmetric hand of bottom-anchored rectangles;
- card bottoms converging to one point;
- centre-weighted overlap;
- no card on a separate circular track;
- no single crown card implying a moving focus cursor.

A silhouette that looks like a flat row, pile, radial sunburst, or orbit fails.

### Five-second motion crop

Within five seconds a viewer must see:

1. several cards rotate open from one shared hinge;
2. the fan settle rather than continue travelling;
3. one card rise radially from its existing slot;
4. that card return exactly without neighbour reordering.

No continuous selection sweep may occur.

## Invariants

1. `hinge(card_i) = H` before spotlight/finale radial lift.
2. Ordered source index maps to one stable angular slot inside a window.
3. Opening changes slot occupancy amplitude, not source-to-slot assignment.
4. Spotlight path is one-dimensional and reversible: `pose_i(u) = base_i + radial_i * lift(u)`.
5. The centre card or centre pair owns highest base depth; lifted card owns temporary highest depth.
6. Source plane treatment is unchanged at readable hold.
7. Start and end gathered poses match exactly.

## Default silhouette

Recommended five-card silhouette at 16:9:

- hinge: 50% x, 79% y;
- total spread: 135°;
- card width: 36% of short axis;
- outer card angles: approximately ±67.5°;
- centre card upright;
- outer card tops remain inside the safe stage.

Portrait recomposition narrows total spread to approximately 87–92° and reduces mixed-ratio card width to roughly 23–28% before allowing any crop.

## Motion texture

- Entry: resistant paper opening, not spring bounce.
- Settle: one critically damped end; no overshoot required.
- Spotlight: radial, deliberate, reversible.
- Finale: collective geometric bias toward the selected slot.
- Exit: exact inverse closure.
- Ambient: none or a sub-pixel deterministic breath.

## Exclusion signatures

- **Dealer's Pick:** fractional focus advances through ordered cards and repeatedly produces a crown.
- **Quiet Carousel:** cards translate continuously through a linear focus well.
- **Calm Ring:** cards occupy a closed orbital plane with front/rear occlusion.
- **Zoetrope:** cards form a fast cylinder and rotate around its wall.
- **Spiral Vortex:** cards occupy a helix with changing radius/height.
- **Orrery:** a primary body anchors nested satellite paths.

## Deletion test

Delete artwork, Look, captions, shadows, border radius, texture, and all controls except story time. If the remaining rectangles do not still read as one hand opening from a common hinge, the Scene is not authored deeply enough.
