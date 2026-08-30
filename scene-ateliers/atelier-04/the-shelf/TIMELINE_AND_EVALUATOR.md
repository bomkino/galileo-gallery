# Timeline and evaluator — The Shelf

## Pure contract

```text
evaluate(config, orderedMedia, serializedIntent, compiledTimeline,
         storyTime, canvas, runKind, reducedMotion)
  -> complete unique Project-media layout + bounded seam render slots
```

No wall clock, requestAnimationFrame delta, pointer throw, random value, DOM width history, previous phase, decoder time, or renderer state enters evaluation.

## Natural-ratio layout

For source ratio `r`, canvas `W×H`, and nominal height `h=H×cardHeight`:

```text
widthLimit = W × (portrait ? 0.82 : 0.58)
heightᵢ    = min(h, widthLimit / rᵢ)
widthᵢ     = heightᵢ × rᵢ
```

Every ordinary bottom edge equals:

```text
baseline = portrait ? 0.78H : 0.80H
bottomYᵢ = baseline
```

Focused source:

```text
lift      = H × spotlightLift × focusProgress
bottomYᵢ = baseline − lift
leanᵢ    = baseLeanᵢ × (1 − focusProgress)
```

Thus Spotlight straightens and lifts one edition; neighbours remain exactly grounded.

## Deterministic lean

```text
hash = FNV-1a(sourceId)
normalized = hash / 0xffffffff × 2 − 1
baseLean = boundedSignedFloor(normalized) × leanAmount
```

The tiny signed floor avoids an accidental visually zero lean at non-zero control values. Hash, sign, and source association are stable across time, order-preserving culling, remount, reverse, and export. This is deterministic identity placement, not randomness.

## Track length and centres

```text
naturalLength = Σ widthᵢ + N × gap
minimumLoop   = W + 2 × maximumWidth + 96
trackLength   = N <= 1 ? naturalLength : max(naturalLength, minimumLoop)
effectiveGap  = gap + max(0, trackLength − naturalLength) / N
```

Source centres are accumulated in Project order with `effectiveGap`. Slack is uniform and causal; it is not a hidden visual parameter.

## Render-copy equation

For source centre `cᵢ`, track origin `o`, phase `p`, track length `L`, and temporary copy index `k∈{-1,0,1}`:

```text
xᵢ,k = o + cᵢ − pL + kL + assemblyOffset
```

Only copies whose card bounds intersect the stage plus a 48-pixel observation guard are rendered. Because `L > W + 2×maxWidth`, the same Project source cannot be visible twice. Render `slotId` includes copy index; Project media identity remains the source ID and is never duplicated.

One-item mode renders `k=0` only and sets `o+c₀=W/2`.

## Every recycling seam located

For each unique source with normalized base centre `b`, width `w`, stage width `W`, and track length `L`:

```text
exitPhase      = (b + w/2) / L
nextEntryPhase = (b + L − w/2 − W) / L
```

The probe selects the corresponding unwrapped cycle and evaluates:

```text
previousRightAtExit = 0
nextLeftAtExit      = L − w >= W
nextLeftAtEntry     = W
previousRightAtEntry= W − L + w <= 0
```

Therefore, after the previous copy fully exits left, the next copy is still beyond right; before it enters, the previous copy remains beyond left. The verifier generates and checks this record for all `127` sources. Failed seams: `0`.

Reverse uses the mirrored inequalities at opposite edges through exact time reversal; it does not need a second seam table.

## Automatic loop

```text
phaseForward(t) = positiveModulo(t, 1)
phaseReverse(t) = positiveModulo(−t, 1)
```

One-item phase is fixed `0`. The canonical laboratory duration is `max(8 s, min(42 s, 1.65N s))`; this is a Timeline fixture, not a Scene control.

At `t=1`, modular phase equals `0`. Visible slot identities/copies/poses, baseline, lean, and treatment equal `t=0`.

## Finite phrase and focus alignment

To centre source `j`:

```text
alignmentPhase(j) = positiveModulo((origin + centreⱼ − W/2) / L, 1)
```

Directed interpolation follows the selected travel direction using the shortest non-negative directional delta. Canonical finite phases:

| Interval | Phrase | Track | Focus |
| --- | --- | --- | --- |
| `0.00–0.10` | entry | fixed phase + whole-row offset easing to zero | none |
| `0.10–0.46` | walking to Spotlight | eases to Spotlight alignment | ramps only near arrival |
| `0.46–0.72` | Spotlight hold | exact constant phase | Spotlight progress `1` |
| `0.72–0.86` | walking to Finale | directional interpolation | transfers causally |
| `0.86–0.96` | Finale hold | exact constant phase | Finale progress `1` |
| `0.96–1.00` | exit | Finale alignment + whole-row offset | focus releases |

Observed Spotlight hold test at `t=0.56` and `t=0.68`:

- phase equal at both checkpoints;
- focused ID `ordinary-004`;
- lift `43.2 px` on 540-pixel canvas (`0.08H`);
- focused lean `0°`.

No source scale, neighbour dim, centre depth bump, or background zoom occurs.

## Timeline compilation

- **Automatic:** one complete track cycle.
- **Fixed duration:** one complete cycle stretched to exact authored duration.
- **Directed:** explicit cycles/holds; Spotlight/Finale IDs are serialized intent.
- **Casino rhythm:** permissible only when a later author explicitly chooses fast ×2 / regular ×1 / fast ×1 and real-speed review confirms walking/material identity. Not default.

Timeline owns pace, duration, direction authority, holds, Spotlight/finale roles, repeat/once, and story time. Scene owns track geometry, baseline, lean, lift mapping, and seam policy.

## Canonical checkpoints

| Checkpoint | Loop | Finite | Expected state |
| --- | ---: | ---: | --- |
| start | `0.000` | `0.000` | exact row state / collection offstage-side entry pose |
| entry complete | n/a | `0.100` | whole row at baseline, no stagger |
| early | `0.130` | `0.250` | walking row, stable lean/order |
| front/near | n/a | `0.460` | Spotlight alignment reached |
| hold | n/a | `0.560–0.680` | phase fixed, selected straight/lifted |
| later | `0.750` | `0.800` | walking to Finale, shared row retained |
| finale | directed | `0.900` | Finale straight/lifted, neighbours grounded |
| exit | n/a | `0.980` | whole row exits as one body |
| seam | `1.000 ≡ 0.000` | n/a | exact phase/pose/identity/treatment equality |

## Pose/order tables

### Ordinary eight, 16:9

| Property | Decision |
| --- | --- |
| baseline | `432 px` (`0.80×540`) |
| natural-ratio widths | preserved from common/effectively bounded heights |
| track length | `2479.52 px` default fixture |
| visible nodes | typically 4–6; maximum 18 |
| semantic order | Project order, independent of wrapped copy order |

### Mixed ratios / portrait / many

| Fixture | Canvas | Policy | Node bound |
| --- | --- | --- | ---: |
| 21 mixed | 16:9 | common nominal height, natural widths, baseline fixed | 18 |
| 21 mixed | 4:5 | fewer observed editions, horizontal identity retained | 12 |
| 127 | 9:16 | complete layout state; few large visible works | 12 |
| 2 | 16:9 | safety slack expands gap, honest offstage handoff | <=2/guards |
| 1 | any | centred still, no seam copies | 1 |

## Source-video time

```text
looped = positiveModulo(storySeconds, sourceDuration)
finite = clamp(storySeconds, 0, sourceDuration)
```

Wrapping/culling does not change source time. Re-entering video seeks before visibility. Scene owns no audio.

## Preview/scrub/fixed-step parity

- Play advances explicit story time only.
- Scrub writes normalized time directly.
- Fixed-step export samples `n/fps` from one immutable snapshot.
- Same input/time is exact JSON equality.
- Dropped preview frames cannot change later x/lean/focus state.
- Reverse is tested against forward `1−t` within floating-point tolerance.
