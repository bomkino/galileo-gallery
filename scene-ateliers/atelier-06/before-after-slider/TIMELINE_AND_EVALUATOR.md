# Timeline and evaluator — Before / After

## One scalar truth

The evaluator returns `split` in normalized frame width and `velocity` in normalized-width per phrase. Clip edge, divider, handle, ARIA value, manual pointer/keyboard state, scrubber, and fixed-step capture all read that scalar. Rendering never eases it again.

```text
compileTimeline(intent, controls) -> durations, boundaries, issues
evaluate(compiled, t, sources, { manualSplit, reducedMotion, direction }) -> split, velocity, pane state
```

The schema is atelier-local and non-runtime.

## Piecewise path

Every travel uses minimum-jerk interpolation `6u^5 - 15u^4 + 10u^3`; its derivative is zero at both ends. Holds return exact extrema and zero velocity.

Automatic path:

1. initial hold;
2. initial → maximum;
3. maximum hold;
4. maximum → minimum;
5. minimum hold;
6. minimum → initial.

Reverse samples the same path at `1 - t`; pane labels and side ownership never swap.

## Exact default compiler output

| Segment | Duration | Normalized boundary |
| --- | ---: | ---: |
| `initial-hold` | 420 ms | 0.000000 → 0.080769 |
| `sweep-to-max` | 1,400 ms | 0.080769 → 0.350000 |
| `max-hold` | 650 ms | 0.350000 → 0.475000 |
| `sweep-to-min` | 1,400 ms | 0.475000 → 0.744231 |
| `min-hold` | 650 ms | 0.744231 → 0.869231 |
| `return-to-initial` | 680 ms | 0.869231 → 1.000000 |

Total: `5,200 ms`.

Readable minima are `400 + 900 + 360 + 900 + 360 + 680 = 3,600 ms`. Every fixed-duration segment remains at or above its own minimum. A request below `3,600 ms` emits `duration-below-readable-minimum` and compiles at the floor. Compression between the floor and automatic duration emits `fixed-duration-compression`.

Directed mode requests 2× pace only for opening and return travel. The middle comparison sweep and all holds remain readable. Requested and achieved pace scales are recorded separately.

## Manual state

Manual mode exists only when `manualSplit` is a finite number. `null`, `undefined`, or malformed values do not become an accidental zero split. A valid manual value clamps to the authored sweep range and forces velocity `0`. Pointer and keyboard input update it immediately; no transition or inertia follows.

Manual/automatic parity is checked by sampling an automatic split, applying that exact scalar manually, and comparing pane geometry.

## Source panes

The evaluator consumes exactly two stable side-owned sources and preserves all extras. Both panes share one content rect, fit mode, and centre. Decode failure changes only that side's placeholder state. One source returns an explicit `missing-pair`; it is never duplicated.

## Fixed-step mapping

Future Product capture samples frame `n` at `n / fps`. The prototype uses the same evaluator for play, scrub, manual split, and capture but claims no Product export integration.
