# Timeline and pure evaluator — Dealer's Pick

## Authority

The evaluator is a pure function of validated Scene controls, ordered media identities/ratios, canvas, compiled Timeline, and explicit story time. Wall clock, React state, requestAnimationFrame, scroll, pointer, hover, and GPU state are not inputs.

## Canonical normalized phrase

Default automatic duration for the five-card study: `D = 9,500 ms`.

| Checkpoint | `p` | Meaning |
| --- | ---: | --- |
| `entry-hidden` | 0.000 | all cards collapsed at the common below-stage pivot, container opacity 0 |
| `entry-riffle` | 0.080 | active window physically established |
| `early-handoff` | 0.230 | fractional focus between first and spotlight source |
| `spotlight-arrival` | 0.340 | authored source reaches crown |
| `spotlight-hold-end` | 0.460 | crown velocity resumes from zero |
| `later-handoff` | 0.640 | focus travels through remaining ordered hand |
| `finale-crown` | 0.850 | final unmuted source at crown |
| `exit-collapse` | 0.950 | hand collapses toward hidden pivot |
| `seam` | 1.000 | exact equality with 0.000 |

The prototype uses one spotlight source to pressure the hold seam. Production compilation omits that hold when no spotlight is authored and redistributes the interval to ordinary travel.

## Pure evaluation outline

```text
evaluate(config, orderedMedia, timeline, canvas, storyTime):
  D = compileDuration(config, orderedMedia, timeline)
  pForward = positiveModulo(storyTime, D) / D
  p = direction == reverse ? positiveModulo(1 - pForward, 1) : pForward

  envelope = enterExitEnvelope(p)
  focus = compiledFractionalFocus(p, spotlightIndex, finaleIndex)
  window = nearestOrderedWindow(focus, visibleWindow, mediaCount)
  pivot = resolveBelowStagePivot(canvas, pivotDepth)

  for source i in window, in source order:
    d = i - focus
    theta = d * effectiveFanStep * envelope.spread
    crown = smootherstep(1 - clamp(abs(d), 0, 1))
    bottom = pivot + rotate(upArm, theta)
    bottom += radialUp(theta) * presentationLift * crown
    opacity = envelope.opacity * windowFade(abs(d), visibleWindow)
    depth = depthFromCrownDistance(abs(d), direction, sourceIndex)
    emit stable identity, pose, source treatment, and resource demand
```

No geometry uses `round(focus)`. The nearest index is exposed separately for caption/focus announcements with hysteresis.

## Focus compilation

For the representative phrase with spotlight index `s` and finale index `f`:

```text
0.00–0.08: focus = 0; hand enters
0.08–0.34: focus = mix(0, s, smootherstep(local))
0.34–0.46: focus = s; spotlight crown hold
0.46–0.82: focus = mix(s, f, smootherstep(local))
0.82–0.92: focus = f; finale crown hold
0.92–1.00: focus = f; hand exits to common hidden pivot
```

Without spotlight, merge the first two travel spans into one monotonic focus path. With multiple spotlights, compiler inserts ordered approach/hold/departure spans. It never changes source order or asks the evaluator to infer events from hover.

## Pivot and path equations

Let canvas be `W × H`, short axis `S`, portrait flag `q`, effective step `a`, and pivot-depth control `d_p` as a fraction.

```text
pivotX = W / 2
pivotY = H * (1 + d_p + portraitExtra)
armLength = H * (0.62 + d_p + portraitArmExtra)
theta_i = (i - focus) * a * spreadEnvelope
baseBottom_i = (pivotX + sin(theta_i) * armLength,
                pivotY - cos(theta_i) * armLength)
crown_i = smootherstep(1 - clamp(abs(i - focus), 0, 1))
lift_i = S * presentationLift * crown_i
bottom_i = baseBottom_i + (sin(theta_i), -cos(theta_i)) * lift_i
```

Portrait lowers horizontal spread and increases arm depth. This is a new projection, not a rotated landscape hand.

## Depth, opacity, and order

```text
windowRadius = floor(visibleWindow / 2)
windowOpacity = 1 - smootherstep((abs(d) - (windowRadius - 0.75)) / 0.75)
depthScore = 100000 * crown + 1000 * (1 - min(abs(d), 10)/10)
tie = direction == forward ? sourceIndex : -sourceIndex
zOrder = stableSort(depthScore, tie)
```

At every declared crown hold: container opacity `1`; artwork opacity `1`; filter `none`; blend `normal`. Fading occurs only during offstage guard entry/exit, never on the readable crown artwork.

## Timeline modes

### Automatic

Base travel uses Product pace and source count. Compiler guarantees minimum entry/exit and authored hold intervals. Default study remains 9.5 s for five sources.

### Fixed duration

Hold minimums remain literal. Remaining travel duration is distributed by source-index distance. All normalized checkpoints are recomputed from durations, not uniformly stretched keyframes. Impossible requests fail clearly rather than deleting readability.

### Directed

Cycle segments advance focus by declared source-index distance. Hold segments pin exact identity and zero velocity. The fast ×2 / regular ×1 / fast ×1 casino rhythm is allowed only when it produces legible handoffs; the compiler may place authored holds between those cycle spans without misreporting them as cycles.

## Exact reverse

Reverse uses `evaluateForward(D - t)` after positive-modulo normalization. Spatial source order stays unchanged. At a fractional handoff, the same two cards occupy the same poses and depths; only temporal derivative changes sign. There is no reverse-only z-index table.

## Finite and loop behavior

- **Finite:** evaluate clamped time. At terminal hold, keep the final crown pose when Product requests hold; otherwise complete the common-pivot exit.
- **Repeat/loop:** evaluate modulo `D`. Entry-hidden and seam are bitwise-equal canonical states. The visible discontinuity is avoided because both sides have zero container opacity and identical collapsed pose.
- **One card:** focus remains zero; entry, crown, hold, and return still use the radial arm.

## Source-video time

```text
sourceSeconds = loopVideo
  ? positiveModulo(storyTimeSeconds - sourceIn, sourceDuration)
  : clamp(storyTimeSeconds - sourceIn, 0, sourceDuration)
```

Focus, hold, windowing, and reduced motion do not seek or pause video unless Product Timeline explicitly says so.

## Preview, scrub, and fixed-step output

Preview scheduling may request animation frames, but passes explicit story time. Scrub evaluates exact requested time. Fixed-step sampling uses `t_n = n / fps`; no previous frame is required. Same config + media + canvas + time must produce byte-identical canonical JSON.

## Representative pose/depth/opacity/order tables

### Ordinary five-card, wide canvas, fractional handoff

| Source role | Angular role | Crown weight | Container alpha | Depth rule | Artwork |
| --- | --- | ---: | ---: | --- | --- |
| outgoing crown | small negative angle | 0–1 | 1 | trades continuously with incoming | normal / 1 / none |
| incoming crown | small positive angle | 0–1 | 1 | trades continuously with outgoing | normal / 1 / none |
| near neighbour | one step away | 0 | 1 | below crown pair | normal / 1 / none |
| guard | window edge | 0 | 0–1 | below visible hand | may fade as container |

### Mixed ratios

| Ratio | Bottom-centre | Width | Height | Reorder? |
| --- | --- | --- | --- | --- |
| 2.39:1 | same radial arm | Scene width | derived shorter | never |
| 1:1 | same radial arm | Scene width | equal width | never |
| 9:16 | same radial arm | Scene width | derived taller | never |

### Portrait canvas

| Property | Wide | Portrait |
| --- | --- | --- |
| effective step | default | reduced to avoid side clipping |
| pivot | below stage | deeper below stage |
| card size | default | reduced within declared floor |
| crown | above centre | upper-middle with safe margin |
| source order | stable | stable |

## Mechanical invariants

1. Same input/time equality.
2. Start equals seam.
3. Reverse samples exact forward pose.
4. Fractional focus never rounds geometry.
5. Window source identities remain ordered and bounded at 127 sources.
6. Crown handoff has no teleport or z-order theft.
7. Each control changes only its declared causal family and Reset restores defaults.
8. Readable crown artwork remains source-faithful.

## Final gauntlet implementation truth

The equations and phase diagrams above remain the candidate charter model. Exact current prototype authority is the pure evaluator plus `evidence/canonical-readback.json`; rounded tables are explanatory, not an alternate implementation.

| Compilation | Duration | Hold policy |
| --- | ---: | --- |
| automatic | 9,500 ms | Scene-authored literal holds |
| fixed validation fixture | 12,347 ms exactly | holds stay literal; travel absorbs the requested duration |
| directed | 8,740 ms | fast entry/exit around the regular readable phrase |

Literal hold total: 2,090 ms. Impossible fixed targets fail validation rather than compressing readable holds. Reverse evaluates the same quantized oriented story time at `D - t`; seams are exact in all three modes.

The evaluator derives pivot, arm, ratio-aware card width, lift, and fan step from full rotated-card bounds across the complete handoff. The crown stays readable and in-stage while the pivot remains perceptibly below stage.

The active seven-source hand includes offstage guards. Fractional focus retains global ordered identity; guard changes occur outside the crown/readable zone and forward/reverse traverse the exact inverse handoff.

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
