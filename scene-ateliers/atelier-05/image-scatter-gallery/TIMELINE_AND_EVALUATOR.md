# Timeline and evaluator — Lively Prints

## Boundary

`evaluateScene()` is pure. Browser play, scrub, fixed-step capture, test vectors, reduced motion, and debug geometry all call it. Story time, canvas, ordered media, controls, timeline, and selected index are explicit inputs.

It reads no wall clock, pointer, DOM layout, random state, prior frame, network, or media element.

## Cohort compiler

Maximum accepted identities: 24. Maximum active/renderable: 12.

```text
cohort = floor(sourceIndex / 12)
slot = sourceIndex mod 12
```

Cohorts are contiguous and preserve source order. Every source retains a state record at every frame; inactive cohort cards are marked invisible and remain at deterministic owned-edge positions. This is bounded rendering, not identity truncation.

Automatic duration is 9,000 ms × cohort count. Fixed retimes all cohorts to 16,000 ms. Directed compiles fast ×2, regular ×1, fast ×1 across complete cohort cycles.

## Route compiler

Each slot receives an edge from a four-edge grammar and a stable lane. It receives a field zone from a bounded twelve-zone composition. Negative-space enforcement pushes a field centre outside the selected ellipse if required. This happens once at compilation, never per frame.

Route character changes only cubic control points:

- arcs alternate bend direction;
- diagonals use collinear control points;
- hooks turn around the approach vector.

Endpoints and route IDs remain equal across route characters.

## Phase map

| Range | Phase | Evaluator consequence |
| --- | --- | --- |
| 0.00–0.22 | assigned-arrivals | smootherstep along owned edge→field curve |
| 0.22–0.72 | field-exchange | stable field + small deterministic circulation + source-order focus lift |
| 0.72–0.86 | field-finale | circulation damps; final source attention rises |
| 0.86–1.00 | owned-return | same route geometry evaluated field→edge |

At 0 and 1, active cards occupy equal offstage states and are not visible. The next cohort can begin without an on-canvas teleport.

## Local circulation

Circulation uses stable index-derived phase and integer harmonics. Energy scales amplitude only. It does not change zone, route ownership, cohort, source order, focus order, or seam state. Finale damps circulation before exit.

## Focus

Focus traverses active cohort source order. One card enters a separate focus plane and receives physical lift. Non-focused z roles stay stable. No brightness, opacity, filter, blur, glow, or global scale is used.

## Reverse

Reverse evaluates the compiled logical cycle sequence backward. It retraces each route and cohort order from explicit story time. It is not a second simulation.

## Negative-space proof

At every canonical timestamp, visible card field centres are tested against the normalized exclusion ellipse. The minimum allowed normalized distance is 1.1 in the prototype. Debug evidence overlays the exclusion and route ownership lines.

## Source-video time

Video source time is positive-modulo or clamped story time. The Scene exposes requested time only. Product decode, caching, audio, and export remain outside the atelier.

## Tests

`verify.mjs` checks:

- exact seam and route IDs for all fixtures;
- one poster arrival and two-source opposition;
- 24 identities, ≤12 visible, 24 unique route IDs;
- negative-space preservation at canonical times;
- causal route character, energy, and lift;
- reduced-motion time invariance;
- forward/reverse equality;
- deterministic source-video time;
- bounded 2,000-frame observation.

`TEST_VECTORS.json` stores normalized inputs and expected numeric/structural outputs. These are atelier-local and non-runtime.
