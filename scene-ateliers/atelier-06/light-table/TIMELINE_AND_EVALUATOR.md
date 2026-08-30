# Timeline and evaluator — Light Table

## Contract shape

The prototype has one local compiler and one pure evaluator. The browser UI, scrubber, keyboard focus, canonical vector checks, and fixed-step capture all call that evaluator. CSS transitions, timers, pointer inertia, request-animation-frame state, and DOM measurement never become story truth.

```text
compileTimeline(intent, sourceCount, controls) -> compiled timeline + issues
evaluate(compiled, normalizedTime, source descriptors, options) -> complete frame state
render(frame state) -> DOM/canvas only
```

The proposed schema is atelier-local and non-runtime.

## Default six-source phrase

| Range | Phase | Exact duration | Evaluated meaning |
| --- | --- | ---: | --- |
| 0.00–0.10 | `wake` | 1,000 ms | subtle surface wake; frames remain source-safe |
| 0.10–0.78 | `review` | 6,800 ms | ordered focus route through already-resting sources |
| 0.78–0.92 | `final-inspection` | 1,400 ms | final valid source gets the strongest exterior light/outline |
| 0.92–1.00 | `return` | 800 ms | emphasis and nudge return continuously to the neutral seam |

`evaluate(0)` and `evaluate(1)` return identical frame centres, rotations, scale, z, focus, drift, and under-light. Normalized `1` reports a terminal seam state while sampling the exact start pose.

## Pure topology

- One, two, five, and six sources use explicit normalized arrangements.
- Seven through twenty-four use a deterministic ratio-aware review grid with centred partial rows, bounded source-index micro-jitter, and bounded rotation. It is not an indexed Contact Sheet: no row labels, repeated cells, or scan order is rendered.
- Frame size derives from source ratio, canvas ratio, and count. Every computed rectangle must remain on-canvas.
- Independent rectangle geometry measures pair intersections. At the maximum overlap control, the tested 12/24-source matrix across 16:9, 9:16, 1:1, and 4:5 must remain at or below `0.22` maximum occlusion.
- Stable source order creates stable z-order. Focus adds one transient depth band but never mutates Project order.
- Drift uses deterministic integer-frequency terms. Equal sources, controls, canvas, and time always produce equal output.

## Duration compiler

Automatic duration:

```text
clamp(6,880 + 520 × visibleSourceCount, 8,000, 18,000) ms
ordinary six = 10,000 ms
```

Readable floor:

```text
max(6,000, 1,200 + 680 × visibleSourceCount) ms
```

The floor is count-aware: six sources require `6,000 ms`; twenty-four require `17,520 ms`. Fixed-duration requests compile between the count floor and `60,000 ms`. Requests below the floor emit `duration-below-readable-minimum`; requests above the maximum emit `duration-above-supported-maximum` and clamp.

Directed mode requests 2× pace for `wake` and `return`, keeps `review` and `final-inspection` regular, and records requested plus achieved pace for every segment. Readability minima win over nominal speed.

## Reverse

Reverse samples the same evaluator at `1 - t`. Source IDs and route order are not relabelled. Velocity and focus transit reverse; the physical topology remains the same.

## Manual focus

Keyboard focus is an explicit preview override, `manualFocusIndex`. It is bounded, deterministic, and does not mutate compiled story time. It is not exported unless a later approved Timeline contract serializes authored focus. Dragging, throwing, and momentum remain excluded.

## Numeric output

Each evaluated frame includes:

- stable source ID/index and failed/video status;
- normalized centre, width, ratio, rotation, and scale;
- stable/transient z and focus weight;
- under-light opacity and exterior expansion;
- media state `{ opacity: 1, filter: "none", blend: "normal" }`;
- independent layout metrics: maximum occlusion, intersection count, and out-of-bounds count.

## Fixed-step mapping

Future Product export samples frame `n` at story time `n / fps`. The isolated capture runner follows the same rule. This packet does not claim Product export integration.
