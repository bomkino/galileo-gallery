# Timeline and evaluator — Zoetrope

## Pure evaluation contract

```text
evaluate(config, orderedMedia, compiledTimeline, storyTime, canvas, runKind, reducedMotion)
  -> complete identity state + bounded render slots
```

The function receives no wall clock, frame delta, pointer velocity, renderer state, random source, browser dimensions, or requestAnimationFrame handle. Preview, scrub, deterministic frame sequence, and future fixed-step export must call the same function.

Canonical prototype: `prototype/evaluator.mjs`. It is removable laboratory code, not Product source.

## Timeline compilation

For `N = max(1, mediaCount)` and default slot duration `s = 0.43 s`:

```text
baseDuration = clamp(N × s, 2.4 s, 18 s)
```

Production integration should obtain `s` from Timeline pace, not from Scene parameters. The laboratory constant mirrors current live profile evidence only.

- **Automatic:** one cycle over `baseDuration`.
- **Fixed duration:** one cycle time-scaled to exact authored duration.
- **Directed:** segments compile to normalized spans using `weight = cycles / paceScale`; holds use explicit duration weight. Segment boundaries are deterministic.

The casino phrase is valid:

```text
fast-opening: 2 cycles at ×2
regular-middle: 1 cycle at ×1
fast-finale: 1 cycle at ×2
```

Each cycle retains gate-aligned slot boundaries. A directed hold must compile to an integer source-slot station; if authoring requests a non-aligned hold, compilation snaps once and serializes the resolved station rather than applying runtime drift.

## Cadence equation

Let `c` be normalized cycle progress and `N` source count:

```text
raw      = c × N
beat     = floor(raw)
local    = positiveModulo(raw, 1)
travel   = 0.68
advance  = local < travel ? smootherstep(local / travel) : 1
slotPos  = beat + advance
phase    = positiveModulo(sign × slotPos / N, 1)
```

`sign = +1` forward, `−1` reverse. `flywheel` replaces the piecewise advance with `smootherstep(local)`; it still lands exactly at every slot boundary.

The ratchet function is continuous in position. Velocity reaches zero at the end of travel and stays zero through dwell. It is not evaluator frame stepping.

## Spatial equation

For source index `i`:

```text
θᵢ      = wrapRadians(2π × (i / N − phase))
depth   = cos(θᵢ)
x        = cx + R sin(θᵢ)
y        = cy + R sin(θᵢ) sin(tilt) + (1 − depth) × 0.012H
rotateY  = degrees(θᵢ)
rotateZ  = tilt
scale    = 0.68 + 0.16(depth + 1)
```

Front gate:

```text
gateHalfAngle = clamp(0.75 × 2π / max(6, N), 0.13, 0.38)
frontGate     = abs(θᵢ) <= gateHalfAngle
readable      = frontGate && depth > 0.9
```

Rear core:

```text
behindCore = depth < −0.78
visible    = intersectsStage && !behindCore
```

Opacity and filter are not functions of depth. Every rendered source plane retains opacity `1`, filter `none`, normal blend.

## Entry, cycle, holds, finale, exit, seam

| Checkpoint | Loop normalized time | Finite normalized time | Expected state |
| --- | ---: | ---: | --- |
| start | `0.000` | `0.000` | Loop: full apparatus at first gate. Finite: 82% radius, zero velocity. |
| entry complete | n/a | `0.100` | Full cylinder; first slot aligned. |
| early travel | `0.083` | `0.180` | Eased angular advance; stable tangency. |
| front-gate dwell | `0.142` | `0.250` | One source stationary and readable. |
| later cycle | `0.583` | `0.610` | Stable ordered wheel; no cumulative error. |
| Spotlight | directed hold | `0.780` | Serialized Spotlight source at `θ=0`; velocity zero. |
| Finale | terminal/direct hold | `0.890` | Serialized finale source at `θ=0`; no generic source filter. |
| exit | n/a | `0.970` | Radius contracts on assembly path. |
| seam | `1.000 ≡ 0.000` | n/a | Byte-equal loop phase and card pose. |

## Exact reverse

Loop reverse is `phaseReverse(t) = positiveModulo(−phaseForward(t), 1)`. Finite reverse evaluates the forward finite phrase at `1 − t`, reverses angular sign, swaps entry/exit meaning, and retains source IDs. Spotlight/finale source identity is not inferred from traversal direction.

Reverse tests compare every source pose under modular inversion. A separately animated reverse transition is forbidden.

## Source-video time

For story seconds `T`, source duration `D`:

```text
looped:    positiveModulo(max(0, T), D)
nonlooped: min(max(0, T), D)
```

Video time is independent of card visibility. Product media services may pause rear-occluded decoders, but on reactivation seek to evaluated source time before presentation. Scene does not alter audio truth.

## Sampling and alias proof

The evaluator does not know output fps. The test harness samples the same default six-item cycle for 2.58 seconds:

| Sampling fps | Frames observed | Maximum angular sample delta | Gate-dwell samples | Result |
| ---: | ---: | ---: | ---: | --- |
| 24 | 63 | 15.7951° | 18 | pass |
| 30 | 79 | 12.6099° | 24 | pass |
| 60 | 156 | 6.3899° | 49 | pass |

Gate samples count across all six dwells. Acceptance bound is at least three dwell samples and less than 18° maximum angular step at the current 430 ms slot evidence. Future Timeline pace bounds must rerun this table. If 24 fps exceeds the bound, reduce pace or lengthen travel/dwell; do not add blur or make the evaluator fps-dependent.

## Canonical pose table — ordinary six, 16:9

The table describes invariants rather than brittle screenshot coordinates.

| Phase | Gate identity | Gate depth | Side orientation | Rear policy | Source state |
| ---: | --- | ---: | --- | --- | --- |
| `0.000` | `ordinary-001` | `1.0` | symmetric tangent pair | rear core culled | opacity 1 / none / normal |
| `0.142` | next slot after eased travel | near `1.0` | stable, no backtracking | culled | faithful |
| `0.500` | source index determined by exact slot count | `1.0` at dwell | tangent | culled | faithful |
| `1.000` | `ordinary-001` | `1.0` | identical to start | identical | identical |

## Mixed-ratio and portrait table

| Fixture | Canvas | Recomposition | Collision policy | Node bound |
| --- | --- | --- | --- | ---: |
| mixed 20 | 16:9 | natural widths, shared height | side foreshortening; rear cull | 19 |
| mixed 20 | 4:5 | reduced radius and wide-card height | geometric virtualization | 15 |
| many 127 | 9:16 | narrow cylinder, fewer simultaneous side cards | retain complete identity state; render only nearest relevant slots | 15 |
| one | any | still gate plane | no artificial orbit/breath | 1 |
| two | any | half-turn opposition | rear source may be culled | ≤2 |

## Preview, scrub, and fixed-step export

- Preview transport may use requestAnimationFrame only to advance an explicit story-time value. It has no hidden phase accumulator.
- Scrub writes story time directly and evaluates once.
- Fixed-step export samples `tₙ = n / fps` against one immutable compiled snapshot.
- Same input/config/time/canvas yields byte-equal evaluator JSON; prototype verification checks this.
- No delta integration means dropped preview frames do not alter later pose.
