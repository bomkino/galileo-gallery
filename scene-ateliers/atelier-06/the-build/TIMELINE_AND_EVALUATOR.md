# Timeline and evaluator — The Build

Status: atelier-local G10C preflight design; not Product implementation.

## One truth

`compileTimeline(intent, controls, { hasCaption })` creates one finite named beat table. `evaluate(compiled, normalizedTime, sources, options)` produces every presentation value. Play, pause, scrub, fixed-step capture, directed compilation, reverse/deconstruction, and reduced motion sample that evaluator. CSS transitions, pointer inertia, wall clock, video playback position, and render cadence never become a second truth.

## Default regular phrase — Project caption present

Default controls: `build-detail=regular`, `per-beat-hold=600 ms`, `finale-hold=2,000 ms`.

| ID | Start ms | End ms | State purpose |
| --- | ---: | ---: | --- |
| `empty-stage-hold` | 0 | 600 | readable empty anchor |
| `frame-apparatus` | 600 | 1,700 | frame progress 0→1 |
| `frame-hold` | 1,700 | 2,200 | frame readable |
| `placement-guides` | 2,200 | 3,300 | Project-known placement geometry appears |
| `guides-hold` | 3,300 | 3,900 | guide purpose readable |
| `source-window` | 3,900 | 5,600 | intact source reveal 0→1 |
| `source-hold` | 5,600 | 6,400 | placement readable |
| `caption-if-known` | 6,400 | 7,300 | real Project caption progress 0→1 |
| `cleanup` | 7,300 | 8,300 | guides/cursor leave |
| `resolved-hold` | 8,300 | 10,300 | exact finished source |
| `deconstruct` | 10,300 | 11,600 | Gallery apparatus/source reveal returns to empty seam |

## No-caption phrase

When the source has no Project caption, `caption-if-known` is **absent**, not a no-op. Cleanup starts at `6,400 ms`; resolved hold starts at `7,400 ms`; deconstruct starts at `9,400 ms`; total duration is `10,700 ms`. The no-caption readable floor is `7,300 ms`, versus `7,900 ms` with a caption.

Concise mode follows the same rule: a real caption receives an explicit `800 ms` causal beat; no-caption media receives no invisible wait.

All moving progress uses bounded quintic easing with zero endpoint velocity. Holds return zero velocity. Terminal `1` emits the exact seam state.

## Evaluator outputs

- phase identity/index/progress and velocity;
- frame, guide, source, caption, cleanup, and resolved progress;
- causal cursor state and Project-known guide lines;
- stable source identity, failure/kind, and clean media treatment;
- consumed primary plus preserved extra IDs;
- compiled context, duration, minima, requested/achieved pace, and issues.

The evaluator never emits palette choices, typography trials, inferred layers, approval state, authorship, or hidden design decisions.

## Readable-duration contract

- captioned regular floor: `7,900 ms`;
- no-caption regular floor: `7,300 ms`;
- default captioned duration: `11,600 ms`;
- default no-caption duration: `10,700 ms`.

The compiler reports:

- `duration-below-readable-minimum` when any fixed/directed request is below the context-specific floor;
- `fixed-duration-compression` when a readable fixed phrase is shorter than automatic;
- `directed-duration-compromise` when a request is above the floor but shorter than the preferred directed phrase;
- exact requested, compiled, minimum, and directed durations.

It prefers an honest longer result over a nominal duration that erases a decision.

## Directed mode

The Product's fast ×2, regular ×1, fast ×1 phrase maps to:

- opening move beats request ×2;
- source placement, source hold, real caption, and resolved hold stay regular;
- finale move beats request ×2.

Every segment records requested and achieved pace. A `7,000 ms` captioned request is below the `7,900 ms` floor and therefore reports `duration-below-readable-minimum`; a request between the floor and preferred directed duration may report `directed-duration-compromise`.

## Reverse and seam

Reverse deconstructs Gallery's visible presentation apparatus. It does not claim to reverse the source's creation. Forward at `t` and reverse at `1-t` produce matching visual states with opposite travel velocity. At the seam, frame/guide/source/caption/cursor progress all return to zero while source identity remains preserved.

## Reduced motion

Story time maps to four discrete states: empty, guides, source, resolved. No continuous wipe, transform, or cursor movement. Accessible status names only Project-known operations.

## Boundary and parity checks

- exact segment starts plus epsilon samples;
- positive, contiguous segments and zero endpoint velocity;
- caption/no-caption phase-table difference;
- fixed/directed minima and requested/achieved pace;
- play/scrub/fixed-step evaluator identity;
- source treatment/hash unchanged;
- exact visual seam;
- no imported/shared phase engine.
