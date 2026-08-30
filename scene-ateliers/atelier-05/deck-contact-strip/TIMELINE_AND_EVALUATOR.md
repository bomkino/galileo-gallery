# Timeline and evaluator — Focus Strip

## Pure input and output

`evaluateScene({ items, controls, timeline, timeMs, width, height, reducedMotion, selectedIndex, debug })` returns structural state only. It reads no wall clock, DOM, animation frame, scroll position, pointer, random source, media decoder, or GPU state.

The returned state includes:

- normalized phase and named segment;
- segment kind, pace, local progress, and deterministic velocity;
- selected source index and continuous track progress;
- fixed station geometry and canvas axis;
- one ordered card record per source, including ID, source index, position, documentary-frame size, inner source box, station distance/envelope, focus lift, visibility, failed state, labels, and source treatment;
- source-video story timestamp where relevant.

Browser preview, scrub, and fixed-step capture import this same evaluator.

## Timeline compiler

### Automatic

For each source:

- hold: 650 ms;
- travel to next: 550 ms.

One source compiles to one 8,000 ms hold. The automatic eight-source fixture therefore lasts 9,600 ms.

### Fixed duration

The complete raw phrase is scaled proportionally to exactly 14,000 ms. Hold/travel order, source order, and station positions remain identical. This is an atelier fixture demonstrating exact retiming, not a Product duration default.

### Directed

Per-source rhythm repeats:

1. quick — 420 ms hold, 360 ms travel;
2. quick — 420 ms hold, 360 ms travel;
3. regular — 760 ms hold, 620 ms travel;
4. quick — 420 ms hold, 360 ms travel.

The compiler stores the literal pattern `quick, quick, regular, quick`. Directed mode changes inspection cadence, not layout, source order, card size, or station geometry.

## Temporal evaluation

During a hold, track progress is exactly the held source index and velocity is zero. During travel, progress moves from `i` to `i + 1` using smootherstep. The derivative reaches zero at both endpoints, so a card arrives at station without a velocity discontinuity.

Reverse maps sample time to `duration − t` modulo duration, evaluates the same forward phrase, and negates velocity. This gives exact retrace even though holds and travels have unequal lengths. No reverse-only route or reordered segment list exists.

## Spatial evaluation

The evaluator decides horizontal/vertical from canvas orientation, compiles equal outer documentary-frame dimensions from cross-axis size, scales design-pixel gap from the same cross-axis, and places the station at a bounded axis percentage.

Track length is the larger of:

- natural source spacing × source count; or
- an offstage-safety minimum covering both station-to-edge distances plus frame margin.

Each card receives one wrapped along-axis coordinate. Wrapping occurs only across the far offstage half. The renderer need not create duplicate identities. Station envelope derives solely from distance to station. Focus lift applies perpendicular to the track and never changes source opacity/filter.

## One, two, many

- One: `trackProgress = 0`, card exactly at station, no travel fiction.
- Two: long track minimum prevents visible ping-pong; both move one direction and wrap offstage.
- Recommended eight: local sequence context around station.
- Bounded 24: all identities remain in output order; later renderer mounts only visible/offstage-margin cards.

## Seam

At normalized 0 and 1:

- source one is registered;
- track progress is zero modulo source count;
- card positions and visibility match exactly;
- station geometry matches exactly;
- identity order and failed slots match;
- source treatment remains opacity 1, filter `none`, normal blend.

Captured seam diagnostics report 0 px maximum start/end card delta, 0 px station delta, and 0 visibility mismatches. The `0.999999` sample approaches track progress 8 for the eight-source fixture, which is equivalent to zero on the circular track.

## Reduced motion

Reduced motion bypasses temporal track progress and uses the explicit keyboard-selected index. The selected source is placed statically at station; all others keep stable ordered offsets. Source-video time still follows Product story time. No opacity transition substitutes for movement.

## Test-vector policy

`TEST_VECTORS.json` is generated from canonical normalized timestamps and phase boundaries. Expected values are numeric/structural outputs: phase, segment, pace, selected index, track progress, orientation, station coordinates, identity order, failed slot, visible count, focused IDs, card coordinates, and source treatment. There are no source-string assertions.

## Limitations

The atelier compiler models one repeating phrase. It does not alter Product Timeline schema, once-mode terminal semantics, export integration, audio, or registry. Browser text/font metrics and real decoded media remain downstream S1 evidence.
