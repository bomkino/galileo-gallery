# Timeline and evaluator — Contact Sheet

## Pure input and output

`evaluateScene({ items, controls, timeline, timeMs, width, height, reducedMotion, selectedIndex, debug })` is a pure function. It reads no wall clock, DOM, scroll, hover, pointer, random state, media decoder, font engine, or GPU state.

The result contains:

- normalized phase and named phase;
- exact segment ID, kind, pace, progress, velocity, and reflected story time;
- opaque paper/material state;
- columns, rows, gutter, sheet margin, grid bounds, traversal mode, and traversal order;
- one immutable cell state per source, including ID, source index, row/column, cell bounds, source clip/fit box, label band, failed state, and source treatment;
- registration focus kind, source index, ordinal, x/y, width/height, and transition progress;
- source-video story time when relevant.

Browser preview, scrub, and dependency-free fixed-step capture import this same evaluator.

## Layout compilation

The compiler derives sheet margin and gutter from the canvas short axis. Automatic columns evaluate discrete candidates from two to six using:

- available grid dimensions;
- target cell aspect for canvas orientation;
- empty-slot cost;
- excessive-row penalty;
- positive cell-size requirement.

User-selected columns are discrete 2–6 and bounded by source count. Rows are `ceil(count / columns)`. Cells use equal width/height. The final row is centred as a row without changing source IDs or order. One always compiles one column; two automatically compile two.

Source fitting is independent of cell placement. Each cell reserves an optional label band, then calculates contain or cover geometry inside a clipped source well. No cell motion exists in the evaluator.

## Traversal compilation

The base cell topology always stores sources in Project order. Traversal maps attention ordinals to source indices:

- row-major: `0,1,2…`;
- serpentine: alternate rows reverse attention direction;
- column-major: visit each column top-to-bottom, then move right.

Changing traversal changes no cell coordinate, source index, row, column, label, or source box. It changes only which cell the mark visits next.

## Automatic timeline

For each attention ordinal:

- inspection hold: 600 ms;
- travel to next ordinal, except after the last: 420 ms.

After the final inspection:

- finale expand: 620 ms;
- whole-set hold: 1,000 ms;
- return to first: 680 ms.

The recommended twelve-source automatic phrase lasts 14,420 ms.

## Fixed duration

All automatic segments scale proportionally to exactly 16,000 ms. The compiler preserves segment order, traversal ordinal, whole-set finale, and exact seam. This is an atelier fixture, not a Product default.

## Directed timeline

Attention ordinals repeat:

1. quick — 340 ms hold, 280 ms travel;
2. quick — 340 ms hold, 280 ms travel;
3. regular — 700 ms hold, 500 ms travel;
4. quick — 340 ms hold, 280 ms travel.

The whole-set gather, finale, and return remain 620/1,000/680 ms in directed mode. Directed mode changes attention cadence only; it never changes grid geometry or source treatment.

## Mark evaluation

- Hold: brackets match the selected cell aperture exactly.
- Travel: bracket rectangle interpolates position and dimensions between source apertures using smootherstep.
- Finale expand: brackets interpolate from final cell to grid perimeter.
- Whole-set hold: brackets remain on the full grid bounds.
- Return: brackets contract from grid perimeter to source one.

Only apparatus geometry moves. The evaluator does not emit per-cell focus scale, opacity, lift, filter, or z change.

## Reverse

Reverse maps sampled time to `duration − t` modulo duration, evaluates the same segment list, and negates velocity. Forward at `t` equals reverse at `1 − t` for cells, focus geometry, traversal, and source-video frame time within numeric tolerance.

## Reduced motion

Reduced motion ignores timeline focus movement and places one static bracket on the explicit keyboard-selected source. The entire grid and source-video story-time mapping remain. It does not show the whole-set finale automatically because that would introduce motion/state changes unrelated to user selection.

## Seam

At normalized 0 and 1:

- every cell x/y/width/height matches exactly;
- source order, traversal order, labels, and failed slots match;
- registration brackets match source one exactly;
- opaque paper state matches;
- source treatment remains opacity 1, filter `none`, normal blend.

Captured diagnostics report zero cell position/size delta and zero focus position/size delta. The `0.999999` sample remains in the deterministic return-to-first segment immediately before exact closure.

## Test-vector policy

`TEST_VECTORS.json` uses canonical normalized timestamps plus every recommended-phrase segment boundary. Expected outputs are numeric or structural: phase, segment, pace, selected index, columns/rows, grid bounds, identity/traversal order, focus bounds/kind, cell positions, failed state, labels, opaque-surface truth, and source treatment. It contains no source-string/code assertions.

## Limitations

The evaluator does not modify Product Timeline schema, Project schema, registry, central renderer, audio, export, or packaging. Generated raster evidence does not prove browser font metrics, decoded external media, encoded Product export, or human taste.
