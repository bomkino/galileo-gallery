# Timeline and pure evaluator — Proximity Orbit

## Authority

Pure evaluator inputs: validated Scene config, ordered media, compiled Timeline, canvas, explicit story time. Hover, pointer, wall clock, rAF history, observer state, and prior frame are forbidden inputs.

## Canonical phrase

Candidate seven-card automatic duration: `D = 9,000 ms`.

| Checkpoint | `p` | Meaning |
| --- | ---: | --- |
| hidden seam | 0.000 | collapsed/transparent |
| path established | 0.080 | full path, source 0 near |
| near approach | 0.260 | authored source in slowed final approach |
| spotlight near | 0.360 | authored source at near gate |
| hold end | 0.480 | same near pose, departure begins |
| later far/near transfer | 0.660 | path travels toward finale |
| finale near | 0.860 | final source near |
| exit | 0.960 | path collapses |
| seam | 1.000 | exact equality with 0.000 |

## Phase and local speed law

Bring source `i` to near gate using the next non-decreasing cyclic turn satisfying `(i/n + turn) mod 1 = 0`. Travel does not use a uniform ease.

For proximity strength `k ∈ [0,1]`:

```text
nearAngleShare = 0.14 + 0.14k
nearTimeShare  = 0.26 + 0.20k
approach(u):
  if u < 1 - nearTimeShare:
    cover 1 - nearAngleShare using smootherstep(u / (1-nearTimeShare))
  else:
    cover final nearAngleShare using smootherstep(local)
depart(u) = 1 - approach(1-u)
travelBetweenNearGates(u) =
  u < 0.5 ? 0.5 * depart(2u)
          : 0.5 + 0.5 * approach(2u - 1)
```

This reserves more real time for the final near approach/first departure while global duration remains Timeline-owned.

## Compiled turn

```text
0.00–0.08: assembly 0→1, turn 0
0.08–0.36: turn 0→spotlightTurn via approach
0.36–0.48: spotlight hold
0.48–0.84: spotlightTurn→finaleTurn via travelBetweenNearGates
0.84–0.92: finale hold
0.92–1.00: assembly 1→0, turn held
```

No spotlight: compile continuous ordered turns using the same near-gate speed law.

## Path/camera equations

Let `φ = TAU*d/m + π/2`, horizontal radius `R`, projection control `q`, camera-depth radius `Rz`, vertical radius `Ry`, and assembly `A`.

```text
xPath = R cos φ
zPath = Rz sin φ
Ry = R * (0.16 + 0.36q)
Rz = R * (0.70 + 0.55q)
yPath = Ry sin φ + 0.08R cos(2φ)

distance = cameraDistance - zPath
perspective = clamp(cameraDistance / distance, 0.62, 1.34)
frontness = (sin φ + 1) / 2
nearKernel = smootherstep(frontness)^2
nonlinear = 1 + 0.42k * nearKernel
rawScale = perspective * nonlinear
safeScale = min(rawScale, ratioAwareCanvasCap)

x = centreX + A*xPath
y = centreY + A*yPath
depth = A*zPath
containerAlpha = A * (0.18 + 0.82 * frontness^1.9)
zOrder = stableSort(depth, sourceIndex)
```

At exact near gate, container alpha is one. Lighting is absent.

## Bounded source mapping

- Up to 20 sources: every source uses a stable path phase.
- Above 20: mount 16 cyclic identities around continuous near identity and map their continuous cyclic distances around 16 path slots. Entry/exit is at far guard alpha. All 127 identities remain in ordered focus calculation.

## Timeline modes

### Automatic

Count and Product pace determine total travel; local near-time allocation remains a normalized Scene law. Minimum entry/exit 450 ms, spotlight 700 ms, finale 900 ms.

### Fixed duration

Preserve holds and near-angle minimum time. Compress far travel before near travel. Reject impossible duration rather than erase readability.

### Directed

Cycle segments supply signed path-turn distance. Hold segments pin identity at near gate. Fast casino segments may traverse far arcs; regular segment must own the readable near passage.

## Exact reverse, loop, finite

Reverse evaluates forward at `D-t` after positive modulo. It reproduces position, scale cap, alpha, and z-order exactly. Loop start/seam are collapsed equal states. Finite terminal hold may stop at finale near pose before exit.

## Spotlight/finale fidelity

Near source: maximum depth, bounded maximum scale, highest z, container opacity one, artwork opacity one, filter none, normal blend. Shoulder/far context remains; no flattening.

## Source-video time

Product story time determines source frame. Near speed shaping affects card phase only, not video playback rate. Fixed-step output samples media and geometry at the same rational time.

## Preview/scrub/fixed-step

Preview may use rAF solely to propose explicit time. Scrub is direct. Fixed-step is stateless `t_n=n/fps`. Same input/time yields byte-identical canonical state.

## Representative tables

### Seven-source wide

| Role | Depth | Scale law | Alpha | Speed allocation | Artwork |
| --- | ---: | --- | ---: | --- | --- |
| near | max | perspective × nonlinear, capped | 1 | slow/hold | normal / 1 / none |
| shoulder | mid | geometric + small kernel | derived | transition | unchanged |
| far | min | geometric small | ≥0.18 | faster | unchanged inside container |

### Mixed ratios at near

| Ratio | Base width | Height | Safe cap behavior |
| --- | --- | --- | --- |
| 2.39:1 | shared | short | width bound may cap |
| 1:1 | shared | equal | default cap |
| 9:16 | shared | tall | height bound caps earlier |

### Portrait

| Property | Wide | Portrait |
| --- | --- | --- |
| horizontal radius | short-axis based | short-axis based |
| vertical/depth projection | default | strengthened |
| centreY | lower-middle | safe lower-middle |
| card size | default | reduced |
| scale cap | canvas/ratio | stricter height cap |

## Invariants

1. Same input/time equality.
2. Exact start/seam.
3. Exact reverse.
4. Near scale bounded and collision-safe.
5. Near source alpha/fidelity exact.
6. Local near speed differs causally from far speed.
7. 127-source order preserved with 16 mounted.
8. Controls and Reset causal/accurate.

## Final gauntlet implementation truth

The equations and phase diagrams above remain the candidate charter model. Exact current prototype authority is the pure evaluator plus `evidence/canonical-readback.json`; rounded tables are explanatory, not an alternate implementation.

| Compilation | Duration | Hold policy |
| --- | ---: | --- |
| automatic | 9,000 ms | Scene-authored literal holds |
| fixed validation fixture | 12,347 ms exactly | holds stay literal; travel absorbs the requested duration |
| directed | 8,280 ms | fast entry/exit around the regular readable phrase |

Literal hold total: 1,800 ms. Impossible fixed targets fail validation rather than compressing readable holds. Reverse evaluates the same quantized oriented story time at `D - t`; seams are exact in all three modes.

Camera-distance scale, nonlinear proximity response, ratio-aware size caps, path projection, and stage bounds compile together. The near card remains source-faithful and legible; legal controls cannot force clipping or non-finite geometry.

The 16-source large-set window spans the visible path. Mount handoffs occur only in far recession under a deterministic opacity guard; the nonlinear near passage never hides identity churn.

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
