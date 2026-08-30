# Timeline and pure evaluator — Wide Ellipse

## Authority

Pure inputs: validated Scene config, ordered media, compiled Timeline, canvas, and explicit story time. Wall clock, rAF history, hover, pointer, scroll, observer state, prior frame, and live GPU state are forbidden evaluator inputs.

## Canonical phrase

Candidate six-card automatic duration: `D = 9,600 ms`.

| Checkpoint | `p` | Meaning |
| --- | ---: | --- |
| hidden seam | 0.000 | coherent partial arc collapsed and transparent |
| ellipse established | 0.080 | full plane visible; ordinary ordered path |
| approach shoulder | 0.300 | featured source enters readable shoulder |
| spotlight front | 0.400 | featured source at analytical depth maximum |
| hold end | 0.500 | same pose; departure starts |
| later panoramic pass | 0.680 | featured yields; final source approaches |
| finale front | 0.860 | final source at same front gate |
| exit | 0.940 | plane contracts without reordering |
| seam | 1.000 | exact equality with 0.000 |

## Plane and front-gate equations

Let `A` and `B` be semi-major/minor axes, `α` yaw, `β` pitch, and source phase `θ`.

```text
local = (A cos θ, B sin θ, 0)

yaw around Y:
  x1 = A cos θ cos α
  y1 = B sin θ
  z1 = -A cos θ sin α

pitch around X:
  x = x1
  y = y1 cos β - z1 sin β
  z = y1 sin β + z1 cos β
```

Depth has the form:

```text
z(θ) = C cos θ + S sin θ
C = -A sin α cos β
S =  B sin β
Zmax = sqrt(C² + S²)
θfront = atan2(S, C)
```

The analytical `θfront` is the sole front gate. Approach/departure shoulder centres are `θfront ∓ 0.17τ` in the canonical study. No hidden interaction state can move the gate.

## Turn compilation

For source `i` among `n`, bring it to target angle `θt` with the next non-decreasing turn:

```text
targetTurn(i, θt, prior) = smallest k >= prior
  such that wrapτ(τ(i/n + k)) = θt
```

Canonical turn:

```text
0.00–0.08  assembly 0→1; turn held
0.08–0.30  ordinary turn → featured approach shoulder
0.30–0.40  shoulder → featured front gate
0.40–0.50  featured front hold
0.50–0.84  featured front → finale front through ordinary ellipse
0.84–0.92  finale front hold
0.92–1.00  turn held; assembly 1→0
```

Travel uses monotone smootherstep. Unlike Proximity Orbit, no local nonlinear near-speed law exists; shoulder/front readability comes from authored segment allocation and geometric perspective.

## Perspective, alpha, and order

```text
frontness = clamp((z / Zmax + 1) / 2, 0, 1)
perspective = clamp(cameraDistance / (cameraDistance - z), 0.72, 1.28)
scale = min(perspective, ratioAwareCanvasCap)
containerAlpha = assembly * (0.32 + 0.68 * smootherstep(frontness))
zOrder = stableSort(depth, sourceIndex)
```

At exact front: container alpha `1`. Artwork remains opacity `1`, filter `none`, blend `normal` for every card. Rear falloff never changes artwork pixels.

## Count/window mapping

For `n <= 24`, evaluate and mount all sources at `θi = τ(i/n + turn)`. For `n > 24`, compute continuous source identity at `θfront`, mount 18 cyclic neighbours, and remap their ordered cyclic distances across 18 path slots. Full source identity still advances through the front gate; rear guard slots are the only mount boundary.

## Automatic, fixed, directed

- **Automatic:** Product count/pace compiles one complete phrase; candidate six-source duration 9,600 ms.
- **Fixed:** hold durations stay literal; travel segments absorb scale. Minimum 3,800 ms with both holds.
- **Directed:** cycle segments advance continuous turn; hold segments pin selected source at front gate. Fast casino segments may compress rear arcs, never invert or skip source order.
- **Finite:** terminal phrase holds finale at front or performs authored exit according to Timeline intent.
- **Loop:** exit reaches exact hidden seam, then repeats.

## Reverse, preview, scrub, fixed-step

```text
phaseForward(t) = mod(t, D) / D
phaseReverse(t) = mod(1 - phaseForward(t), 1)
poseReverse(t) = poseForward(D - t)
```

Preview play may use rAF to propose `timeMs`; scrub supplies explicit `timeMs`; fixed-step export samples `n/fps`. All invoke the same evaluator.

## Source-video time

Scene never changes source-video transport:

```text
sourceSeconds = loop ? positiveModulo(storySeconds, sourceDuration)
                     : min(storySeconds, sourceDuration)
```

No path angle, shoulder, hold, or depth state modifies video time.

## Canonical pose/depth/opacity/order tables

Values below are emitted by the candidate evaluator and rounded to make review legible. `z` order means back-to-front stable rank; artwork state is always `1 / none / normal`.

### Ordinary six, wide canvas, featured front (`p = 0.400`)

| Source | Role | Centre x/y (px) | Depth (px) | Scale | Container α | z rank |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 0 | rear | 945 / 498 | -120.69 | 0.928 | 0.390 | 2 |
| 1 | approach shoulder | 443 / 453 | 120.69 | 1.084 | 0.930 | 4 |
| 2 | front gate | 138 / 322 | 241.38 | 1.184 | 1.000 | 6 |
| 3 | departure shoulder | 335 / 236 | 120.69 | 1.084 | 0.930 | 5 |
| 4 | rear | 837 / 281 | -120.69 | 0.928 | 0.390 | 3 |
| 5 | far rear | 1,142 / 412 | -241.38 | 0.865 | 0.320 | 1 |

### Mixed ratios, wide canvas, later pass (`p = 0.680`)

| Source ratio | Centre path | Base w/h | Safe cap | Depth/α policy |
| --- | --- | --- | ---: | --- |
| 2.39 | 190 / 368 | 151.2 / 63.3 | 1.28 | front, 226.68 / 1.000 |
| 0.75 | 215 / 253 | 151.2 / 201.6 | 1.28 | shoulder, 185.17 / 0.991 |
| 1.00 | 665 / 252 | 151.2 / 151.2 | 1.28 | rear, -41.52 / 0.552 |
| 1.78 | 1,090 / 366 | 151.2 / 85.1 | 1.28 | rear, -226.68 / 0.320 |
| 0.80 | 1,065 / 482 | 151.2 / 189.0 | 1.28 | rear, -185.17 / 0.329 |
| 1.50 | 615 / 483 | 151.2 / 100.8 | 1.28 | shoulder, 41.52 / 0.768 |

### Mixed ratios, portrait canvas, ellipse established (`p = 0.080`)

| Source | Centre x/y (px) | Effective axes (px) | Scale/cap | In safe stage |
| --- | ---: | ---: | ---: | --- |
| 0 | 634 / 671 | 576 / 563.2 | 0.907 / 1.28 | yes |
| 1 | 497 / 883 | 576 / 563.2 | 1.062 / 1.28 | yes |
| 2 | 223 / 852 | 576 / 563.2 | 1.193 / 1.28 | yes |
| 3 | 86 / 609 | 576 / 563.2 | 1.115 / 1.28 | yes |
| 4 | 223 / 397 | 576 / 563.2 | 0.945 / 1.28 | yes |
| 5 | 497 / 428 | 576 / 563.2 | 0.861 / 1.28 | yes |

## Final gauntlet implementation truth

The equations and phase diagrams above remain the candidate charter model. Exact current prototype authority is the pure evaluator plus `evidence/canonical-readback.json`; rounded tables are explanatory, not an alternate implementation.

| Compilation | Duration | Hold policy |
| --- | ---: | --- |
| automatic | 9,600 ms | Scene-authored literal holds |
| fixed validation fixture | 12,347 ms exactly | holds stay literal; travel absorbs the requested duration |
| directed | 8,832 ms | fast entry/exit around the regular readable phrase |

Literal hold total: 1,728 ms. Impossible fixed targets fail validation rather than compressing readable holds. Reverse evaluates the same quantized oriented story time at `D - t`; seams are exact in all three modes.

Requested ellipse axes and card size now share one stage-safety budget. The projected plane scales before card centres or full card bounds leave the stage, and readback exposes requested/effective axes plus `pathScale`. Front and both shoulders remain readable.

The 18-source large-set window spans the full panoramic path rather than crowding the front. Rear-arc opacity guards hide mount handoffs while global ordered identity remains continuous.

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


## Bounded-many coverage correction

For `n > 24`, the post-feature phrase now sets the finale target's prior turn to at least
`featuredTurn + 1`. This forces one complete ordered panoramic revolution before finale resolution.
A 4,096-sample gate observes all 127 source identities in the active window. Rear guard opacity
begins deeper in recession so faster window handoffs remain below the visible threshold.
