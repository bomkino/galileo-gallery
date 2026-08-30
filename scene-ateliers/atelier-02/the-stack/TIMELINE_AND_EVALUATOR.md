# Timeline and evaluator — Calm Stack

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

Rest/breath function is closed at both ends. Reorder owns the cycle-end sample only; z changes under explicit coveredHandoff=true.

Canonical tests sample one output frame before, exactly at, and one frame after every important boundary at 24 fps. The generated `TEST_VECTORS.json` records actual evaluator digests.

## Easing/math

Breath uses b(p)=0.5−0.5cos(2πp), giving identical pose and zero derivative at endpoints. Advancement uses quintic smoothstep with no overshoot.

Primitive formulas are clamped and finite:

- `smooth5(t) = 6t^5 − 15t^4 + 10t^3`, `t∈[0,1]`;
- `lerp(a,b,t) = a + (b−a)t`;
- no unbounded spring integrator, accumulated delta time, or frame-rate-dependent damping.

## Compilation

### Automatic

Advance each included item once, with long rests and one final settled hold.

### Fixed duration

Protect a minimum 55% rest share and all covered handoff minima. Reject targets that turn careful handling into a throw.

Compiler returns a typed rejection with `minimumHonestDurationMs`; it never silently crushes holds or deletes a phase.

### Directed

Use fast ×2, fast ×2, regular ×1, fast ×1 as rest compression, not displacement amplification. Advance path geometry is unchanged.

The Product-directed fast ×2, regular ×1 notation changes travel/transfer pace only. It never changes displacement, z/occlusion logic, source-video time, media order semantics, or control defaults.

## Hold and media-time policy

Most of each cycle is readable rest. Breath reaches zero displacement and zero velocity at hold boundaries.

A pose hold freezes Scene geometry only. Source video and shared G05 audio continue on the exact Product story clock. Reverse changes Scene order/path; it does not rewind source media unless a future explicit Product media-time intent says so.

## Reverse

Supported: reverse order, opposite side corridor, inverse covered handoff, identical calm displacement limits.

Forward terminal and reverse start poses, permutations/focus, and identities are canonical test invariants.

## Loop and terminal sampling

A breath loop is mathematically closed in pose and first derivative. Story cycles remain finite unless Timeline authors a loop.

Finite mode clamps at terminal. Loop mode uses explicit authored seam events; it never applies modulo directly across visible geometry. Fixed-step frame count is `round(durationSeconds × fps)` under shared export policy; evaluator samples exact requested time.

## Play / scrub / fixed-step parity

Prototype `app.mjs`, exact-time slider, real-time play, Node checks, SVG captures, and clip generation all import the same `prototype/evaluator.mjs`. `evidence/parity.json` compares canonical outputs from the three call paths. Equality proves mechanics only, not taste or Product integration.
