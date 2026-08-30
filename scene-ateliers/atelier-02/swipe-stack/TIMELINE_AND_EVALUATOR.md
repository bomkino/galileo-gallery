# Timeline and evaluator — Swipe Stack

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

Permutation changes only at cycle end. The active card’s z-band changes inside occlusion crossing only when the evaluator also emits occluded=true. [start,end) ownership prevents double identities.

Canonical tests sample one output frame before, exactly at, and one frame after every important boundary at 24 fps. The generated `TEST_VECTORS.json` records actual evaluator digests.

## Easing/math

Flight uses a bounded cubic arc with explicit front/rear z bands. Settle uses a finite critically damped approximation with zero endpoint error; permutation is discrete only at cycle end.

Primitive formulas are clamped and finite:

- `smooth5(t) = 6t^5 − 15t^4 + 10t^3`, `t∈[0,1]`;
- `lerp(a,b,t) = a + (b−a)t`;
- no unbounded spring integrator, accumulated delta time, or frame-rate-dependent damping.

## Compilation

### Automatic

Compile one cycle per media item up to the bounded 24-item maximum, followed by finale hold and exit.

### Fixed duration

Reject targets that cannot retain occlusion, rear-tuck, and settle minima. Scale rests first, then flight within bounded character limits; never collapse phases.

Compiler returns a typed rejection with `minimumHonestDurationMs`; it never silently crushes holds or deletes a phase.

### Directed

Compile exactly four authored cycles when media allows: fast ×2, fast ×2, regular ×1, fast ×1. With fewer items, repeat identities through explicit permutations; with one item use press-return only.

The Product-directed fast ×2, regular ×1 notation changes travel/transfer pace only. It never changes displacement, z/occlusion logic, source-video time, media order semantics, or control defaults.

## Hold and media-time policy

A bounded rest separates authored cycles. Holds do not pause source-video story time.

A pose hold freezes Scene geometry only. Source video and shared G05 audio continue on the exact Product story clock. Reverse changes Scene order/path; it does not rewind source media unless a future explicit Product media-time intent says so.

## Reverse

Supported as the mathematical/physical inverse: inverse permutation, opposite throw, rear-to-front emergence, inverse deck retreat, and exact start pose.

Forward terminal and reverse start poses, permutations/focus, and identities are canonical test invariants.

## Loop and terminal sampling

Finite by default. Loop returns only from fully offstage exit to fully offstage entry with identical permutation policy.

Finite mode clamps at terminal. Loop mode uses explicit authored seam events; it never applies modulo directly across visible geometry. Fixed-step frame count is `round(durationSeconds × fps)` under shared export policy; evaluator samples exact requested time.

## Play / scrub / fixed-step parity

Prototype `app.mjs`, exact-time slider, real-time play, Node checks, SVG captures, and clip generation all import the same `prototype/evaluator.mjs`. `evidence/parity.json` compares canonical outputs from the three call paths. Equality proves mechanics only, not taste or Product integration.
