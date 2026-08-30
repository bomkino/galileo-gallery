# Timeline and evaluator — Coverflow Gallery

## Pure boundary

```text
compileTimeline({ mode, orderedMedia, direction, fixedDurationMs, directedSegments, fps, sceneParameters, authoredRolesOrActions })
  -> { durationMs, terminalTimeMs, events[], minimumHonestDurationMs, frameCount, rejection? }

evaluate({ compiledTimeline, storyTimeMs, stageWidth, stageHeight, orderedMedia, sceneParameters })
  -> { phase, phaseProgress, permutationOrFocus, cards[], renderPolicy, sourceVideoTimes, terminal }
```

No input or output includes wall clock, requestAnimationFrame state, DOM measurement/query, React lifecycle, random value, live GPU state, CSS transition progress, host path, Interface Scale, or raw pointer samples.

## Canonical units

- Story time: integer/rational milliseconds; fixed-step samples at `n / fps` seconds.
- Geometry: normalized stage fractions, converted once using evaluated output width/height.
- Rotation/yaw: degrees.
- Scale: unitless.
- Z: explicit integer bands.
- Media time: `sourceOffsetMs + max(0, storyTimeMs)`; media decoder looping/clamping belongs to shared Product media/audio policy.

## Phase ownership

At transition end, virtual focus is exactly an integer and the dwell event owns the sample. Representative wrap changes only when abs(offset) > visibleRange + 1.

Canonical tests sample one output frame before, exactly at, and one frame after every important boundary at 24 fps. The generated `TEST_VECTORS.json` records actual evaluator digests.

## Easing/math

Virtual focus moves with quintic smoothstep between integer stops. Side x, scale, projected yaw, and z are pure functions of signed offset; wrap representatives change only offstage.

Primitive formulas are clamped and finite:

- `smooth5(t) = 6t^5 − 15t^4 + 10t^3`, `t∈[0,1]`;
- `lerp(a,b,t) = a + (b−a)t`;
- no unbounded spring integrator, accumulated delta time, or frame-rate-dependent damping.

## Compilation

### Automatic

Visit each item once through discrete stops, then hold the final focus.

### Fixed duration

Protect settle and dwell minima. Compress only between-stop travel; reject targets that erase front stops.

Compiler returns a typed rejection with `minimumHonestDurationMs`; it never silently crushes holds or deletes a phase.

### Directed

Fast ×2, fast ×2, regular ×1, fast ×1 applies to traversal durations; every front dwell keeps its minimum.

The Product-directed fast ×2, regular ×1 notation changes travel/transfer pace only. It never changes displacement, z/occlusion logic, source-video time, media order semantics, or control defaults.

## Hold and media-time policy

Dwell fixes geometry at an integer focus coordinate. Source-video time continues.

A pose hold freezes Scene geometry only. Source video and shared G05 audio continue on the exact Product story clock. Reverse changes Scene order/path; it does not rewind source media unless a future explicit Product media-time intent says so.

## Reverse

Supported by signed virtual focus progression and inverse shortest-path intent.

Forward terminal and reverse start poses, permutations/focus, and identities are canonical test invariants.

## Loop and terminal sampling

For 3+ items, wrap representative changes occur beyond visible range. Two items use a bounded ping-pong sequence to avoid direction ambiguity.

Finite mode clamps at terminal. Loop mode uses explicit authored seam events; it never applies modulo directly across visible geometry. Fixed-step frame count is `round(durationSeconds × fps)` under shared export policy; evaluator samples exact requested time.

## Play / scrub / fixed-step parity

Prototype `app.mjs`, exact-time slider, real-time play, Node checks, SVG captures, and clip generation all import the same `prototype/evaluator.mjs`. `evidence/parity.json` compares canonical outputs from the three call paths. Equality proves mechanics only, not taste or Product integration.
