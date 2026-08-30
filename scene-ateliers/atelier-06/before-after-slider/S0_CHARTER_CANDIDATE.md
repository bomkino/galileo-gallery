# S0 charter candidate — Before / After

- Scene ID: `before-after-slider`
- Candidate version: atelier-local `0.1`
- Status: candidate only
- Formal charter verdict: pending
- Product integration: no

## Motion and anti-motion

**Motion sentence:** Two exactly aligned sources share one content rectangle while one reversible divider sweeps, rests with zero velocity, turns gently, and returns without a hard reset.

**Anti-motion sentence:** Never become a two-card carousel, crossfade, wipe transition, duplicated single source, or decorative handle animation disconnected from comparison truth.

The emotional register is forensic clarity. The material metaphor is a physical comparison mask sliding over a registered pair, not two slides trading places.

## Source contract

Exactly two ordered sources are consumed:

- source index `0` owns side identity `before`;
- source index `1` owns side identity `after`;
- source index `2+` remains preserved in Project order and is reported as unused by this Scene;
- one source produces an explicit missing-pair state and application must not silently duplicate it;
- zero sources fails before mutation;
- a failed source retains side identity and renders a side-specific placeholder under the correct label.

Future application UI should show `2 selected · N preserved` when extra media exists. It must not imply extras were deleted.

## Registration, fit, and focal policy

Both panes occupy the same declared content rectangle, use the same fit (`contain` by clean default), the same centre alignment, the same frame padding, and the same crop semantics. Divider and clip are presentation layers over that shared registration.

Current Project v2 has no settled per-source focal-point field. Candidate v1 therefore cannot promise independent focal correction. It defaults to the current honest centred fit/alignment capability. A future focal contract must be approved serially; this packet does not invent one.

Different pixel dimensions with equal aspect remain registered. Different aspect ratios share the same content rectangle and fit policy; with `contain`, their letterbox extents may differ but their rectangle, centre, scale rule, and divider coordinates do not drift.

## Timeline grammar

Automatic normalized phrase:

| Range | Phase | Split |
| --- | --- | --- |
| 0.000000–0.080769 | `initial-hold` | authored `initial-split` |
| 0.080769–0.350000 | `sweep-to-max` | minimum-jerk path to sweep maximum |
| 0.350000–0.475000 | `max-hold` | exact maximum, zero velocity |
| 0.475000–0.744231 | `sweep-to-min` | same path reversed to sweep minimum |
| 0.744231–0.869231 | `min-hold` | exact minimum, zero velocity |
| 0.869231–1.000000 | `return-to-initial` | gentle minimum-jerk path to exact initial seam |

Normalized `0` and `1` return the same split and zero velocity. Turnaround boundaries are position- and velocity-continuous. Reverse samples the same evaluator at `1 - t`; side labels never swap.

Default automatic duration is 5,200 ms, treated as diagnostic starting evidence rather than accepted taste. Fixed duration below 3,600 ms fails with `duration-below-readable-minimum`. Directed Timeline changes sweep durations while retaining turnaround holds. Fast ×2, regular ×1, fast ×1 maps to travel, not label animation.

## Manual truth

Manual pointer, keyboard, scrub, preview, and export all map to one scalar `split` in the same evaluator. Pointer events set the scalar directly. No CSS transition, spring, smoothing, momentum, or flourish may create a second value. Manual state is preview interaction unless a later approved Timeline parameter serializes it.

Keyboard contract:

- Arrow Left/Right: −/+1 percentage point;
- PageDown/PageUp: −/+10 percentage points;
- Home/End: sweep minimum/maximum;
- visible focus ring;
- ARIA `slider`, exact min/max/now/value text.

## Essential Scene-only controls

Exactly five controls:

1. `initial-split`
2. `sweep-range` — one coherent serializable min/max value
3. `sweep-duration`
4. `turnaround-hold`
5. `comparison-chrome`

Fit, frame ratio, Project canvas, Look, audio, and export remain shared concerns.

## Reduced motion

Reduced motion disables automatic sweep and shows the authored initial split. Manual pointer and keyboard access remain available without transition. Labels/handle remain according to `comparison-chrome`.

## Alpha capability

Candidate v1 is opaque-only because transparent comparison semantics are unresolved: the result depends on the compositor background, alpha premultiplication, and whether “before” and “after” compare RGB, alpha, or both.

Capability copy:

> Before / After currently requires an opaque comparison background. Transparent export is unavailable until alpha-comparison semantics are defined.

The Scene must not flatten silently or claim alpha parity.

## Failure and video policy

- Missing pair: explicit state; no duplicated source.
- Failed before: before placeholder remains under the before clip and label; after cannot appear under the before label.
- Failed after: after placeholder remains the base pane; before remains correctly clipped above it.
- Both failed: both side identities remain visible.
- Source video: each side samples Product story time independently but at the same story timestamp; Scene does not create media clocks or alter audio.

## Risks and human decisions

1. Is 12–88% the correct default sweep range, or too restrictive?
2. Does the three-turn phrase feel explanatory rather than repetitive?
3. Are labels useful enough to survive the clean-chrome option?
4. Should one-source application fail immediately or remain as an editable missing-pair state before apply?
5. Is opaque-only acceptable until alpha semantics exist?

Human verdict remains pending. No production Scene, schema, focal contract, registry edit, package, release, or acceptance is claimed.
