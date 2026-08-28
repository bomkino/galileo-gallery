# Timeline and evaluator — Before / After

## Pure input

`evaluateComparison({ before, after, parameters, timeline, timeMs, stageWidth, stageHeight, reducedMotion })`

No wall clock, browser autoplay, pointer state, render timing, or GPU state enters the evaluator. Source roles and identities are validated before compilation. All numeric inputs must be finite and bounded.

## Canonical phrase

A complete comparison phrase contains:

1. start hold at reveal 0;
2. monotonic travel to reveal 1;
3. end hold at reveal 1;
4. monotonic return to reveal 0;
5. seam at the identical start state.

Velocity is zero during holds. Reversal never teleports or crossfades.

## Modes

### Automatic

One complete phrase using the declared `travelMs` and `holdMs`.

### Fixed duration

The same four semantic legs are proportionally retimed to the exact requested duration. The requested duration must leave at least 200 ms for each travel and 100 ms for each hold. The output duration equals the requested value exactly.

### Directed

Four complete phrases compile at actual pace scales 2, 2, 1, and 2. Segment IDs, start/end times, and phrase offsets are explicit. Tests compare canonical samples against automatic mode and fail if only labels differ.

## Direction and source roles

`startSide` controls whether the phrase begins fully Before or fully After. It does not swap the semantic identities. Reverse changes phrase travel direction while keeping Before and After labels attached to the same source IDs.

## Evaluation output

- reveal fraction `0…1`;
- velocity and segment ID;
- vertical or horizontal clip inset;
- stable before/after source IDs;
- divider position and orientation;
- source treatment invariant;
- role-specific failure states;
- exact story-time sample for video on either side.

## Reduced motion

The representative state is an exact 50/50 split. Every automatic timestamp evaluates to that same state. Manual keyboard adjustment may set another fraction immediately without animated interpolation.

## Count failure

One source returns `insufficient-input` and does not fabricate a second role. More than two unassigned sources return `ambiguous-extra-input`. Product integration must obtain semantic role assignment before evaluation.

## Alpha

This candidate emits opaque output only. It cannot claim straight-alpha parity until clipping, transparent overlap, premultiplication, and edge-colour tests exist for both sides.
