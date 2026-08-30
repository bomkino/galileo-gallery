# Timeline and evaluator — Open Fan

## Pure input

```text
evaluate(config, orderedMedia, storyTimeMs, stage, timelineMode, temporalDirection)
```

The evaluator reads only validated serialized config, ordered media identities/ratios, compiled Timeline intent, explicit story time, and stage dimensions. It does not read wall clock, pointer state, hover, DOM measurements after stage resolution, React render count, random values, or GPU state.

## Canonical phase map

Automatic reference duration: 8,400 ms.

| Checkpoint | Normalized time | Physical state |
| --- | ---: | --- |
| `start` | 0.000 | lightly gathered, exact seam pose |
| `entry-middle` | 0.080 | centre cards opening; outer cards still gathered |
| `open-settle` | 0.220 | full stable fan |
| `spotlight-in` | 0.380 | chosen card travelling radially |
| `spotlight-hold` | 0.470 | chosen card fully lifted, artwork normal/1/none |
| `spotlight-return` | 0.600 | exact inverse lift path |
| `later-settle` | 0.650 | base fan restored |
| `finale-hold` | 0.760 | fan biased toward finale slot; finale card lifted |
| `exit-middle` | 0.920 | fan closing through inverse slot angles |
| `seam` | 1.000 | exact gathered start pose |

## Geometry

For active-window source index `i`:

```text
u_i = i / max(1, mountedCount - 1) - 0.5
slotAngle_i = u_i * effectiveSpread(canvas, ratios, controls)
open_i = openEnvelope(p, stagger(i))
angle_i = slotAngle_i * open_i
H = (stageWidth * 0.5, stageHeight * effectiveHingeHeight)
radial_i = (sin(angle_i), -cos(angle_i))
position_i = H + radial_i * liftEnvelope(i, p)
cardWidth_i = shortAxis * effectiveCardSize
cardHeight_i = cardWidth_i / clamp(sourceRatio_i, 0.2, 5)
```

Every card uses bottom-centre transform origin. `position_i` names that bottom-centre point, not the card centre.

### Opening envelope

Use a monotonic quintic smootherstep with a centre-out stagger. No overshoot:

```text
openIn_i  = smootherstep(remap(p, entryStart_i, entryEnd_i))
openOut_i = 1 - smootherstep(remap(p, exitStart_i, exitEnd_i))
open_i = min(openIn_i, openOut_i)
```

The close schedule is the exact reverse of the open schedule.

### Spotlight envelope

```text
lift(u) = featuredLiftPx * pulse(p; riseStart, riseEnd, holdEnd, returnEnd)
pulse = smootherstep(rise) * (1 - smootherstep(return))
```

The lift direction is the card's current radial vector. Scale accent is bounded to `1 + 0.025 * pulse`; translation remains the dominant evidence.

### Finale envelope

For finale slot angle `A_f`:

```text
angle_i_finale = mix(angle_i, angle_i + 0.09 * wrapAngle(A_f - angle_i), finalePulse)
finaleLift_f = 0.8 * featuredLiftPx * finalePulse
```

This keeps the final state inside fan geometry.

### Breath

```text
breath_i = paperBreathPx * stableMask(p) * sin(TAU * (2p + sourcePhase_i))
```

`sourcePhase_i` is a fixed hash-derived phase from the stable source ID, not random state. `stableMask` is zero during entry, spotlight travel, finale, exit, reduced motion, and at seams.

## Timeline mode mapping

### Automatic

Compile the canonical 8.4 s phrase. If no spotlight/finale is authored, redistribute removed hold time to stable overview rather than inventing motion.

### Fixed duration

Let `D_target` be validated. Holds have minimums: spotlight 600 ms, finale 700 ms, stable overview 800 ms. Remaining travel intervals scale by one factor. Reject `D_target < 3,200 ms` when both spotlight and finale are active.

### Directed

Compile named segments:

```text
entry(open)
overview(hold)
spotlight(index, rise/hold/return) zero or more
finale(index, tighten/hold/release) optional
exit(close)
```

A Product fast ×2 / regular ×1 / fast ×1 phrase becomes fast entry, one regular overview/spotlight phrase, and fast finale/exit. Open Fan does not fabricate repeated cycles.

## Finite, loop, and reverse

- Finite: clamp story time to `[0, D]`; terminal pose is the gathered seam unless Product requests a terminal finale hold.
- Loop: positive-modulo story time by `D`; exact start/end pose and velocity are zero.
- Temporal reverse: `evaluateReverse(t) = evaluateForward(D - t)`. Holds and z-order use forward story phase, so reverse traverses the identical path.
- Spatial direction remains unsupported.

## Source-video time

```text
sourceSeconds = loopVideo
  ? positiveModulo(storyTimeMs / 1000 + sourceInSeconds, sourceDurationSeconds)
  : clamp(storyTimeMs / 1000 + sourceInSeconds, 0, sourceDurationSeconds)
```

Scene phase never changes source playback speed.

## Sampling parity

Preview play, scrub, and fixed-step export call the same evaluator. Preview scheduling may advance explicit `storyTimeMs`; fixed-step export samples `frameIndex * 1000 / fps`. No interpolation state lives outside the evaluator.

## Pose table — ordinary five-card fixture, 16:9

Representative values are rounded diagnostic expectations, not implementation constants.

| p | card role | angle | lift | container opacity | artwork | depth order |
| ---: | --- | ---: | ---: | ---: | --- | --- |
| 0.000 | all | 0° gathered | 0 | 1 | normal/1/none | stable centre-weighted |
| 0.220 | outer L/R | about ±41° | 0 | 1 | normal/1/none | centre above outer |
| 0.470 | selected | own slot | 14% short axis | 1 | normal/1/none | temporary top |
| 0.600 | selected | own slot | 0 | 1 | normal/1/none | exact base order |
| 0.760 | finale | biased own slot | about 11.2% | 1 | normal/1/none | temporary top |
| 1.000 | all | 0° gathered | 0 | 1 | normal/1/none | start order |

## Pose table — mixed ratios

| Source | Ratio | Width rule | Height consequence | Hinge consequence |
| --- | ---: | --- | --- | --- |
| landscape | 16:9 | shared card width | shorter | same bottom-centre H |
| square | 1:1 | shared card width | medium | same bottom-centre H |
| portrait | 3:4 | shared card width | taller | same bottom-centre H; may derive narrower spread |
| cinema | 2.39:1 | shared card width | shallow | same bottom-centre H |

## Pose table — portrait canvas

| Property | 16:9 default | 9:16 derived |
| --- | ---: | ---: |
| effective spread | 135° | bounded near 92° |
| effective card width | 36% short axis | 23–28% short axis for mixed tall ratios |
| hinge y | 79% | 82% after portrait derivation |
| mounted window | up to 12 | up to 12; card width recomposes before clipping |
| clipping policy | none | recompose before clipping |

## Required mechanical assertions

1. Same inputs and time yield byte-identical canonical snapshots.
2. `snapshot(0) == snapshot(D)` in loop phrase.
3. `forward(t) == reverse(D - t)` for every source.
4. Lift return restores base pose and z-order exactly.
5. Source order is stable across window changes.
6. Each Scene control changes its declared observation; Reset restores defaults.
7. Mounted nodes never exceed the declared window budget.

## Final gauntlet implementation truth

The equations and phase diagrams above remain the candidate charter model. Exact current prototype authority is the pure evaluator plus `evidence/canonical-readback.json`; rounded tables are explanatory, not an alternate implementation.

| Compilation | Duration | Hold policy |
| --- | ---: | --- |
| automatic | 8,400 ms | Scene-authored literal holds |
| fixed validation fixture | 12,347 ms exactly | holds stay literal; travel absorbs the requested duration |
| directed | 6,279 ms | fast entry/exit around the regular readable phrase |

Literal hold total: 2,730 ms. Impossible fixed targets fail validation rather than compressing readable holds. Reverse evaluates the same quantized oriented story time at `D - t`; seams are exact in all three modes.

The evaluator validates the whole rotated opening arc, not only gathered/open endpoints. It derives a feasible hinge interval and ratio-aware effective card size/spread before any visible corner can leave the stage. `requested` and `effective` geometry stay separate in readback.

For 13–127 sources, the ordered 12-source window remains a simultaneous overview. Finale targets the mounted terminal identity rather than an invisible global source; authored inspection changes the window only through stable overview state.

All numeric controls, stage dimensions, ratios, source IDs, source count, mode, direction, and story time are validated before pose work. Duplicate IDs, more than 127 sources, unsupported enums, non-finite values, and out-of-range controls fail explicitly. Z-order is unique and deterministic for every mounted source.

Preview, scrub, vectors, fixed-sample evidence, and later export design invoke the same evaluator. The HTML preview owns one cancellable animation-frame scheduler, stops it when paused/edited/reset/hidden, and reuses source-ID-keyed card nodes. Scheduler state never enters serialized/evaluator authority.


## Applied authoring transport boundary

The removable prototype now exposes explicit 30 fps previous/next-frame review controls. This does
not quantize the evaluator: scrub, play, vectors, evidence, and later export still supply explicit
story milliseconds to the same pure function. Seeking pauses preview first. Card drag owns review
time only and is excluded from Scene config, Project truth, history, and export.

Keyboard/card source inspection computes a deterministic readable review time while preserving the
serialized story featured/spotlight control exactly. Canonical readback remains authored truth;
inspection overlays and temporary review windows remain separate.
