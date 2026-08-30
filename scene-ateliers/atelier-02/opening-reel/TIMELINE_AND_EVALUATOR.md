# Timeline and evaluator — Opening Reel

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

Events own [start,end). At end, the next event owns the sample. Terminal time equals the explicit terminal frame and is never modulo-wrapped unless loop is authored.

Canonical tests sample one output frame before, exactly at, and one frame after every important boundary at 24 fps. The generated `TEST_VECTORS.json` records actual evaluator digests.

## Easing/math

Travel uses a normalized trapezoidal velocity profile. Spotlight/finale scale uses quintic smoothstep; neighbour displacement is causal from selected scale and signed lane distance.

Primitive formulas are clamped and finite:

- `smooth5(t) = 6t^5 − 15t^4 + 10t^3`, `t∈[0,1]`;
- `lerp(a,b,t) = a + (b−a)t`;
- no unbounded spring integrator, accumulated delta time, or frame-rate-dependent damping.

## Compilation

### Automatic

Compile one complete screening over every included beat with minimum readable holds and a single finale.

### Fixed duration

Preserve minimum travel, Spotlight, and finale holds. Reject targets below the computed honest minimum; stretch travel slack and non-final holds proportionally above it.

Compiler returns a typed rejection with `minimumHonestDurationMs`; it never silently crushes holds or deletes a phase.

### Directed

Apply fast ×2, fast ×2, regular ×1, fast ×1 only to the first four travel legs. Additional legs run regular. Spotlight/finale holds remain authored and unscaled.

The Product-directed fast ×2, regular ×1 notation changes travel/transfer pace only. It never changes displacement, z/occlusion logic, source-video time, media order semantics, or control defaults.

## Hold and media-time policy

Spotlight and finale holds freeze geometry while shared source-video time continues.

A pose hold freezes Scene geometry only. Source video and shared G05 audio continue on the exact Product story clock. Reverse changes Scene order/path; it does not rewind source media unless a future explicit Product media-time intent says so.

## Reverse

Reverse reverses included media order, travel direction, Spotlight order, and finale selection. Beat roles stay attached to stable media IDs.

Forward terminal and reverse start poses, permutations/focus, and identities are canonical test invariants.

## Loop and terminal sampling

Default is finite and has no loop. Optional loop inserts an explicit empty-stage seam before the first lead-in; no crossfade.

Finite mode clamps at terminal. Loop mode uses explicit authored seam events; it never applies modulo directly across visible geometry. Fixed-step frame count is `round(durationSeconds × fps)` under shared export policy; evaluator samples exact requested time.

## Play / scrub / fixed-step parity

Prototype `app.mjs`, exact-time slider, real-time play, Node checks, SVG captures, and clip generation all import the same `prototype/evaluator.mjs`. `evidence/parity.json` compares canonical outputs from the three call paths. Equality proves mechanics only, not taste or Product integration.
